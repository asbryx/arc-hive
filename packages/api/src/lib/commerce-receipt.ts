import { decodeEventLog, parseAbiItem } from 'viem'

const AGENTIC_COMMERCE = '0x0747eef0706327138c69792bf28cd525089e4583'

const COMMERCE_EVENTS = [
  parseAbiItem('event JobCreated(uint256 indexed jobId, address indexed client, address indexed provider, address evaluator, uint256 expiredAt, address hook)'),
  parseAbiItem('event JobFunded(uint256 indexed jobId, address indexed client, uint256 amount)'),
  parseAbiItem('event JobSubmitted(uint256 indexed jobId, address indexed provider, bytes32 deliverable)'),
  parseAbiItem('event JobCompleted(uint256 indexed jobId, address indexed evaluator, bytes32 reason)'),
] as const

type ReceiptLike = {
  status: string
  logs: Array<{ address: string; data: `0x${string}`; topics: readonly `0x${string}`[] }>
}

export function hasCommerceEvent(
  receipt: ReceiptLike,
  eventName: 'JobCreated' | 'JobFunded' | 'JobSubmitted' | 'JobCompleted',
  jobId: bigint,
  actorAddress?: string
): boolean {
  if (receipt.status !== 'success') return false

  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== AGENTIC_COMMERCE) continue
    try {
      const decoded = decodeEventLog({
        abi: COMMERCE_EVENTS,
        data: log.data,
        topics: log.topics as unknown as [`0x${string}`, ...`0x${string}`[]],
      })
      const args = decoded.args as { jobId: bigint; client?: string; provider?: string }
      if (decoded.eventName !== eventName || args.jobId !== jobId) continue
      if ((eventName === 'JobCreated' || eventName === 'JobFunded') && args.client?.toLowerCase() !== actorAddress?.toLowerCase()) continue
      if (eventName === 'JobSubmitted' && args.provider?.toLowerCase() !== actorAddress?.toLowerCase()) continue
      return true
    } catch {
      // unrelated log
    }
  }
  return false
}

export function hasSubmittedDeliverable(
  receipt: ReceiptLike,
  jobId: bigint,
  providerAddress: string,
  deliverableHash: `0x${string}`
): boolean {
  if (receipt.status !== 'success') return false

  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== AGENTIC_COMMERCE) continue
    try {
      const decoded = decodeEventLog({
        abi: COMMERCE_EVENTS,
        data: log.data,
        topics: log.topics as unknown as [`0x${string}`, ...`0x${string}`[]],
      })
      if (decoded.eventName !== 'JobSubmitted') continue
      const args = decoded.args as { jobId: bigint; provider: string; deliverable: `0x${string}` }
      if (args.jobId !== jobId) continue
      if (args.provider.toLowerCase() !== providerAddress.toLowerCase()) continue
      if (args.deliverable.toLowerCase() !== deliverableHash.toLowerCase()) continue
      return true
    } catch {
      // unrelated log
    }
  }
  return false
}
