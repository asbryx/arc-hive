import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const pagePath = fileURLToPath(new URL('../JobDetail.tsx', import.meta.url))

describe('JobDetail settlement authority', () => {
  it('shows contract settlement controls only to the configured evaluator', () => {
    const source = readFileSync(pagePath, 'utf8')

    expect(source).not.toContain("(isEvaluator || isClient) && job.status === 'Submitted'")
    expect(source).toContain("isEvaluator && job.status === 'Submitted'")
    expect(source).toContain('waitForTransactionReceipt(config, { hash: tx })')
  })
})
