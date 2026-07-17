import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const pagePath = fileURLToPath(new URL('../MarketplaceDetail.tsx', import.meta.url))

describe('Marketplace settlement safety', () => {
  it('does not expose client or agent browser settlement paths', () => {
    const source = readFileSync(pagePath, 'utf8')

    expect(source).not.toContain('function handleSubmitOnChain')
    expect(source).not.toContain('function handleComplete')
    expect(source).not.toContain('`/open-jobs/${id}/complete`')
    expect(source).not.toContain('if (onchainJob.id === 0n)')
    expect(source).not.toContain("method: 'eth_call'")
    expect(source).toContain('const onchainJob = await readContract(config,')
    expect(source).toContain('const selectRes = await authFetch')
    expect(source).toContain('const fundRes = await authFetch')
  })
})
