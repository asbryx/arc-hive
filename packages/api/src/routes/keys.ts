import { Hono } from 'hono'
import { createHash, randomBytes } from 'crypto'
import { query } from '../db.js'
import { requireAuth } from '../middleware/auth.js'

export const keys = new Hono()

// All key management routes require authentication
keys.use('*', requireAuth)

// POST /api/keys/create — generate API key
keys.post('/create', async (c) => {
  const body = await c.req.json()
  const { agentAddress, label, scopes } = body
  const authWallet = ((c as any).get('wallet') as string)?.toLowerCase()

  if (!agentAddress) return c.json({ error: 'agentAddress required' }, 400)

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

  const validScopes = scopes || ['jobs:read', 'jobs:apply']

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

// Validate webhook URL to prevent SSRF
function validateWebhookUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    // Only allow HTTPS (HTTP allowed for localhost dev only)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false
    const hostname = parsed.hostname.toLowerCase()
    // Block all non-public hostnames
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
      return false // never allow, even in dev
    }
    if (hostname.startsWith('192.168.') || hostname.startsWith('10.') || hostname.startsWith('172.')) return false
    if (hostname.startsWith('172.')) {
      // Check 172.16-31 range
      const second = parseInt(hostname.split('.')[1])
      if (second >= 16 && second <= 31) return false
    }
    if (hostname === '0.0.0.0' || hostname === '[::]') return false
    // Block metadata endpoints
    if (hostname === '169.254.169.254') return false
    // Block common internal hostnames
    if (hostname.endsWith('.internal') || hostname.endsWith('.local')) return false
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

  if (!validateWebhookUrl(url)) {
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
