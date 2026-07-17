import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const migrationPath = fileURLToPath(new URL('../../../../migrations/028_create_indexed_job_deliverables.sql', import.meta.url))

describe('indexed Explorer deliverable storage migration', () => {
  it('keeps direct on-chain deliverables separate from marketplace local-ID storage', () => {
    const source = readFileSync(migrationPath, 'utf8')

    expect(source).toContain('CREATE TABLE IF NOT EXISTS indexed_job_deliverables')
    expect(source).toContain('PRIMARY KEY (job_id, source_contract)')
    expect(source).toContain('FOREIGN KEY (job_id, source_contract) REFERENCES jobs(job_id, source_contract)')
    expect(source).toContain('UNIQUE (submission_tx)')
  })
})
