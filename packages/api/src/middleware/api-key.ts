import { Context, Next } from 'hono'
import { createHash } from 'crypto'
import { query } from '../db.js'

/**
 * API Key authentication middleware.
 * Validates x-api-key header against the api_keys table.
 * Checks: key exists, not revoked, not expired.
 * On success, attaches scopes and agent_address to context.
 */
export async function apiKeyAuth(c: Context, next: Next) {
  const apiKey = c.req.header('x-api-key')
  if (!apiKey) {
    return c.json({ error: 'API key required. Pass via x-api-key header.' }, 401)
  }

  // Hash the provided key to match stored hash
  const keyHash = createHash('sha256').update(apiKey).digest('hex')

  try {
    const result = await query(
      `SELECT id, agent_address, scopes, revoked_at, expires_at
       FROM api_keys
       WHERE key_hash = $1`,
      [keyHash]
    )

    if (result.rows.length === 0) {
      return c.json({ error: 'Invalid API key' }, 401)
    }

    const key = result.rows[0]

    // Check revocation
    if (key.revoked_at) {
      return c.json({ error: 'API key has been revoked' }, 401)
    }

    // Check expiration
    if (key.expires_at && new Date(key.expires_at) < new Date()) {
      return c.json({ error: 'API key has expired' }, 401)
    }

    // Update last_used_at (non-blocking)
    query(
      `UPDATE api_keys SET last_used_at = NOW() WHERE id = $1`,
      [key.id]
    ).catch(() => {})

    // Attach to context for downstream handlers
    c.set('apiKeyScopes', key.scopes || [])
    c.set('apiKeyAddress', key.agent_address)
    c.set('apiKeyId', key.id)

    await next()
  } catch (err) {
    console.error('[apiKeyAuth] Database error:', (err as Error).message)
    return c.json({ error: 'Authentication service unavailable' }, 503)
  }
}

/**
 * Scope-checking middleware. Use after apiKeyAuth.
 * Example: app.get('/jobs', apiKeyAuth, requireScope('jobs:read'), handler)
 */
export function requireScope(scope: string) {
  return async (c: Context, next: Next) => {
    const scopes = (c.get('apiKeyScopes') as string[]) || []
    if (!scopes.includes(scope)) {
      return c.json({
        error: `Insufficient permissions. Required scope: ${scope}`,
        currentScopes: scopes,
      }, 403)
    }
    await next()
  }
}
