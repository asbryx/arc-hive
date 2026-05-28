import pg from 'pg'

let pool: pg.Pool | null = null

export function getPool(): pg.Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL
    if (!connectionString) throw new Error('DATABASE_URL not set')

    pool = new pg.Pool({
      connectionString,
      max: 20,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    })

    pool.on('error', (err) => {
      console.error('[DB] Unexpected pool error:', err.message)
    })
  }
  return pool
}

export async function query<T extends pg.QueryResultRow = any>(
  text: string,
  params?: unknown[]
): Promise<pg.QueryResult<T>> {
  return getPool().query<T>(text, params)
}
