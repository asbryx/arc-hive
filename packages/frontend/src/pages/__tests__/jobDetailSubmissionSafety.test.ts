import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const pagePath = fileURLToPath(new URL('../JobDetail.tsx', import.meta.url))

describe('JobDetail deliverable synchronization', () => {
  it('waits for on-chain JobSubmitted receipt before sending deliverable content to the API', () => {
    const source = readFileSync(pagePath, 'utf8')
    const start = source.indexOf('async function handleSubmitDeliverable')
    const end = source.indexOf('async function handleOverride', start)
    const handler = source.slice(start, end)

    expect(handler).toContain('waitForTransactionReceipt(config, { hash: submissionTx })')
    expect(handler).toContain('submissionTx,')
    expect(handler.indexOf('waitForTransactionReceipt(config, { hash: submissionTx })')).toBeLessThan(handler.indexOf('authFetch(`/jobs/${id}/deliverable`'))
    expect(source).toContain('job.sourceContract?.toLowerCase() === AGENTIC_COMMERCE.toLowerCase()')
    expect(source).toContain("isProvider && job.status === 'Funded' && isExplorerCommerceJob")
  })
})
