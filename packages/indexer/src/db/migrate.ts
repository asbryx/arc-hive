import pg from 'pg'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationsDir = join(__dirname, '..', '..', '..', '..', 'migrations')

async function migrate() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error('DATABASE_URL not set')
    process.exit(1)
  }

  const client = new pg.Client({ connectionString: databaseUrl })
  await client.connect()

  try {
    // Create migrations tracking table
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)

    // Get already applied migrations
    const { rows: applied } = await client.query('SELECT name FROM _migrations ORDER BY name')
    const appliedSet = new Set(applied.map(r => r.name))

    // Get migration files
    const files = readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort()

    let count = 0
    for (const file of files) {
      if (appliedSet.has(file)) continue

      const sql = readFileSync(join(migrationsDir, file), 'utf-8')
      console.log(`Applying: ${file}`)

      await client.query('BEGIN')
      try {
        await client.query(sql)
        await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file])
        await client.query('COMMIT')
        count++
      } catch (err) {
        await client.query('ROLLBACK')
        console.error(`Failed: ${file}`, err)
        process.exit(1)
      }
    }

    console.log(count > 0 ? `Applied ${count} migration(s)` : 'No new migrations')
  } finally {
    await client.end()
  }
}

migrate()
