import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const routePath = fileURLToPath(new URL('../routes/open-jobs.ts', import.meta.url))

describe('marketplace evaluation visibility', () => {
  it('limits unapproved evaluation detail to the job client or selected provider', () => {
    const source = readFileSync(routePath, 'utf8')
    const start = source.indexOf("openJobs.get('/:id/evaluations'")
    const end = source.indexOf("openJobs.get('/:id/suggested-agents'", start)
    const handler = source.slice(start, end)

    expect(handler).toContain('client_address, selected_applicant, status')
    expect(handler).toContain('const isParticipant = isClient || isProvider')
    expect(handler).toContain("if (!isParticipant && job.status !== 'completed')")
    expect(handler).toMatch(
      /result\.rows\.filter\(\(?row\)?\s*=>\s*row\.status\s*===\s*'approved'\)/,
    )
  })
})
