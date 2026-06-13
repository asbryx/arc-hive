import { Hono } from 'hono'
import { randomBytes } from 'crypto'
import { query } from '../db.js'
import { verifyMessage } from 'viem'
import { signToken, verifyToken } from '../middleware/auth.js'

const JWT_EXPIRY = process.env.JWT_EXPIRY || '24h'
const APP_DOMAIN = process.env.APP_DOMAIN || 'arcs-hive.vercel.app'
const APP_URI = process.env.APP_URI || `https://${APP_DOMAIN}`
const CHAIN_ID = parseInt(process.env.AUTH_CHAIN_ID || '5042002', 10)

// SEC-014: Sign-in message binds to the actual application chain (Arc Testnet 5042002),
// makes clear no transaction is being signed, and follows EIP-4361 / SIWE shape.
function buildSignMessage(nonce: string, timestamp: string, wallet: string): string {
  return `${APP_DOMAIN} wants you to sign in with your wallet:

${wallet}

Sign in to ArcHive. This signature does not authorize any transaction or token transfer.

Nonce: ${nonce}
Issued At: ${timestamp}

URI: ${APP_URI}
Version: 1
Chain ID: ${CHAIN_ID}`
}

// Generate cryptographically secure random nonce
function generateNonce(): string {
  return randomBytes(32).toString('hex')
}

export const auth = new Hono()

// Per-wallet nonce rate limit — 5 per minute per wallet
const nonceRateLimit = new Map<string, { count: number; resetAt: number }>()

// Periodic cleanup so the in-memory map can't grow unbounded under abuse
setInterval(() => {
  const now = Date.now()
  for (const [wallet, entry] of nonceRateLimit) {
    if (entry.resetAt < now) nonceRateLimit.delete(wallet)
  }
}, 5 * 60_000).unref()

// POST /api/auth/nonce — get a nonce to sign
auth.post('/nonce', async (c) => {
  const body = await c.req.json().catch(() => null)
  const wallet = body?.wallet
  if (!wallet || typeof wallet !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
    return c.json({ error: 'Valid wallet address required (0x...)' }, 400)
  }

  // Rate limit: max 5 nonces per minute per wallet
  const now = Date.now()
  let entry = nonceRateLimit.get(wallet.toLowerCase())
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + 60_000 }
    nonceRateLimit.set(wallet.toLowerCase(), entry)
  }
  entry.count++
  if (entry.count > 5) {
    return c.json({ error: 'Too many nonce requests. Wait a minute.' }, 429)
  }

  const nonce = generateNonce()
  const timestamp = new Date().toISOString()
  const message = buildSignMessage(nonce, timestamp, wallet.toLowerCase())

  await query(
    `INSERT INTO auth_nonces (wallet_address, nonce, message, expires_at)
     VALUES ($1, $2, $3, NOW() + INTERVAL '5 minutes')
     ON CONFLICT (wallet_address) DO UPDATE SET
       nonce = EXCLUDED.nonce,
       message = EXCLUDED.message,
       expires_at = EXCLUDED.expires_at,
       used = false`,
    [wallet.toLowerCase(), nonce, message]
  )

  return c.json({ message, nonce, timestamp })
})

// POST /api/auth/verify — verify signed message, return JWT
auth.post('/verify', async (c) => {
  const body = await c.req.json().catch(() => null)
  const wallet = body?.wallet
  const signature = body?.signature

  if (!wallet || !signature) {
    return c.json({ error: 'wallet and signature required' }, 400)
  }
  // SEC-016: Type and shape check before any DB / crypto work
  if (typeof wallet !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
    return c.json({ error: 'Invalid wallet address' }, 400)
  }
  if (typeof signature !== 'string' || !/^0x[0-9a-fA-F]{2,520}$/.test(signature)) {
    return c.json({ error: 'Invalid signature format' }, 400)
  }

  // Atomic check-and-set: single UPDATE that marks as used AND returns the row
  const lockResult = await query(
    `UPDATE auth_nonces SET used = true
     WHERE wallet_address = $1 AND used = false AND expires_at > NOW()
     RETURNING id, nonce, wallet_address, message`,
    [wallet.toLowerCase()]
  )

  if (!lockResult.rows.length) {
    return c.json({ error: 'No valid nonce found. Request a new one at /api/auth/nonce' }, 401)
  }

  const nonceRecord = lockResult.rows[0]
  const message = nonceRecord.message

  let isValid = false
  try {
    isValid = await verifyMessage({
      address: wallet as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    })
  } catch (err: any) {
    console.error('[auth] Signature verification error:', err.message)
    return c.json({ error: 'Invalid signature' }, 401)
  }

  if (!isValid) {
    return c.json({ error: 'Signature does not match wallet' }, 401)
  }

  // Generate JWT (HS256, iss + aud bound) using the central signer
  const token = signToken({ wallet: wallet.toLowerCase() }, JWT_EXPIRY)

  // SEC-015: Compute expiresAt from configured expiry rather than jwt.decode (which can return null).
  const expiresAt = new Date(Date.now() + parseExpiryToMs(JWT_EXPIRY)).toISOString()

  return c.json({
    token,
    wallet: wallet.toLowerCase(),
    expiresAt,
  })
})

// GET /api/auth/verify — check if token is still valid (no body needed)
auth.get('/verify', async (c) => {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'No token provided' }, 401)
  }

  const token = authHeader.slice(7)
  const result = verifyToken(token)
  if (!result) {
    return c.json({ valid: false, error: 'Invalid or expired token' }, 401)
  }
  return c.json({ valid: true, wallet: result.wallet })
})

function parseExpiryToMs(expiry: string): number {
  // Mirrors jsonwebtoken's basic accepted forms — used only to report expiresAt to the client.
  const m = /^(\d+)\s*(s|m|h|d)$/.exec(expiry)
  if (!m) return 24 * 3600 * 1000
  const n = parseInt(m[1], 10)
  switch (m[2]) {
    case 's': return n * 1000
    case 'm': return n * 60 * 1000
    case 'h': return n * 3600 * 1000
    case 'd': return n * 24 * 3600 * 1000
    default: return 24 * 3600 * 1000
  }
}
