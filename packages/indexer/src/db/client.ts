import pg from 'pg'

let pool: pg.Pool | null = null
let marketplacePool: pg.Pool | null = null

// Agents/explorer DB (agents, reputation_events, validations, metadata_queue, sync_state)
export function getPool(): pg.Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL
    if (!connectionString) throw new Error('DATABASE_URL not set')

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
    const connectionString = process.env.MARKETPLACE_DATABASE_URL || process.env.DATABASE_URL
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
