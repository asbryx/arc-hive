import 'dotenv/config'
import { runHistoricalSync } from './sync/historical.js'
import { startLiveSync } from './sync/live.js'
import { startMetadataFetcher } from './metadata/index.js'
import { startScoring } from './scoring/index.js'
import { startHealthServer } from './health.js'
import { closePool } from './db/client.js'

async function main() {
  console.log('═══════════════════════════════════════')
  console.log('  ArcHive Indexer — Starting')
  console.log('═══════════════════════════════════════')

  // Start health server first
  startHealthServer()

  // Run historical sync (backfill)
  await runHistoricalSync()

  // Start live sync (real-time)
  await startLiveSync()

  // Start background workers
  startMetadataFetcher()
  startScoring()

  console.log('[Main] All systems running')

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\n[Main] Shutting down...')
    await closePool()
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((err) => {
  console.error('[Main] Fatal error:', err)
  process.exit(1)
})
