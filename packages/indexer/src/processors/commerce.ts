import { type Log, decodeEventLog, type AbiEvent } from 'viem'
import { CONTRACTS, COMMERCE_EVENTS } from '@arc-hive/shared'
import * as db from '../db/queries.js'

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
      await db.upsertJob({
        jobId: args.jobId,
        clientAddress: args.client.toLowerCase(),
        providerAddress: isZero(args.provider) ? null : args.provider.toLowerCase(),
        evaluatorAddress: isZero(args.evaluator) ? null : args.evaluator.toLowerCase(),
        description: null,
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
    } else if (name === 'JobRejected') {
      await db.updateJobFields(jobId, contract, {
        status: STATUS_MAP.Rejected,
        rejected_at: blockTimestamp,
        rejection_reason: args.reason,
      })
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
