import { type Log, decodeEventLog } from 'viem'
import { CONTRACTS, REPUTATION_EVENTS } from '@arc-hive/shared'
import * as db from '../db/queries.js'

const reputationAbi = [
  REPUTATION_EVENTS.NewFeedback,
  REPUTATION_EVENTS.FeedbackRevoked,
  REPUTATION_EVENTS.ResponseAppended,
]

export async function processReputationLog(log: Log, blockTimestamp: Date) {
  const contract = CONTRACTS.REPUTATION_REGISTRY

  try {
    const decoded = decodeEventLog({
      abi: reputationAbi,
      data: log.data,
      topics: log.topics,
    })

    switch (decoded.eventName) {
      case 'NewFeedback': {
        const args = decoded.args as {
          agentId: bigint
          clientAddress: string
          feedbackIndex: bigint
          value: bigint
          valueDecimals: number
          indexedTag1: string
          tag1: string
          tag2: string
          endpoint: string
          feedbackURI: string
          feedbackHash: string
        }
        await db.insertReputationEvent({
          agentId: args.agentId,
          clientAddress: args.clientAddress.toLowerCase(),
          feedbackIndex: args.feedbackIndex,
          value: Number(args.value),
          valueDecimals: args.valueDecimals,
          tag1: args.tag1 || null,
          tag2: args.tag2 || null,
          endpoint: args.endpoint || null,
          feedbackUri: args.feedbackURI || null,
          feedbackHash: args.feedbackHash || null,
          blockNumber: BigInt(log.blockNumber!),
          blockTimestamp,
          txHash: log.transactionHash!,
          sourceContract: contract,
        })
        break
      }

      case 'FeedbackRevoked': {
        const { agentId, clientAddress, feedbackIndex } = decoded.args as {
          agentId: bigint
          clientAddress: string
          feedbackIndex: bigint
        }
        await db.revokeFeedback(agentId, clientAddress.toLowerCase(), feedbackIndex, contract)
        break
      }

      case 'ResponseAppended': {
        const args = decoded.args as {
          agentId: bigint
          clientAddress: string
          feedbackIndex: bigint
          responder: string
          responseURI: string
          responseHash: string
        }
        await db.insertReputationResponse({
          agentId: args.agentId,
          clientAddress: args.clientAddress.toLowerCase(),
          feedbackIndex: args.feedbackIndex,
          responderAddress: args.responder.toLowerCase(),
          responseUri: args.responseURI || null,
          responseHash: args.responseHash || null,
          blockNumber: BigInt(log.blockNumber!),
          blockTimestamp,
          txHash: log.transactionHash!,
          sourceContract: contract,
        })
        break
      }
    }
  } catch (err) {
    const msg = (err as Error).message
    if (msg.includes('not found on ABI')) return
    console.error(`[Reputation] Failed to process log in tx ${log.transactionHash}:`, msg)
  }
}
