import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const docsPath = fileURLToPath(new URL('../Docs.tsx', import.meta.url))

describe('Docs authentication contract', () => {
  it('documents wallet nonce as a JSON POST', () => {
    const source = readFileSync(docsPath, 'utf8')

    expect(source).toMatch(/method="POST"\s+path="\/auth\/nonce"/)
    expect(source).not.toMatch(/method="GET"\s+path="\/auth\/nonce\?wallet=0x\.\.\."/)
  })
})
