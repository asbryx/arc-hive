import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const routePath = fileURLToPath(new URL('../routes/jobs.ts', import.meta.url))

describe('Explorer job source identity', () => {
  it('reads the detail row and event timeline from the AgenticCommerce source contract', () => {
    const source = readFileSync(routePath, 'utf8')
    const start = source.indexOf("jobs.get('/:id'")
    const end = source.indexOf("jobs.post('/:id/deliverable'", start)
    const detail = source.slice(start, end)

    expect(detail).toContain('WHERE job_id = $1 AND lower(source_contract) = $2')
    expect(detail).toContain('WHERE job_id = $1 AND lower(source_contract) = $2 ORDER BY block_number, log_index')
  })
})
