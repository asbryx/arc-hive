import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const originalEnv = { ...process.env }
const tempDirs: string[] = []

afterEach(async () => {
  vi.resetModules()
  process.env = { ...originalEnv }
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('local private deliverable storage', () => {
  it('round-trips exact bigint job paths without exposing or traversing the storage root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'arc-hive-local-storage-'))
    tempDirs.push(root)
    process.env.FILE_STORAGE_BACKEND = 'local'
    process.env.LOCAL_DELIVERABLES_DIR = root

    const storage = await import('../supabase.js')
    const bytes = new TextEncoder().encode('package artifact').buffer
    const uploaded = await storage.uploadFile(
      '9007199254740993123',
      1,
      'package.tgz',
      bytes,
      'application/gzip',
    )

    expect(uploaded.error).toBeUndefined()
    expect(uploaded.path).toBe('local/9007199254740993123/1/package.tgz')
    expect(await readFile(join(root, '9007199254740993123', '1', 'package.tgz'), 'utf8')).toBe(
      'package artifact',
    )

    const downloaded = await storage.downloadFile(uploaded.path)
    expect(new TextDecoder().decode(downloaded.data!)).toBe('package artifact')
    expect(await storage.deleteFile(uploaded.path)).toBe(true)
    expect(await storage.downloadFile(uploaded.path)).toMatchObject({ data: null })
  })

  it('refuses unsafe storage identifiers', async () => {
    const root = await mkdtemp(join(tmpdir(), 'arc-hive-local-storage-'))
    tempDirs.push(root)
    process.env.FILE_STORAGE_BACKEND = 'local'
    process.env.LOCAL_DELIVERABLES_DIR = root

    const storage = await import('../supabase.js')
    await expect(storage.downloadFile('local/../escape')).resolves.toMatchObject({ data: null })
    await expect(storage.deleteFile('local/../escape')).resolves.toBe(false)
    await expect(storage.downloadFile('legacy-supabase-path')).resolves.toMatchObject({
      data: null,
      error: 'Non-local storage path rejected by local backend',
    })
  })
})
