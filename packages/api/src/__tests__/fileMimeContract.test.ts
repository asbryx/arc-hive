import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const routePath = fileURLToPath(new URL('../routes/files.ts', import.meta.url))

describe('file MIME contract', () => {
  it('accepts advertised Office files and npm archives', () => {
    const source = readFileSync(routePath, 'utf8')

    expect(source).toContain(
      "'application/vnd.openxmlformats-officedocument.wordprocessingml.document'",
    )
    expect(source).toContain("'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'")
    expect(source).toContain(
      "'application/vnd.openxmlformats-officedocument.presentationml.presentation'",
    )
    expect(source).toContain("'application/x-tar'")
    expect(source).toContain("'application/gzip'")
    expect(source).toContain("'docx'")
    expect(source).toContain("'xlsx'")
    expect(source).toContain("'tgz'")
    expect(source).toContain("'dll'")
    expect(source).toContain("'application/x-msdownload'")

    const uploadPolicy = source.slice(
      source.indexOf('const ALLOWED_MIME_PREFIXES'),
      source.indexOf('function isAllowedMime'),
    )
    expect(uploadPolicy).not.toContain("'image/svg+xml'")
    expect(uploadPolicy).not.toContain("'svg',")
  })
})
