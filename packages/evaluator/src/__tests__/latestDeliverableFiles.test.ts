import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const watcherPath = fileURLToPath(new URL('../watcher.ts', import.meta.url))

describe('evaluator file version isolation', () => {
  it('loads files only from the deliverable version currently being evaluated', () => {
    const source = readFileSync(watcherPath, 'utf8')
    const start = source.indexOf('SELECT filename, file_type, storage_path FROM deliverable_files')
    const end = source.indexOf('dbFileCount = filesResult.rows.length', start)
    const query = source.slice(start, end)

    expect(query).toContain('WHERE deliverable_id = $1')
    expect(query).toContain('[job.deliverable_id]')
    expect(query).not.toContain('WHERE open_job_id = $1')
  })
})
