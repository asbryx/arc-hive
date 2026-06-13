// Security regression tests for the fixes in branch security/full-audit-fixes-jun14.
// These run under vitest. They are pure unit tests — no DB / no network.

import { describe, it, expect, beforeAll } from 'vitest'

// Set required env BEFORE importing modules that read it at module-load time.
beforeAll(() => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'a'.repeat(64)
  process.env.JWT_ISSUER = 'arcs-hive'
  process.env.JWT_AUDIENCE = 'arcs-hive-api'
})

describe('JWT verification (SEC-001 / SEC-002 / SEC-006)', () => {
  it('rejects tokens with alg=none', async () => {
    const { verifyToken } = await import('../middleware/auth.js')
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
    const payload = Buffer.from(JSON.stringify({ wallet: '0x' + '0'.repeat(40), iss: 'arcs-hive', aud: 'arcs-hive-api', exp: Math.floor(Date.now() / 1000) + 60 })).toString('base64url')
    const token = `${header}.${payload}.`
    expect(verifyToken(token)).toBeNull()
  })

  it('rejects tokens with non-HS256 alg', async () => {
    const { verifyToken } = await import('../middleware/auth.js')
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
    const payload = Buffer.from(JSON.stringify({ wallet: '0x' + '0'.repeat(40) })).toString('base64url')
    const token = `${header}.${payload}.signature`
    expect(verifyToken(token)).toBeNull()
  })

  it('rejects tokens missing iss/aud', async () => {
    const { verifyToken } = await import('../middleware/auth.js')
    const jwt = (await import('jsonwebtoken')).default
    const token = jwt.sign({ wallet: '0x' + '0'.repeat(40) }, process.env.JWT_SECRET as string, { algorithm: 'HS256', expiresIn: '5m' })
    expect(verifyToken(token)).toBeNull()
  })

  it('accepts a properly issued HS256 token', async () => {
    const { signToken, verifyToken } = await import('../middleware/auth.js')
    const wallet = '0x' + '1'.repeat(40)
    const token = signToken({ wallet }, '5m')
    expect(verifyToken(token)?.wallet).toBe(wallet)
  })

  it('rejects token with wrong wallet shape', async () => {
    const { verifyToken } = await import('../middleware/auth.js')
    const jwt = (await import('jsonwebtoken')).default
    const token = jwt.sign(
      { wallet: 'not-a-wallet' },
      process.env.JWT_SECRET as string,
      { algorithm: 'HS256', expiresIn: '5m', issuer: 'arcs-hive', audience: 'arcs-hive-api' }
    )
    expect(verifyToken(token)).toBeNull()
  })
})

describe('SSRF guard (SEC-020 / SEC-021 / SEC-022)', () => {
  it('blocks loopback IP literals', async () => {
    const mod = await import('../routes/keys.js')
    const fn = (mod as any)._validateWebhookUrlForDelivery
    expect(await fn('https://127.0.0.1/cb')).toBe(false)
    expect(await fn('https://[::1]/cb')).toBe(false)
  })

  it('blocks RFC1918 IPs', async () => {
    const mod = await import('../routes/keys.js')
    const fn = (mod as any)._validateWebhookUrlForDelivery
    expect(await fn('https://10.0.0.1/cb')).toBe(false)
    expect(await fn('https://192.168.1.1/cb')).toBe(false)
    expect(await fn('https://172.16.0.1/cb')).toBe(false)
  })

  it('blocks Tailscale CGNAT range', async () => {
    const mod = await import('../routes/keys.js')
    const fn = (mod as any)._validateWebhookUrlForDelivery
    expect(await fn('https://100.64.0.1/cb')).toBe(false)
    expect(await fn('https://100.127.255.255/cb')).toBe(false)
  })

  it('blocks AWS metadata IP', async () => {
    const mod = await import('../routes/keys.js')
    const fn = (mod as any)._validateWebhookUrlForDelivery
    expect(await fn('https://169.254.169.254/latest/meta-data/')).toBe(false)
  })

  it('blocks IPv6 link-local and ULA', async () => {
    const mod = await import('../routes/keys.js')
    const fn = (mod as any)._validateWebhookUrlForDelivery
    expect(await fn('https://[fe80::1]/cb')).toBe(false)
    expect(await fn('https://[fc00::1]/cb')).toBe(false)
    expect(await fn('https://[fd00::1]/cb')).toBe(false)
  })

  it('blocks .internal / .local / .corp suffixes', async () => {
    const mod = await import('../routes/keys.js')
    const fn = (mod as any)._validateWebhookUrlForDelivery
    expect(await fn('https://api.internal/cb')).toBe(false)
    expect(await fn('https://api.local/cb')).toBe(false)
    expect(await fn('https://api.corp/cb')).toBe(false)
  })

  it('rejects http:// (HTTPS only)', async () => {
    const mod = await import('../routes/keys.js')
    const fn = (mod as any)._validateWebhookUrlForDelivery
    expect(await fn('http://example.com/cb')).toBe(false)
  })

  it('rejects URLs with userinfo', async () => {
    const mod = await import('../routes/keys.js')
    const fn = (mod as any)._validateWebhookUrlForDelivery
    expect(await fn('https://attacker:pass@example.com/cb')).toBe(false)
  })
})

describe('storage path safety (SEC-012)', () => {
  it('rejects path traversal attempts', async () => {
    // Re-import after env is set so module config picks up.
    const { downloadFile } = await import('../supabase.js')
    const r = await downloadFile('../../../etc/passwd')
    expect(r.data).toBeNull()
  })
  it('rejects absolute paths', async () => {
    const { downloadFile } = await import('../supabase.js')
    const r = await downloadFile('/etc/shadow')
    expect(r.data).toBeNull()
  })
})
