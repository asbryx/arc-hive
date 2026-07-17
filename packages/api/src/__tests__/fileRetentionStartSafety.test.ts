import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const routePath = fileURLToPath(new URL('../routes/files.ts', import.meta.url))
const evaluatorDbPath = fileURLToPath(new URL('../../../evaluator/src/db.ts', import.meta.url))

describe('file retention start', () => {
  it('starts the 30-day expiry only when evaluator approval completes', () => {
    const route = readFileSync(routePath, 'utf8')
    const evaluatorDb = readFileSync(evaluatorDbPath, 'utf8')

    const insertStart = route.indexOf('INSERT INTO deliverable_files')
    const insertEnd = route.indexOf('await dbClient.query(`UPDATE open_jobs', insertStart)
    expect(route.slice(insertStart, insertEnd)).not.toContain('NOW() + INTERVAL')
    expect(evaluatorDb).toContain("SET expires_at = NOW() + INTERVAL '30 days'")
  })
})
