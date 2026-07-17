import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const jobsPath = fileURLToPath(new URL('../jobs.ts', import.meta.url))
const clientPath = fileURLToPath(new URL('../client.ts', import.meta.url))
const typesPath = fileURLToPath(new URL('../types.ts', import.meta.url))

describe('@archivee/agent write safety and submit contract', () => {
  it('does not retry non-idempotent POST submissions and exposes the API submit response type', () => {
    const jobs = readFileSync(jobsPath, 'utf8')
    const client = readFileSync(clientPath, 'utf8')
    const types = readFileSync(typesPath, 'utf8')

    expect(jobs).toContain('Promise<SubmitResult>')
    expect(types).toContain('export interface SubmitResult')
    expect(client).toContain("const retryable = method === 'GET'")
    expect(client).toContain('if (!retryable) throw fail(error)')
  })
})
