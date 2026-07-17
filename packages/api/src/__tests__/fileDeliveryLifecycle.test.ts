import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const routePath = fileURLToPath(new URL('../routes/files.ts', import.meta.url))

describe('marketplace file delivery lifecycle', () => {
  it('creates an evaluator-visible submitted deliverable before moving the job to evaluating', () => {
    const source = readFileSync(routePath, 'utf8')
    const start = source.indexOf("fileRoutes.post('/:id/deliver'")
    const handler = source.slice(start, source.indexOf("fileRoutes.get('/:id/files'", start))

    expect(handler).toContain('content, link, notes, version, status, file_count')
    expect(handler).toContain("VALUES ($1, $2, $3, $4, $5, $6, 'submitted', $7)")
    expect(handler.indexOf("'submitted'")).toBeLessThan(handler.indexOf("status = 'evaluating'"))
    expect(handler.indexOf("'evaluating'")).toBeLessThan(handler.indexOf("'COMMIT'"))
  })
})
