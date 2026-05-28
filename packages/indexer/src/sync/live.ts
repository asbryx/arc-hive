import { type Address, type Log } from 'viem'
import { getWsClient, getHttpClient } from '../clients/chain.js'
import { processLog, getWatchedAddresses } from '../processors/index.js'
import * as db from '../db/queries.js'

let isRunning = false
let unwatch: (() => void) | null = null
let processing = false // serialization lock

export function isLiveSyncRunning(): boolean {
  return isRunning
}

export async function startLiveSync(): Promise<void> {
  if (isRunning) return
  isRunning = true

  const addresses = getWatchedAddresses() as Address[]
  console.log(`[Live] Starting live sync, watching ${addresses.length} contracts`)

  try {
    await startWsSync(addresses)
  } catch (err) {
    console.warn(`[Live] WebSocket failed, falling back to polling:`, (err as Error).message)
    await startPollingSync(addresses)
  }
}

export function stopLiveSync(): void {
  isRunning = false
  if (unwatch) {
    unwatch()
    unwatch = null
  }
}

// Queue for serialized block processing
const blockQueue: bigint[] = []

async function enqueueBlock(blockNumber: bigint, addresses: Address[]): Promise<void> {
  blockQueue.push(blockNumber)
  if (processing) return
  processing = true

  while (blockQueue.length > 0) {
    const block = blockQueue.shift()!
    if (!isRunning) break
    await processBlock(block, addresses)
  }

  processing = false
}

async function startWsSync(addresses: Address[]): Promise<void> {
  const wsClient = getWsClient()

  unwatch = wsClient.watchBlockNumber({
    onBlockNumber: async (blockNumber) => {
      if (!isRunning) return
      await enqueueBlock(blockNumber, addresses)
    },
    onError: (err) => {
      console.error(`[Live] WebSocket error:`, err.message)
      if (isRunning) {
        setTimeout(() => {
          console.log(`[Live] Attempting WebSocket reconnect...`)
          startWsSync(addresses).catch(() => {
            console.warn(`[Live] Reconnect failed, switching to polling`)
            startPollingSync(addresses)
          })
        }, 2000)
      }
    },
  })
}

async function startPollingSync(addresses: Address[]): Promise<void> {
  const client = getHttpClient()

  // Start from DB checkpoint, not current head
  let lastBlock = await getLastSyncedBlock(addresses)
  if (!lastBlock) {
    lastBlock = await client.getBlockNumber()
  }
  console.log(`[Live] Polling from block ${lastBlock}`)

  const poll = async () => {
    if (!isRunning) return

    try {
      const currentBlock = await client.getBlockNumber()
      if (currentBlock > lastBlock!) {
        for (let block = lastBlock! + 1n; block <= currentBlock; block++) {
          if (!isRunning) break
          await processBlock(block, addresses)
        }
        lastBlock = currentBlock
      }
    } catch (err) {
      console.error(`[Live] Polling error:`, (err as Error).message)
    }

    if (isRunning) {
      setTimeout(poll, 1000)
    }
  }

  poll()
}

async function processBlock(blockNumber: bigint, addresses: Address[]): Promise<void> {
  const client = getHttpClient()

  try {
    const logs = await client.getLogs({
      address: addresses,
      fromBlock: blockNumber,
      toBlock: blockNumber,
    })

    if (logs.length === 0) {
      // Still advance sync state so we don't re-process empty blocks
      for (const address of addresses) {
        await db.updateSyncState(address, blockNumber, 0)
      }
      return
    }

    // Get block timestamp
    const block = await client.getBlock({ blockNumber })
    const timestamp = new Date(Number(block.timestamp) * 1000)

    for (const log of logs) {
      await processLog(log, timestamp)
    }

    // Update sync state for all contracts
    for (const address of addresses) {
      const contractLogs = logs.filter(l => l.address?.toLowerCase() === address.toLowerCase())
      await db.updateSyncState(address, blockNumber, contractLogs.length)
    }

    console.log(`[Live] Block ${blockNumber}: ${logs.length} events`)
  } catch (err) {
    console.error(`[Live] Error processing block ${blockNumber}:`, (err as Error).message)
    // Don't advance — will retry on next poll cycle
  }
}

async function getLastSyncedBlock(addresses: Address[]): Promise<bigint | null> {
  let maxBlock: bigint | null = null
  for (const address of addresses) {
    const state = await db.getSyncState(address)
    if (state && state.last_synced_block) {
      const block = BigInt(state.last_synced_block)
      if (!maxBlock || block > maxBlock) maxBlock = block
    }
  }
  return maxBlock
}
