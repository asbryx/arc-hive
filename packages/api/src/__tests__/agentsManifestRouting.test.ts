import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const routePath = fileURLToPath(new URL('../routes/agents.ts', import.meta.url))

describe('agent manifest routes', () => {
  it('query the agent-explorer database and use agent_id for numeric lookups', () => {
    const source = readFileSync(routePath, 'utf8')
    const manifestSection = source.slice(
      source.indexOf("// GET /api/agents/:id/manifest"),
      source.indexOf('// ─── Helpers')
    )

    expect(manifestSection).toContain('queryAgents(')
    expect(manifestSection).toContain('a.agent_id = $1')
    expect(manifestSection).not.toContain('a.id = $1')
    expect(manifestSection).not.toContain('agents WHERE id = $1')
  })
})
