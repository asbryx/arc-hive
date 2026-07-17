import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const pagePath = fileURLToPath(new URL('../MarketplaceDetail.tsx', import.meta.url))

describe('MarketplaceDetail evaluation visibility', () => {
  it('uses the wallet JWT when requesting participant evaluation data', () => {
    const source = readFileSync(pagePath, 'utf8')
    expect(source).toContain('authFetch(`/open-jobs/${id}/evaluations`)')
    expect(source).not.toContain('fetch(`${API_BASE}/open-jobs/${id}/evaluations`)')
  })
})
