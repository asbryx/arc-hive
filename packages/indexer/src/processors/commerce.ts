import { type Log, decodeEventLog, decodeFunctionData, type AbiEvent, type Hex } from 'viem'
import { CONTRACTS, COMMERCE_EVENTS } from '@arc-hive/shared'
import * as db from '../db/queries.js'
import { getHttpClient } from '../clients/chain.js'
import { markDirty } from '../scoring/aggregator.js'

const CREATE_JOB_ABI = [{
  inputs: [
    { name: 'provider', type: 'address' },
    { name: 'evaluator', type: 'address' },
    { name: 'expiredAt', type: 'uint256' },
    { name: 'description', type: 'string' },
    { name: 'hook', type: 'address' },
  ],
  name: 'createJob',
  outputs: [{ name: '', type: 'uint256' }],
  stateMutability: 'nonpayable',
  type: 'function',
}] as const

const CREATE_JOB_SELECTOR = '41528812'

async function extractDescription(txHash: Hex): Promise<string | null> {
  try {
    const client = getHttpClient()
    const tx = await client.getTransaction({ hash: txHash })
    const input = typeof tx.input === 'string' ? tx.input : `0x${Buffer.from(tx.input as any).toString('hex')}`
    const idx = input.indexOf(CREATE_JOB_SELECTOR)
    if (idx < 0) return null
    const calldata = `0x${input.slice(idx)}` as Hex
    const { args } = decodeFunctionData({ abi: CREATE_JOB_ABI, data: calldata })
    return (args as any)[3] || null
  } catch {
    return null
  }
}

const commerceAbi = Object.values(COMMERCE_EVENTS) as AbiEvent[]

// Map status names to DB int
const STATUS_MAP = {
  Open: 0, Funded: 1, Submitted: 2, Completed: 3, Rejected: 4, Expired: 5,
} as const

export async function processCommerceLog(log: Log, blockTimestamp: Date) {
  const contract = CONTRACTS.AGENTIC_COMMERCE

  try {
    const decoded = decodeEventLog({
      abi: commerceAbi,
      data: log.data,
      topics: log.topics,
    })

    const args = decoded.args as any
    const jobId = args.jobId as bigint

    // Always insert audit trail
    await db.insertJobEvent({
      jobId,
      eventName: decoded.eventName,
      eventData: serializeArgs(args),
      blockNumber: BigInt(log.blockNumber!),
      blockTimestamp,
      txHash: log.transactionHash!,
      logIndex: log.logIndex!,
      sourceContract: contract,
    })

    const name = decoded.eventName as string

    if (name === 'JobCreated') {
      const description = await extractDescription(log.transactionHash! as Hex)
      await db.upsertJob({
        jobId: args.jobId,
        clientAddress: args.client.toLowerCase(),
        providerAddress: isZero(args.provider) ? null : args.provider.toLowerCase(),
        evaluatorAddress: isZero(args.evaluator) ? null : args.evaluator.toLowerCase(),
        description,
        expiredAt: new Date(Number(args.expiredAt) * 1000),
        hookAddress: isZero(args.hook) ? null : args.hook.toLowerCase(),
        createdBlock: BigInt(log.blockNumber!),
        createdTimestamp: blockTimestamp,
        createdTx: log.transactionHash!,
        sourceContract: contract,
      })
    } else if (name === 'ProviderSet') {
      await db.updateJobField(jobId, contract, 'provider_address', args.provider.toLowerCase())
    } else if (name === 'BudgetSet') {
      await db.updateJobField(jobId, contract, 'budget', args.amount.toString())
    } else if (name === 'JobFunded') {
      await db.updateJobField(jobId, contract, 'status', STATUS_MAP.Funded)
    } else if (name === 'JobSubmitted') {
      await db.updateJobFields(jobId, contract, {
        status: STATUS_MAP.Submitted,
        submitted_at: blockTimestamp,
        deliverable_hash: args.deliverable,
      })
    } else if (name === 'JobCompleted') {
      await db.updateJobFields(jobId, contract, {
        status: STATUS_MAP.Completed,
        completed_at: blockTimestamp,
        completion_reason: args.reason,
      })
      // Mark provider agent dirty for score recompute
      const jobRow = await db.getJobProviderAgent(jobId, contract)
      if (jobRow) markDirty(BigInt(jobRow))
    } else if (name === 'JobRejected') {
      await db.updateJobFields(jobId, contract, {
        status: STATUS_MAP.Rejected,
        rejected_at: blockTimestamp,
        rejection_reason: args.reason,
      })
      const jobRow = await db.getJobProviderAgent(jobId, contract)
      if (jobRow) markDirty(BigInt(jobRow))
    } else if (name === 'JobExpired') {
      await db.updateJobField(jobId, contract, 'status', STATUS_MAP.Expired)
    } else if (name === 'PaymentReleased') {
      await db.updateJobField(jobId, contract, 'payment_released', args.amount.toString())
    } else if (name === 'PlatformFeePaid') {
      await db.updateJobField(jobId, contract, 'platform_fee_paid', args.amount.toString())
    } else if (name === 'EvaluatorFeePaid') {
      await db.updateJobField(jobId, contract, 'evaluator_fee_paid', args.amount.toString())
    } else if (name === 'Refunded') {
      await db.updateJobField(jobId, contract, 'refund_amount', args.amount.toString())
    }
  } catch (err) {
    const msg = (err as Error).message
    if (msg.includes('not found on ABI')) return
    console.error(`[Commerce] Failed to process log in tx ${log.transactionHash}:`, msg)
  }
}

function isZero(addr: string): boolean {
  return !addr || addr === '0x0000000000000000000000000000000000000000'
}

function serializeArgs(args: any): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(args)) {
    if (typeof value === 'bigint') {
      result[key] = value.toString()
    } else {
      result[key] = value
    }
  }
  return result
}
