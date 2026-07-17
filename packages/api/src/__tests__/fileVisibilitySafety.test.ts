import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const routePath = fileURLToPath(new URL('../routes/files.ts', import.meta.url))

describe('marketplace file visibility', () => {
  it('returns all file metadata to the provider but only approved files to the client', () => {
    const source = readFileSync(routePath, 'utf8')
    const start = source.indexOf("fileRoutes.get('/:id/files'")
    const end = source.indexOf("fileRoutes.get('/:id/files/:fileId/download'", start)
    const handler = source.slice(start, end)

    expect(handler).toContain('const visibleRows = isProvider')
    expect(handler).toContain("row.deliverable_status === 'approved'")
    expect(handler).toContain('const downloadable = !expired')
  })
})
