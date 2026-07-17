import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const routePath = fileURLToPath(new URL('../routes/files.ts', import.meta.url))

describe('file-only marketplace delivery', () => {
  it('persists a deterministic manifest when no text content was supplied', () => {
    const source = readFileSync(routePath, 'utf8')
    const start = source.indexOf("fileRoutes.post('/:id/deliver'")
    const handler = source.slice(start, source.indexOf("fileRoutes.get('/:id/files'", start))

    expect(handler).toMatch(/const deliverableContent\s*=\s*content\?\.trim\(\)\s*\|\|/)
    expect(handler).toContain('File deliverable manifest')
    expect(handler).toContain('`${file.name} sha256:${file.hash}`')
    expect(handler).toMatch(/deliverableContent,\s*link,\s*notes/)
  })
})
