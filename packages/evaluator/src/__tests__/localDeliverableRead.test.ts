import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const originalEnv = { ...process.env }
const tempDirs: string[] = []

afterEach(async () => {
  vi.resetModules()
  process.env = { ...originalEnv }
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('evaluator local deliverable reads', () => {
  it('reads a private local object by its storage path without Supabase', async () => {
    const root = await mkdtemp(join(tmpdir(), 'arc-hive-evaluator-storage-'))
    tempDirs.push(root)
    await mkdir(join(root, '42', '1'), { recursive: true })
    await writeFile(join(root, '42', '1', 'solution.ts'), 'export const answer = 42\n')
    process.env.FILE_STORAGE_BACKEND = 'local'
    process.env.LOCAL_DELIVERABLES_DIR = root
    delete process.env.SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_KEY

    const storage = await import('../supabase.js')
    await expect(storage.getFileAsText('local/42/1/solution.ts')).resolves.toContain('answer = 42')
    await expect(storage.getFileAsText('local/../escape')).resolves.toBeNull()
    await expect(storage.getFileAsText('legacy-supabase-path')).resolves.toBeNull()
  })
})
