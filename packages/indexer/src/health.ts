import { createServer } from 'node:http'
import { query, queryMarketplace } from './db/client.js'
import { getSyncProgress } from './sync/historical.js'
import { isLiveSyncRunning } from './sync/live.js'

export function startHealthServer(): void {
  const port = parseInt(process.env.HEALTH_PORT || '3001')

  const server = createServer(async (req, res) => {
    if (req.url === '/health') {
      try {
        const syncProgress = getSyncProgress()
        const liveRunning = isLiveSyncRunning()

        // Get DB stats from both databases
        const [agentStats, jobStats] = await Promise.all([
          query(`
            SELECT
              (SELECT COUNT(*) FROM agents) as agents,
              (SELECT COUNT(*) FROM reputation_events) as reputation_events,
              (SELECT COUNT(*) FROM validations) as validations
          `),
          queryMarketplace(`SELECT (SELECT COUNT(*) FROM jobs) as jobs`),
        ])

        const syncStates = await query(`SELECT contract_name, last_synced_block, total_events_processed, last_sync_at, error_count FROM sync_state`)

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          status: 'ok',
          timestamp: new Date().toISOString(),
          liveSync: liveRunning,
          db: { ...agentStats.rows[0], ...jobStats.rows[0] },
          contracts: syncStates.rows,
          historicalProgress: syncProgress.map(p => ({
            name: p.name,
            progress: p.toBlock > p.fromBlock
              ? `${Number((p.currentBlock - p.fromBlock) * 100n / (p.toBlock - p.fromBlock))}%`
              : '100%',
            eventsProcessed: p.eventsProcessed,
          })),
        }, null, 2))
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ status: 'error', error: (err as Error).message }))
      }
    } else {
      res.writeHead(404)
      res.end('Not found')
    }
  })

  server.listen(port, () => {
    console.log(`[Health] Server listening on :${port}/health`)
  })
}
