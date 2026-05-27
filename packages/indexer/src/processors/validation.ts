import { type Log, decodeEventLog } from 'viem'
import { CONTRACTS, VALIDATION_EVENTS } from '@arc-hive/shared'
import * as db from '../db/queries.js'

const validationAbi = [
  VALIDATION_EVENTS.ValidationRequest,
  VALIDATION_EVENTS.ValidationResponse,
]

export async function processValidationLog(log: Log, blockTimestamp: Date) {
  const contract = CONTRACTS.VALIDATION_REGISTRY

  try {
    const decoded = decodeEventLog({
      abi: validationAbi,
      data: log.data,
      topics: log.topics,
    })

    switch (decoded.eventName) {
      case 'ValidationRequest': {
        const { validatorAddress, agentId, requestURI, requestHash } = decoded.args as {
          validatorAddress: string
          agentId: bigint
          requestURI: string
          requestHash: string
        }
        await db.upsertValidationRequest({
          agentId,
          validatorAddress: validatorAddress.toLowerCase(),
          requestHash,
          requestUri: requestURI || null,
          requestBlock: BigInt(log.blockNumber!),
          requestTimestamp: blockTimestamp,
          requestTx: log.transactionHash!,
          sourceContract: contract,
        })
        break
      }

      case 'ValidationResponse': {
        const args = decoded.args as {
          validatorAddress: string
          agentId: bigint
          requestHash: string
          response: number
          responseURI: string
          responseHash: string
          tag: string
        }
        await db.updateValidationResponse({
          requestHash: args.requestHash,
          responseStatus: args.response,
          responseUri: args.responseURI || null,
          responseHash: args.responseHash || null,
          responseTag: args.tag || null,
          respondedAt: blockTimestamp,
          responseBlock: BigInt(log.blockNumber!),
          responseTx: log.transactionHash!,
          sourceContract: contract,
        })
        break
      }
    }
  } catch (err) {
    const msg = (err as Error).message
    if (msg.includes('not found on ABI')) return
    console.error(`[Validation] Failed to process log in tx ${log.transactionHash}:`, msg)
  }
}
