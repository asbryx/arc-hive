import { Context, Next } from 'hono'
import jwt from 'jsonwebtoken'

// Support JWT secret rotation: primary + optional comma-separated previous secrets
const JWT_SECRET = process.env.JWT_SECRET as string
if (!JWT_SECRET) {
  console.error('[auth middleware] FATAL: JWT_SECRET environment variable is required')
  process.exit(1)
}

// SEC-001: Reject default/weak JWT secrets at startup so we never sign with a known value
const WEAK_JWT_SECRETS = new Set([
  'changeme', 'change-me', 'secret', 'jwtsecret', 'jwt-secret',
  'development', 'dev', 'test', 'password', 'archivee', 'archivehub',
])
// Allow opt-out for tests via JWT_SECRET_RELAX (NOT for production)
if (!process.env.JWT_SECRET_RELAX) {
  if (JWT_SECRET.length < 32 || WEAK_JWT_SECRETS.has(JWT_SECRET.toLowerCase())) {
    console.error('[auth middleware] FATAL: JWT_SECRET must be at least 32 random bytes and not a common/weak value')
    process.exit(1)
  }
}

// Rotation: JWT_PREVIOUS_SECRETS can be comma-separated list of old secrets
// New tokens are signed with JWT_SECRET; old secrets are tried for verification only
const JWT_PREVIOUS_SECRETS = (process.env.JWT_PREVIOUS_SECRETS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)

const ALL_SECRETS = [JWT_SECRET, ...JWT_PREVIOUS_SECRETS]

const JWT_ISSUER = process.env.JWT_ISSUER || 'arcs-hive'
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'arcs-hive-api'

// SEC-002: Defence-in-depth — explicitly forbid alg=none / unsupported algs
// by inspecting the header before passing to jsonwebtoken's verifier.
function inspectAlg(token: string): boolean {
  const headerB64 = token.split('.')[0]
  if (!headerB64) return false
  try {
    const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8'))
    return Boolean(header && typeof header.alg === 'string' && header.alg.toUpperCase() === 'HS256')
  } catch {
    return false
  }
}

function verifyWithSecrets(token: string): string | null {
  if (!inspectAlg(token)) return null
  for (const secret of ALL_SECRETS) {
    try {
      const decoded = jwt.verify(token, secret, {
        algorithms: ['HS256'],
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      }) as jwt.JwtPayload
      const wallet = decoded.wallet
      if (typeof wallet !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(wallet)) continue
      return wallet.toLowerCase()
    } catch {
      // try next secret
    }
  }
  return null
}

// Extract wallet from JWT token (tries all secrets for rotation)
export function getWalletFromToken(c: Context): string | null {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  return verifyWithSecrets(authHeader.slice(7))
}

// Sign new tokens with the current (primary) secret only
export function signToken(payload: { wallet: string }, expiresIn: string = '24h'): string {
  return jwt.sign(payload, JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: expiresIn as any,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  })
}

// Helper for routes that previously called jwt.verify directly with no algorithm allowlist.
export function verifyToken(token: string): { wallet: string } | null {
  const wallet = verifyWithSecrets(token)
  return wallet ? { wallet } : null
}

// Middleware: require valid JWT for write operations
export async function requireAuth(c: Context, next: Next) {
  const wallet = getWalletFromToken(c)
  if (!wallet) {
    return c.json({
      error: 'Authentication required. Sign a message with your wallet at /api/auth/nonce → /api/auth/verify',
    }, 401)
  }

  c.set('wallet', wallet)
  await next()
}

// Middleware: optional auth — attaches wallet if present, doesn't block
export async function optionalAuth(c: Context, next: Next) {
  const wallet = getWalletFromToken(c)
  if (wallet) {
    c.set('wallet', wallet)
  }
  await next()
}
