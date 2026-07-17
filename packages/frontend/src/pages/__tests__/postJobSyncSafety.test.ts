import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const pagePath = fileURLToPath(new URL('../PostJob.tsx', import.meta.url))

describe('PostJob on-chain synchronization', () => {
  it('does not report success before the creation receipt and listing sync succeed', () => {
    const source = readFileSync(pagePath, 'utf8')

    expect(source).toContain("if (receipt.status !== 'success')")
    expect(source).toContain('if (!res.ok)')
    expect(source).toContain('if (pendingListing)')
    expect(source).toContain('setPendingListing(null)')
    expect(source).not.toContain('Still show success since on-chain job exists')
  })
})
