import { Hono } from 'hono'
import jwt from 'jsonwebtoken'
import { randomBytes } from 'crypto'
import { query } from '../db.js'
import { verifyMessage } from 'viem'

const JWT_SECRET = process.env.JWT_SECRET as string
if (!JWT_SECRET) {
  console.error('[auth] FATAL: JWT_SECRET environment variable is required')
  process.exit(1)
}
const JWT_EXPIRY = process.env.JWT_EXPIRY || '24h'

// Generate a nonce message for the agent to sign (EIP-4361 style with domain)
function buildSignMessage(nonce: string, timestamp: string, wallet: string): string {
  return `arcs-hive.vercel.app wants you to sign in with your wallet:

${wallet}

Nonce: ${nonce}
Issued At: ${timestamp}

URI: https://arcs-hive.vercel.app
Version: 1
Chain ID: 1`
}

// Generate cryptographically secure random nonce
function generateNonce(): string {
  return randomBytes(32).toString('hex')
}

export const auth = new Hono()

// Per-wallet nonce rate limit — 5 per minute per wallet
const nonceRateLimit = new Map<string, { count: number; resetAt: number }>()

// POST /api/auth/nonce — get a nonce to sign
auth.get('/nonce', async (c) => {
  const wallet = c.req.query('wallet')
  if (!wallet || !/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
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

  // Store nonce in DB (expires in 5 min)
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
  const body = await c.req.json()
  const { wallet, signature } = body

  if (!wallet || !signature) {
    return c.json({ error: 'wallet and signature required' }, 400)
  }

  if (!/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
    return c.json({ error: 'Invalid wallet address' }, 400)
  }

  // Get stored nonce
  const nonceResult = await query(
    `SELECT * FROM auth_nonces WHERE wallet_address = $1 AND used = false AND expires_at > NOW()`,
    [wallet.toLowerCase()]
  )

  if (nonceResult.rows.length === 0) {
    return c.json({ error: 'No valid nonce found. Request a new one at /api/auth/nonce' }, 400)
  }

  const nonceRecord = nonceResult.rows[0]
  const message = nonceRecord.message

  // Verify signature
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

  // Mark nonce as used
  await query(
    `UPDATE auth_nonces SET used = true WHERE id = $1`,
    [nonceRecord.id]
  )

  // Generate JWT
  const token = jwt.sign(
    {
      wallet: wallet.toLowerCase(),
      iat: Math.floor(Date.now() / 1000),
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY } as any
  )

  const decoded = jwt.decode(token) as any

  return c.json({
    token,
    wallet: wallet.toLowerCase(),
    expiresAt: new Date(decoded.exp * 1000).toISOString(),
  })
})

// GET /api/auth/verify — check if token is still valid (no body needed)
auth.get('/verify', async (c) => {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'No token provided' }, 401)
  }

  const token = authHeader.slice(7)
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any
    return c.json({
      valid: true,
      wallet: decoded.wallet,
      expiresAt: new Date(decoded.exp * 1000).toISOString(),
    })
  } catch (err: any) {
    return c.json({ valid: false, error: err.message }, 401)
  }
})
