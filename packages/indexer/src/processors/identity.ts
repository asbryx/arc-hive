import { type Log, decodeEventLog } from 'viem'
import { CONTRACTS } from '@arc-hive/shared'
import { IDENTITY_EVENTS } from '@arc-hive/shared'
import * as db from '../db/queries.js'

const identityAbi = [
  IDENTITY_EVENTS.Registered,
  IDENTITY_EVENTS.Transfer,
  IDENTITY_EVENTS.URIUpdated,
  IDENTITY_EVENTS.MetadataSet,
]

export async function processIdentityLog(log: Log, blockTimestamp: Date) {
  const contract = CONTRACTS.IDENTITY_REGISTRY

  try {
    const decoded = decodeEventLog({
      abi: identityAbi,
      data: log.data,
      topics: log.topics,
    })

    switch (decoded.eventName) {
      case 'Registered': {
        const { agentId, agentURI, owner } = decoded.args as {
          agentId: bigint
          agentURI: string
          owner: string
        }
        await db.upsertAgent({
          agentId,
          ownerAddress: owner.toLowerCase(),
          metadataUri: agentURI || null,
          registeredAt: blockTimestamp,
          registeredBlock: BigInt(log.blockNumber!),
          registeredTx: log.transactionHash!,
          sourceContract: contract,
        })
        // Queue metadata fetch
        if (agentURI) {
          await db.enqueueMetadata(agentId, agentURI)
        }
        break
      }

      case 'Transfer': {
        const { from, to, tokenId } = decoded.args as {
          from: string
          to: string
          tokenId: bigint
        }
        // Skip mint events (from = 0x0) — handled by Registered
        if (from === '0x0000000000000000000000000000000000000000') break

        await db.updateAgentOwner(tokenId, to.toLowerCase(), contract)
        break
      }

      case 'URIUpdated': {
        const { agentId, newURI } = decoded.args as {
          agentId: bigint
          newURI: string
          updatedBy: string
        }
        await db.updateAgentUri(agentId, newURI, contract)
        if (newURI) {
          await db.enqueueMetadata(agentId, newURI)
        }
        break
      }

      case 'MetadataSet': {
        // Key-value metadata — store raw for now
        // Could parse specific keys in the future
        break
      }
    }
  } catch (err) {
    const msg = (err as Error).message
    // Silently skip unknown event signatures (Upgraded, OwnershipTransferred, etc.)
    if (msg.includes('not found on ABI')) return
    console.error(`[Identity] Failed to process log in tx ${log.transactionHash}:`, msg)
  }
}
