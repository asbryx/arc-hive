import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const routePath = fileURLToPath(new URL('../routes/files.ts', import.meta.url))

describe('marketplace file delivery atomicity', () => {
  it('validates/uploads files before committing the evaluator-visible DB delivery and cleans storage on DB failure', () => {
    const source = readFileSync(routePath, 'utf8')
    const start = source.indexOf("fileRoutes.post('/:id/deliver'")
    const handler = source.slice(start, source.indexOf("fileRoutes.get('/:id/files'", start))

    expect(handler).toContain('const preparedFiles')
    expect(handler).toContain('const dbClient = await getPool().connect()')
    expect(handler).toContain('await deleteFiles(uploadedStoragePaths)')
    expect(handler.indexOf('await uploadFile(')).toBeLessThan(
      handler.indexOf('INSERT INTO marketplace_deliverables'),
    )
    expect(handler.indexOf("status = 'evaluating'")).toBeLessThan(handler.indexOf("'COMMIT'"))
  })
})
