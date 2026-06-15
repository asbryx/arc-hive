#!/usr/bin/env tsx
/**
 * backfill-payouts.ts
 *
 * One-shot script to forward USDC from PLATFORM_RELAY → agent for every
 * `completed` job that was never paid out. Created to retroactively pay the
 * ~11.49 USDC stuck on the relay after the T9 audit fix.
 *
 * Idempotent: re-running after a successful pass is a no-op. Uses the same
 * (claim → send → record) helpers as the live evaluator path, so a row that
 * already has `payout_tx` set is skipped.
 *
 * Usage (from repo root):
 *   pnpm --filter @arc-hive/evaluator exec tsx ../../scripts/backfill-payouts.ts
 *
 *   # dry run: show what would be sent, do nothing on-chain
 *   pnpm --filter @arc-hive/evaluator exec tsx ../../scripts/backfill-payouts.ts --dry-run
 *
 * Requires env: DATABASE_URL, PROVIDER_PRIVATE_KEY, ARC_RPC_URL.
 *
 * Safety checks before sending:
 *   1. Recipient is a valid 0x-address
 *   2. Amount > 0
 *   3. Relay's actual USDC balance covers the total queued payouts
 *   4. Per-job atomic claim — no double-send on retry / concurrent runs
 */

import 'dotenv/config'
import { createPublicClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import {
  getUnpaidCompletedJobs,
  claimPayoutSlot,
  recordPayoutTx,
  releasePayoutSlot,
  closePool,
} from '../packages/evaluator/src/db.js'
import { executePayoutForward, USDC_ADDRESS } from '../packages/evaluator/src/execute.js'
import { CONFIG } from '../packages/evaluator/src/config.js'

const DRY_RUN = process.argv.includes('--dry-run')

const arcChain = {
  id: CONFIG.CHAIN_ID,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'ARC', symbol: 'ARC', decimals: 18 },
  rpcUrls: { default: { http: [CONFIG.RPC_URL] } },
}

const ERC20_BALANCE_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

function fmtUsdc(baseUnits: bigint): string {
  // 6 decimals
  const whole = baseUnits / 1_000_000n
  const frac = baseUnits % 1_000_000n
  return `${whole}.${frac.toString().padStart(6, '0')}`
}

async function main() {
  if (!CONFIG.PROVIDER_PRIVATE_KEY) {
    throw new Error('PROVIDER_PRIVATE_KEY not set')
  }

  const relayAccount = privateKeyToAccount(CONFIG.PROVIDER_PRIVATE_KEY as `0x${string}`)
  const publicClient = createPublicClient({ chain: arcChain, transport: http(CONFIG.RPC_URL) })

  console.log(`[backfill] mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`)
  console.log(`[backfill] relay address: ${relayAccount.address}`)

  const relayBalance = (await publicClient.readContract({
    address: USDC_ADDRESS,
    abi: ERC20_BALANCE_ABI,
    functionName: 'balanceOf',
    args: [relayAccount.address],
  })) as bigint
  console.log(`[backfill] relay USDC balance: ${fmtUsdc(relayBalance)} USDC (${relayBalance} base units)`)

  const jobs = await getUnpaidCompletedJobs()
  console.log(`[backfill] found ${jobs.length} unpaid completed job(s)`)

  if (jobs.length === 0) {
    console.log('[backfill] nothing to do')
    await closePool()
    return
  }

  // Pre-flight: sum total owed and refuse if relay can't cover.
  let totalOwed = 0n
  const queued: Array<{ id: number; recipient: string; amount: bigint; jobOnChainId: any; title: string }> = []
  for (const job of jobs) {
    const recipient = (job.selected_applicant || '').toLowerCase()
    if (!/^0x[a-f0-9]{40}$/.test(recipient)) {
      console.warn(`[backfill] job ${job.id}: invalid selected_applicant=${job.selected_applicant} — skipping`)
      continue
    }
    if (!job.final_budget) {
      console.warn(`[backfill] job ${job.id}: missing final_budget — skipping`)
      continue
    }
    const amount = BigInt(String(job.final_budget))
    if (amount <= 0n) {
      console.warn(`[backfill] job ${job.id}: non-positive final_budget=${job.final_budget} — skipping`)
      continue
    }
    totalOwed += amount
    queued.push({ id: job.id, recipient, amount, jobOnChainId: job.job_id, title: job.title })
  }

  console.log(`[backfill] queued payouts: ${queued.length}, total = ${fmtUsdc(totalOwed)} USDC`)
  for (const q of queued) {
    console.log(`[backfill]   - job ${q.id} (on-chain ${q.jobOnChainId}, "${q.title}") → ${q.recipient}: ${fmtUsdc(q.amount)} USDC`)
  }

  if (totalOwed > relayBalance) {
    throw new Error(
      `Relay balance ${fmtUsdc(relayBalance)} < total owed ${fmtUsdc(totalOwed)} — refusing to start partial backfill. ` +
        `Top up relay or fix bad rows first.`,
    )
  }

  if (DRY_RUN) {
    console.log('[backfill] DRY RUN — exiting without sending any transfers')
    await closePool()
    return
  }

  let succeeded = 0
  let failed = 0

  for (const q of queued) {
    try {
      // Atomic claim — re-running this script concurrently with a live
      // evaluator is safe; only one will win the row.
      const claimed = await claimPayoutSlot(q.id, q.recipient, q.amount)
      if (!claimed) {
        console.log(`[backfill] job ${q.id}: already claimed by another worker — skipping`)
        continue
      }

      const txHash = await executePayoutForward(q.recipient as `0x${string}`, q.amount)
      await recordPayoutTx(q.id, txHash)
      console.log(`[backfill] job ${q.id}: PAID ${fmtUsdc(q.amount)} USDC → ${q.recipient} — tx=${txHash}`)
      succeeded++
    } catch (err: any) {
      failed++
      console.error(`[backfill] job ${q.id}: FAILED — ${err.message}`)
      // Release the claim so future runs can retry.
      await releasePayoutSlot(q.id).catch(() => {})
    }
  }

  console.log(`[backfill] done — succeeded=${succeeded}, failed=${failed}`)
  await closePool()

  if (failed > 0) {
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('[backfill] fatal:', err)
  process.exit(1)
})
