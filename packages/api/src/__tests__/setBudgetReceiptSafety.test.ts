import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const routePath = fileURLToPath(new URL('../routes/open-jobs.ts', import.meta.url))

describe('set-budget receipt safety', () => {
  it('does not report success when the provider relay transaction reverts', () => {
    const source = readFileSync(routePath, 'utf8')
    const start = source.indexOf("openJobs.post('/:id/set-budget'")
    const end = source.indexOf("openJobs.post('/:id/fund'", start)
    const handler = source.slice(start, end)

    expect(handler).toContain('const receipt = await publicClient.waitForTransactionReceipt({ hash: tx })')
    expect(handler).toContain("if (receipt.status !== 'success')")
  })
})
