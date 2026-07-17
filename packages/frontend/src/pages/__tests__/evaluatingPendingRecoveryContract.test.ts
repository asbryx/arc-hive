import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const pagePath = fileURLToPath(new URL('../MarketplaceDetail.tsx', import.meta.url))

describe('MarketplaceDetail evaluator-pending recovery', () => {
  it('gives the client a revision-request control when all evaluator providers are unavailable', () => {
    const source = readFileSync(pagePath, 'utf8')

    expect(source).toContain("isClient && job.status === 'evaluating_pending'")
    expect(source).toContain('Request Revision')
    expect(source).toContain('onClick={handleReject}')
    expect(source).toContain('Evaluator unavailable — client action required')
  })
})
