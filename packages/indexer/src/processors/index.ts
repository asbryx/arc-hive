import { type Log } from 'viem'
import { CONTRACTS } from '@arc-hive/shared'
import { processIdentityLog } from './identity.js'
import { processReputationLog } from './reputation.js'
import { processValidationLog } from './validation.js'
import { processCommerceLog } from './commerce.js'

type Processor = (log: Log, blockTimestamp: Date) => Promise<void>

const processorMap: Record<string, Processor> = {
  [CONTRACTS.IDENTITY_REGISTRY]: processIdentityLog,
  [CONTRACTS.REPUTATION_REGISTRY]: processReputationLog,
  [CONTRACTS.VALIDATION_REGISTRY]: processValidationLog,
  [CONTRACTS.AGENTIC_COMMERCE]: processCommerceLog,
}

export async function processLog(log: Log, blockTimestamp: Date): Promise<void> {
  const address = log.address?.toLowerCase()
  if (!address) return

  const processor = processorMap[address]
  if (!processor) return

  await processor(log, blockTimestamp)
}

export function getWatchedAddresses(): string[] {
  return Object.values(CONTRACTS).filter(a => a !== CONTRACTS.USDC) as string[]
}
