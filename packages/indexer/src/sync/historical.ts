import { type Address, type Log } from 'viem'
import { CONTRACTS, DEPLOYMENT_BLOCKS } from '@arc-hive/shared'
import { getHttpClient } from '../clients/chain.js'
import { processLog, getWatchedAddresses } from '../processors/index.js'
import * as db from '../db/queries.js'

const CHUNK_SIZE = parseInt(process.env.SYNC_CHUNK_SIZE || '10000')
const MAX_RETRIES = parseInt(process.env.SYNC_RETRY_MAX || '5')
const RETRY_DELAY = parseInt(process.env.SYNC_RETRY_DELAY_MS || '1000')

interface SyncProgress {
  contract: string
  name: string
  fromBlock: bigint
  toBlock: bigint
  currentBlock: bigint
  eventsProcessed: number
}

let progress: SyncProgress[] = []

export function getSyncProgress(): SyncProgress[] {
  return progress
}

export async function runHistoricalSync(): Promise<void> {
  const client = getHttpClient()
  const headBlock = await client.getBlockNumber()
  const addresses = getWatchedAddresses() as Address[]

  console.log(`[Sync] Head block: ${headBlock}`)
  console.log(`[Sync] Starting historical sync for ${addresses.length} contracts`)

  // Sync each contract
  for (const address of addresses) {
    const state = await db.getSyncState(address)
    if (!state) {
      console.warn(`[Sync] No sync_state for ${address}, skipping`)
      continue
    }

    const startBlock = state.last_synced_block > 0
      ? BigInt(state.last_synced_block) + 1n
      : BigInt(state.deployment_block)

    if (startBlock >= headBlock) {
      console.log(`[Sync] ${state.contract_name}: already synced to head`)
      continue
    }

    console.log(`[Sync] ${state.contract_name}: syncing ${startBlock} → ${headBlock} (${headBlock - startBlock} blocks)`)
    await db.setSyncing(address, true)

    const contractProgress: SyncProgress = {
      contract: address,
      name: state.contract_name,
      fromBlock: startBlock,
      toBlock: headBlock,
      currentBlock: startBlock,
      eventsProcessed: 0,
    }
    progress.push(contractProgress)

    try {
      await syncContract(address, startBlock, headBlock, contractProgress)
    } catch (err) {
      console.error(`[Sync] ${state.contract_name}: fatal error`, (err as Error).message)
      await db.recordSyncError(address, (err as Error).message)
    } finally {
      await db.setSyncing(address, false)
    }
  }

  console.log(`[Sync] Historical sync complete`)
}

async function syncContract(
  address: string,
  fromBlock: bigint,
  toBlock: bigint,
  progress: SyncProgress
): Promise<void> {
  const client = getHttpClient()
  let currentFrom = fromBlock
  let chunkSize = BigInt(CHUNK_SIZE)

  while (currentFrom <= toBlock) {
    const currentTo = currentFrom + chunkSize - 1n > toBlock
      ? toBlock
      : currentFrom + chunkSize - 1n

    let logs: Log[] = []
    let retries = 0

    while (retries < MAX_RETRIES) {
      try {
        logs = await client.getLogs({
          address: address as Address,
          fromBlock: currentFrom,
          toBlock: currentTo,
        })
        break
      } catch (err) {
        const msg = (err as Error).message
        // If we hit the 20k result limit, halve chunk size
        if (msg.includes('max results') || msg.includes('too many')) {
          chunkSize = chunkSize / 2n
          if (chunkSize < 1n) chunkSize = 1n
          console.warn(`[Sync] Reducing chunk size to ${chunkSize} for ${address}`)
          break
        }
        retries++
        if (retries >= MAX_RETRIES) {
          console.error(`[Sync] Failed after ${MAX_RETRIES} retries at block ${currentFrom}:`, msg)
          await db.recordSyncError(address, msg)
          // Skip this chunk
          currentFrom = currentTo + 1n
          continue
        }
        await sleep(RETRY_DELAY * Math.pow(2, retries - 1))
      }
    }

    if (logs.length > 0) {
      // Get block timestamps for this batch
      const blockTimestamps = await getBlockTimestamps(client, logs)

      for (const log of logs) {
        const timestamp = blockTimestamps.get(log.blockNumber!) || new Date()
        await processLog(log, timestamp)
      }

      progress.eventsProcessed += logs.length
    }

    // Update sync state
    await db.updateSyncState(address, currentTo, logs.length)
    progress.currentBlock = currentTo

    // Log progress every 50 chunks
    if ((currentTo - fromBlock) % (chunkSize * 50n) === 0n || currentTo === toBlock) {
      const pct = Number((currentTo - fromBlock) * 100n / (toBlock - fromBlock))
      console.log(`[Sync] ${progress.name}: ${pct}% (block ${currentTo}, ${progress.eventsProcessed} events)`)
    }

    currentFrom = currentTo + 1n

    // Restore chunk size gradually
    if (chunkSize < BigInt(CHUNK_SIZE)) {
      chunkSize = chunkSize * 2n
      if (chunkSize > BigInt(CHUNK_SIZE)) chunkSize = BigInt(CHUNK_SIZE)
    }
  }
}

// Cache block timestamps to avoid redundant RPC calls
const timestampCache = new Map<bigint, Date>()

async function getBlockTimestamps(client: any, logs: Log[]): Promise<Map<bigint, Date>> {
  const result = new Map<bigint, Date>()
  const uniqueBlocks = [...new Set(logs.map(l => l.blockNumber!))]
  const uncached = uniqueBlocks.filter(b => !timestampCache.has(b))

  // Return cached immediately
  for (const blockNum of uniqueBlocks) {
    if (timestampCache.has(blockNum)) {
      result.set(blockNum, timestampCache.get(blockNum)!)
    }
  }

  // Fetch uncached in parallel batches of 20
  const BATCH = 20
  for (let i = 0; i < uncached.length; i += BATCH) {
    const batch = uncached.slice(i, i + BATCH)
    const results = await Promise.allSettled(
      batch.map(blockNum => client.getBlock({ blockNumber: blockNum }))
    )
    for (let j = 0; j < batch.length; j++) {
      const r = results[j]
      if (r.status === 'fulfilled') {
        const ts = new Date(Number(r.value.timestamp) * 1000)
        timestampCache.set(batch[j], ts)
        result.set(batch[j], ts)
      } else {
        result.set(batch[j], new Date())
      }
    }
  }

  // Prune cache if too large
  if (timestampCache.size > 10_000) {
    const entries = [...timestampCache.entries()]
    entries.splice(0, 5_000)
    timestampCache.clear()
    for (const [k, v] of entries) timestampCache.set(k, v)
  }

  return result
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
