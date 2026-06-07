import { Hono } from 'hono'
import { createHash, randomBytes } from 'crypto'
import dns from 'dns/promises'
import { query } from '../db.js'
import { requireAuth } from '../middleware/auth.js'

export const keys = new Hono()

const ALLOWED_SCOPES = ['jobs:read', 'jobs:apply', 'jobs:create', 'jobs:write', 'agents:read'] as const
type AllowedScope = typeof ALLOWED_SCOPES[number]

// All key management routes require authentication
keys.use('*', requireAuth)

// POST /api/keys/create — generate API key
keys.post('/create', async (c) => {
  const body = await c.req.json()
  const { agentAddress, label, scopes } = body
  const authWallet = ((c as any).get('wallet') as string)?.toLowerCase()

  if (!agentAddress) return c.json({ error: 'agentAddress required' }, 400)

  // Sanitize label to prevent stored XSS
  if (label && (label.length > 100 || /[<>"'&]/.test(label))) {
    return c.json({ error: 'Label must be max 100 chars and contain no HTML special characters' }, 400)
  }

  // Verify authenticated user is creating key for their own wallet
  if (authWallet && authWallet !== agentAddress.toLowerCase()) {
    return c.json({ error: 'Can only create keys for your own wallet' }, 403)
  }

  // Limit: max 10 active keys per wallet
  const keyCount = await query(
    `SELECT COUNT(*) FROM api_keys WHERE lower(agent_address) = lower($1) AND revoked_at IS NULL`,
    [agentAddress]
  )
  if (parseInt(keyCount.rows[0].count) >= 10) {
    return c.json({ error: 'Maximum 10 active API keys per wallet. Revoke unused keys first.' }, 400)
  }

  const rawKey = 'ak_' + randomBytes(24).toString('hex')
  const keyHash = createHash('sha256').update(rawKey).digest('hex')
  const keyPrefix = rawKey.slice(0, 11)

  const requestedScopes = scopes || ['jobs:read', 'jobs:apply']
  const validScopes = requestedScopes.filter((s: string) => (ALLOWED_SCOPES as readonly string[]).includes(s))
  if (requestedScopes.length > 0 && validScopes.length !== requestedScopes.length) {
    const invalid = requestedScopes.filter((s: string) => !(ALLOWED_SCOPES as readonly string[]).includes(s))
    return c.json({ error: `Invalid scopes: ${invalid.join(', ')}` }, 400)
  }

  const result = await query(
    `INSERT INTO api_keys (key_hash, key_prefix, agent_address, label, scopes)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [keyHash, keyPrefix, agentAddress.toLowerCase(), label || null, validScopes]
  )

  return c.json({ id: result.rows[0].id, key: rawKey, prefix: keyPrefix }, 201)
})

// GET /api/keys — list keys for authenticated wallet
keys.get('/', async (c) => {
  const authWallet = ((c as any).get('wallet') as string)?.toLowerCase()
  if (!authWallet) return c.json({ error: 'Authentication required' }, 401)

  const result = await query(
    `SELECT id, key_prefix, label, scopes, created_at, last_used_at, revoked_at
     FROM api_keys WHERE lower(agent_address) = lower($1) ORDER BY created_at DESC`,
    [authWallet]
  )

  return c.json({
    data: result.rows.map(row => ({
      id: row.id, prefix: row.key_prefix, label: row.label,
      scopes: row.scopes, createdAt: row.created_at,
      lastUsedAt: row.last_used_at, revokedAt: row.revoked_at,
    }))
  })
})

// POST /api/keys/:id/revoke — revoke a key
keys.post('/:id/revoke', async (c) => {
  const id = c.req.param('id')
  const authWallet = ((c as any).get('wallet') as string)?.toLowerCase()
  if (!authWallet) return c.json({ error: 'Authentication required' }, 401)

  await query(
    `UPDATE api_keys SET revoked_at = NOW() WHERE id = $1 AND lower(agent_address) = lower($2)`,
    [id, authWallet]
  )
  return c.json({ success: true })
})

// ─── Webhooks ─────────────────────────────────────────────────────────────────

// Check if an IP address is private/internal
function isPrivateIP(ip: string): boolean {
  if (ip.startsWith('127.') || ip === '::1' || ip === 'localhost') return true
  if (ip.startsWith('10.')) return true
  if (ip.startsWith('192.168.')) return true
  if (ip.startsWith('172.')) {
    const second = parseInt(ip.split('.')[1])
    if (second >= 16 && second <= 31) return true
  }
  if (ip.startsWith('::ffff:')) {
    return isPrivateIP(ip.substring(7))
  }
  return false
}

// Validate webhook URL to prevent SSRF (including DNS rebinding)
async function validateWebhookUrl(url: string): Promise<boolean> {
  try {
    const parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol)) return false
    const hostname = parsed.hostname.toLowerCase()

    // Block direct IP addresses that are private
    if (isPrivateIP(hostname)) return false

    // Block metadata endpoints
    if (hostname === '169.254.169.254') return false

    // Block non-routable addresses
    if (hostname === '0.0.0.0' || hostname === '[::]') return false

    // Block common internal hostnames
    if (hostname.endsWith('.internal') || hostname.endsWith('.local')) return false

    // DNS rebinding protection: resolve and check resolved IPs
    try {
      const addresses = await dns.resolve4(hostname)
      for (const addr of addresses) {
        if (isPrivateIP(addr)) return false
      }
    } catch {
      // If DNS fails, allow it (might be valid but temporarily unreachable)
    }

    return true
  } catch {
    return false
  }
}

// POST /api/keys/webhooks — create webhook subscription
keys.post('/webhooks', async (c) => {
  const body = await c.req.json()
  const { agentAddress, url, events, categoryFilter, budgetMin } = body

  if (!agentAddress || !url || !events?.length) {
    return c.json({ error: 'agentAddress, url, and events required' }, 400)
  }

  const isValidUrl = await validateWebhookUrl(url)
  if (!isValidUrl) {
    return c.json({ error: 'Invalid or blocked webhook URL. Only public HTTPS URLs are allowed.' }, 400)
  }

  // Verify authenticated user is creating webhook for their own wallet
  const authWallet = ((c as any).get('wallet') as string)?.toLowerCase()
  if (authWallet && authWallet !== agentAddress.toLowerCase()) {
    return c.json({ error: 'Can only create webhooks for your own wallet' }, 403)
  }

  const secret = randomBytes(32).toString('hex')

  const result = await query(
    `INSERT INTO webhooks (agent_address, url, events, category_filter, budget_min, secret)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [agentAddress.toLowerCase(), url, events, categoryFilter || null, budgetMin || null, secret]
  )

  return c.json({ id: result.rows[0].id, secret }, 201)
})

// GET /api/keys/webhooks — list webhooks for authenticated wallet
keys.get('/webhooks', async (c) => {
  const authWallet = ((c as any).get('wallet') as string)?.toLowerCase()
  if (!authWallet) return c.json({ error: 'Authentication required' }, 401)

  const result = await query(
    `SELECT id, url, events, category_filter, active, created_at, last_triggered_at, failure_count
     FROM webhooks WHERE lower(agent_address) = lower($1) ORDER BY created_at DESC`,
    [authWallet]
  )

  return c.json({
    data: result.rows.map(row => ({
      id: row.id, url: row.url, events: row.events,
      categoryFilter: row.category_filter, active: row.active,
      createdAt: row.created_at, lastTriggeredAt: row.last_triggered_at,
      failureCount: row.failure_count,
    }))
  })
})

// DELETE /api/keys/webhooks/:id — remove webhook
keys.delete('/webhooks/:id', async (c) => {
  const id = c.req.param('id')
  const authWallet = ((c as any).get('wallet') as string)?.toLowerCase()
  if (!authWallet) return c.json({ error: 'Authentication required' }, 401)

  await query(
    `DELETE FROM webhooks WHERE id = $1 AND lower(agent_address) = lower($2)`,
    [id, authWallet]
  )
  return c.json({ success: true })
})
