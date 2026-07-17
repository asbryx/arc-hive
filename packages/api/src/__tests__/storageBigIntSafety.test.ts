import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const supabasePath = fileURLToPath(new URL('../supabase.ts', import.meta.url))

describe('deliverable storage path identity', () => {
  it('preserves BIGINT job IDs as decimal strings instead of rounding them through Number', () => {
    const source = readFileSync(supabasePath, 'utf8')
    expect(source).toContain('jobId: string | number')
    expect(source).toContain('const normalizedJobId = String(jobId)')
    expect(source).toContain('`${normalizedJobId}/${Math.floor(version)}/${safeFilename}`')
    expect(source).not.toContain('Math.floor(jobId)')
  })
})
