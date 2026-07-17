import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const routePath = fileURLToPath(new URL('../routes/open-jobs.ts', import.meta.url))

describe('marketplace deliverable visibility', () => {
  it('limits pre-approval deliverable metadata and content to the job client or selected provider', () => {
    const source = readFileSync(routePath, 'utf8')
    const start = source.indexOf("openJobs.get('/:id/deliverables'")
    const end = source.indexOf("openJobs.get('/:id/evaluations'", start)
    const handler = source.slice(start, end)

    expect(handler).toContain('const isParticipant = isClient || isProvider')
    expect(handler).toContain('if (!isParticipant && !isJobCompleted)')
    expect(handler).toContain("requester ? 'Access denied' : 'Authentication required'")
  })
})
