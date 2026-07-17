import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const routePath = fileURLToPath(new URL('../routes/open-jobs.ts', import.meta.url))

describe('evaluating-pending recovery', () => {
  it('allows the client to request a revision when the evaluator has exhausted its provider chain', () => {
    const source = readFileSync(routePath, 'utf8')
    const start = source.indexOf("openJobs.post('/:id/reject'")
    const end = source.indexOf("openJobs.post('/:id/cancel'", start)
    const handler = source.slice(start, end)

    expect(handler).toContain("'evaluating_pending'")
    expect(handler).toContain("status = 'in_progress'")
  })
})
