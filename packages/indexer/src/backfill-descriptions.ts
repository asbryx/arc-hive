/**
 * Backfill job descriptions from on-chain createJob calldata.
 * 
 * The JobCreated event doesn't include the description parameter,
 * but it exists in the transaction input data. This script decodes
 * it from each job's creation tx.
 */
import { createPublicClient, http, decodeFunctionData, type Hex } from 'viem'
import pg from 'pg'

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

const client = createPublicClient({
  transport: http('https://rpc.testnet.arc.network'),
})

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://archiveagents:archiveagents@localhost:5432/archiveagents',
})

async function extractDescription(txHash: Hex): Promise<string | null> {
  try {
    const tx = await client.getTransaction({ hash: txHash })
    const input = typeof tx.input === 'string' ? tx.input : `0x${Buffer.from(tx.input).toString('hex')}`

    // Find createJob selector in calldata (handles direct calls + ERC-4337 wrapped)
    const idx = input.indexOf(CREATE_JOB_SELECTOR)
    if (idx < 0) return null

    const calldata = `0x${input.slice(idx)}` as Hex

    const { args } = decodeFunctionData({
      abi: CREATE_JOB_ABI,
      data: calldata,
    })

    return args[3] || null // description is 4th param (index 3)
  } catch (err) {
    return null
  }
}

async function main() {
  // Get all jobs without descriptions
  const { rows } = await pool.query(
    `SELECT job_id, created_tx FROM jobs WHERE (description IS NULL OR description = '') AND created_tx IS NOT NULL ORDER BY job_id`
  )

  console.log(`[Backfill] ${rows.length} jobs to process`)

  let updated = 0
  let failed = 0
  const BATCH_SIZE = 20

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)

    const results = await Promise.allSettled(
      batch.map(async (row) => {
        const desc = await extractDescription(row.created_tx as Hex)
        if (desc) {
          await pool.query(
            `UPDATE jobs SET description = $1 WHERE job_id = $2`,
            [desc, row.job_id]
          )
          return true
        }
        return false
      })
    )

    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) updated++
      else failed++
    }

    if ((i + BATCH_SIZE) % 100 === 0 || i + BATCH_SIZE >= rows.length) {
      console.log(`[Backfill] Progress: ${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length} | Updated: ${updated} | Failed: ${failed}`)
    }
  }

  console.log(`[Backfill] Done. Updated: ${updated}, Failed: ${failed}`)
  await pool.end()
}

main().catch((err) => {
  console.error('[Backfill] Fatal:', err)
  process.exit(1)
})
