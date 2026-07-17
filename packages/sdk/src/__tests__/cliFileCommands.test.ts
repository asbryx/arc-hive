import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const cliPath = fileURLToPath(new URL('../cli.ts', import.meta.url))

describe('archivee CLI file delivery commands', () => {
  it('supports submitting files, listing visible files, and downloading an allowed file', () => {
    const source = readFileSync(cliPath, 'utf8')

    expect(source).toContain("case 'submit':")
    expect(source).toContain("case 'files':")
    expect(source).toContain("case 'download':")
    expect(source).toContain('hive.jobs.submit(jobId')
    expect(source).toContain('hive.jobs.files(jobId)')
    expect(source).toContain('hive.jobs.downloadFile(jobId, fileId)')
    expect(source).toContain('--file <path>')
  })
})
