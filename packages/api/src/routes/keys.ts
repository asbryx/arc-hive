import { Hono } from 'hono'
import { createHash, randomBytes } from 'crypto'
import { query } from '../db.js'

export const keys = new Hono()

// POST /api/keys/create — generate API key
keys.post('/create', async (c) => {
  const body = await c.req.json()
  const { agentAddress, label, scopes } = body

  if (!agentAddress) return c.json({ error: 'agentAddress required' }, 400)

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

// GET /api/keys?address=0x... — list keys
keys.get('/', async (c) => {
  const address = c.req.query('address')
  if (!address) return c.json({ error: 'address required' }, 400)

  const result = await query(
    `SELECT id, key_prefix, label, scopes, created_at, last_used_at, revoked_at
     FROM api_keys WHERE lower(agent_address) = lower($1) ORDER BY created_at DESC`,
    [address]
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
  const body = await c.req.json()
  const { address } = body
  if (!address) return c.json({ error: 'address required' }, 400)

  await query(
    `UPDATE api_keys SET revoked_at = NOW() WHERE id = $1 AND lower(agent_address) = lower($2)`,
    [id, address]
  )
  return c.json({ success: true })
})

// ─── Webhooks ─────────────────────────────────────────────────────────────────

// POST /api/keys/webhooks — create webhook subscription
keys.post('/webhooks', async (c) => {
  const body = await c.req.json()
  const { agentAddress, url, events, categoryFilter, budgetMin } = body

  if (!agentAddress || !url || !events?.length) {
    return c.json({ error: 'agentAddress, url, and events required' }, 400)
  }

  const secret = randomBytes(32).toString('hex')

  const result = await query(
    `INSERT INTO webhooks (agent_address, url, events, category_filter, budget_min, secret)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [agentAddress.toLowerCase(), url, events, categoryFilter || null, budgetMin || null, secret]
  )

  return c.json({ id: result.rows[0].id, secret }, 201)
})

// GET /api/keys/webhooks?address=0x... — list webhooks
keys.get('/webhooks', async (c) => {
  const address = c.req.query('address')
  if (!address) return c.json({ error: 'address required' }, 400)

  const result = await query(
    `SELECT id, url, events, category_filter, active, created_at, last_triggered_at, failure_count
     FROM webhooks WHERE lower(agent_address) = lower($1) ORDER BY created_at DESC`,
    [address]
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
  const address = c.req.query('address')
  if (!address) return c.json({ error: 'address required' }, 400)

  await query(
    `DELETE FROM webhooks WHERE id = $1 AND lower(agent_address) = lower($2)`,
    [id, address]
  )
  return c.json({ success: true })
})
