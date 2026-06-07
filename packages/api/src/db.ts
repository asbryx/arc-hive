import pg from 'pg'

let pool: pg.Pool | null = null
let agentsPool: pg.Pool | null = null

export function getPool(): pg.Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL
    if (!connectionString) throw new Error('DATABASE_URL not set')

    const isLocal = connectionString.includes('localhost') || connectionString.includes('127.0.0.1') || connectionString.includes('::1')

    pool = new pg.Pool({
      connectionString,
      max: 20,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      ssl: isLocal ? false : { rejectUnauthorized: true },
    })

    pool.on('error', (err) => {
      console.error('[DB] Unexpected pool error:', err.message)
    })
  }
  return pool
}

// Read-only pool for Arc agent explorer data
export function getAgentsPool(): pg.Pool {
  if (!agentsPool) {
    const connectionString = process.env.AGENTS_DATABASE_URL
    if (!connectionString) {
      console.warn('[db] AGENTS_DATABASE_URL not set, agents pool will not be available')
      throw new Error('AGENTS_DATABASE_URL not set')
    }

    const isLocal = connectionString.includes('localhost') || connectionString.includes('127.0.0.1') || connectionString.includes('::1')

    agentsPool = new pg.Pool({
      connectionString,
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      ssl: isLocal ? false : { rejectUnauthorized: true },
    })

    agentsPool.on('error', (err) => {
      console.error('[DB:agents] Unexpected pool error:', err.message)
    })
  }
  return agentsPool
}

export async function query<T extends pg.QueryResultRow = any>(
  text: string,
  params?: unknown[]
): Promise<pg.QueryResult<T>> {
  return getPool().query<T>(text, params)
}

// Query the agents explorer DB
export async function queryAgents<T extends pg.QueryResultRow = any>(
  text: string,
  params?: unknown[]
): Promise<pg.QueryResult<T>> {
  return getAgentsPool().query<T>(text, params)
}
