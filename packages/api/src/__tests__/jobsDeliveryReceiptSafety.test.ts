import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const routePath = fileURLToPath(new URL('../routes/jobs.ts', import.meta.url))

describe('Explorer deliverable receipt safety', () => {
  it('requires a verified JobSubmitted transaction before persisting a deliverable', () => {
    const source = readFileSync(routePath, 'utf8')
    const start = source.indexOf("jobs.post('/:id/deliverable'")
    const handler = source.slice(start)

    expect(handler).toContain('submissionTx')
    expect(handler).toContain('hasSubmittedDeliverable(receipt, BigInt(jobId), provider, deliverableHash)')
    expect(handler).toContain("lower(source_contract) = $2")
    expect(handler).toContain('INSERT INTO indexed_job_deliverables')
    expect(handler).not.toContain('INSERT INTO job_deliverables')
    expect(handler).not.toContain('UPDATE jobs SET status')
    expect(handler.indexOf('hasSubmittedDeliverable(receipt, BigInt(jobId), provider, deliverableHash)')).toBeLessThan(handler.indexOf('INSERT INTO indexed_job_deliverables'))
  })
})
