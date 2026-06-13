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

// SEC-020: Strict private/SSRF-target detection. Covers IPv4 + IPv6 ranges that
// public webhooks should never resolve to (loopback, RFC1918, link-local, CGNAT,
// metadata services, IPv6 ULA / link-local, IPv4-mapped IPv6, broadcast).
function isPrivateIPv4(ip: string): boolean {
  // Validate IPv4 form
  const parts = ip.split('.').map(p => parseInt(p, 10))
  if (parts.length !== 4 || parts.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return false
  const [a, b] = parts
  if (a === 10) return true
  if (a === 127) return true
  if (a === 0) return true
  if (a === 169 && b === 254) return true              // link-local + AWS/Azure metadata
  if (a === 172 && b >= 16 && b <= 31) return true     // 172.16/12
  if (a === 192 && b === 168) return true
  if (a === 192 && b === 0 && parts[2] === 0) return true  // 192.0.0/24 (IETF protocol)
  if (a === 192 && b === 0 && parts[2] === 2) return true  // TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return true     // benchmarking
  if (a === 100 && b >= 64 && b <= 127) return true        // CGNAT (Tailscale uses this)
  if (a >= 224) return true                                 // multicast/reserved/broadcast
  // Cloud metadata endpoints
  if (a === 100 && b === 100 && parts[2] === 100 && parts[3] === 200) return true // Alibaba
  return false
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase().replace(/^\[|\]$/g, '')
  if (lower === '::1' || lower === '::') return true
  if (lower.startsWith('fe80:')) return true       // link-local
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true // ULA fc00::/7
  if (lower.startsWith('ff')) return true          // multicast
  // IPv4-mapped IPv6 (::ffff:a.b.c.d) — extract trailing IPv4 and re-check
  const m = lower.match(/^(?:0+:){0,5}(?:ffff:)?(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)
  if (m && isPrivateIPv4(m[1])) return true
  // Cloud metadata over IPv6
  if (lower === 'fd00:ec2::254') return true       // AWS IMDSv6
  return false
}

function isPrivateIP(ip: string): boolean {
  if (!ip) return true
  const lower = ip.toLowerCase()
  if (lower === 'localhost') return true
  if (lower.includes(':')) return isPrivateIPv6(lower)
  return isPrivateIPv4(lower)
}

// SEC-021: Webhook URLs must be HTTPS and resolve to non-private IPs at fetch time too,
// not only at registration. Caller (open-jobs.ts) re-resolves before each fire.
async function validateWebhookUrl(url: string): Promise<boolean> {
  try {
    const parsed = new URL(url)
    // Force HTTPS — error message already promises it
    if (parsed.protocol !== 'https:') return false
    if (parsed.username || parsed.password) return false         // no userinfo

    const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '')
    if (!hostname) return false

    // Direct IP literals
    if (/^[\d.]+$/.test(hostname) || hostname.includes(':')) {
      if (isPrivateIP(hostname)) return false
    }

    // Block common internal hostnames
    if (hostname === 'metadata.google.internal') return false
    if (hostname.endsWith('.internal') || hostname.endsWith('.local') ||
        hostname.endsWith('.localdomain') || hostname.endsWith('.lan') ||
        hostname.endsWith('.intranet') || hostname.endsWith('.corp') ||
        hostname.endsWith('.home') || hostname.endsWith('.private')) return false

    // DNS rebinding protection: resolve A and AAAA, reject if any address is private.
    // SEC-022: Fail-closed when DNS resolution fails so attacker-controlled domains
    // that intentionally NXDOMAIN at registration cannot smuggle past the check.
    let resolvedAny = false
    try {
      const addrs = await dns.resolve4(hostname)
      resolvedAny ||= addrs.length > 0
      for (const a of addrs) if (isPrivateIPv4(a)) return false
    } catch {}
    try {
      const addrs6 = await dns.resolve6(hostname)
      resolvedAny ||= addrs6.length > 0
      for (const a of addrs6) if (isPrivateIPv6(a)) return false
    } catch {}
    if (!resolvedAny) return false

    return true
  } catch {
    return false
  }
}

// Exposed so the webhook firer can re-validate at delivery time (DNS rebinding mitigation).
export { validateWebhookUrl as _validateWebhookUrlForDelivery }

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
