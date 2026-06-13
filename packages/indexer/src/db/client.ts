import pg from 'pg'

let pool: pg.Pool | null = null
let marketplacePool: pg.Pool | null = null

// Agents/explorer DB (agents, reputation_events, validations, metadata_queue, sync_state)
//
// Resolves connection in this order:
//   1. AGENTS_DATABASE_URL  ← preferred, matches the API's naming convention
//   2. INDEXER_DATABASE_URL ← legacy alias
//   3. DATABASE_URL         ← fallback for single-DB deployments
//
// Why: the API package uses DATABASE_URL for the marketplace DB and
// AGENTS_DATABASE_URL for this indexer DB. Sharing one .env between both
// processes used to require them to disagree on what DATABASE_URL meant,
// which crashed whichever process lost the coin toss.
export function getPool(): pg.Pool {
  if (!pool) {
    const connectionString =
      process.env.AGENTS_DATABASE_URL ||
      process.env.INDEXER_DATABASE_URL ||
      process.env.DATABASE_URL
    if (!connectionString) {
      throw new Error('AGENTS_DATABASE_URL (or DATABASE_URL) not set')
    }

    pool = new pg.Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    })

    pool.on('error', (err) => {
      console.error('[DB] Unexpected pool error:', err.message)
    })
  }
  return pool
}

// Marketplace DB (jobs, job_events, open_jobs)
export function getMarketplacePool(): pg.Pool {
  if (!marketplacePool) {
    const connectionString =
      process.env.MARKETPLACE_DATABASE_URL ||
      process.env.DATABASE_URL
    if (!connectionString) throw new Error('MARKETPLACE_DATABASE_URL not set')

    marketplacePool = new pg.Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    })

    marketplacePool.on('error', (err) => {
      console.error('[DB:marketplace] Unexpected pool error:', err.message)
    })
  }
  return marketplacePool
}

export async function query<T extends pg.QueryResultRow = any>(
  text: string,
  params?: unknown[]
): Promise<pg.QueryResult<T>> {
  return getPool().query<T>(text, params)
}

export async function queryMarketplace<T extends pg.QueryResultRow = any>(
  text: string,
  params?: unknown[]
): Promise<pg.QueryResult<T>> {
  return getMarketplacePool().query<T>(text, params)
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end()
    pool = null
  }
  if (marketplacePool) {
    await marketplacePool.end()
    marketplacePool = null
  }
}
