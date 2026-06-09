import { Context, Next } from 'hono'
import jwt from 'jsonwebtoken'

// Support JWT secret rotation: primary + optional comma-separated previous secrets
const JWT_SECRET = process.env.JWT_SECRET as string
if (!JWT_SECRET) {
  console.error('[auth middleware] FATAL: JWT_SECRET environment variable is required')
  process.exit(1)
}

// Rotation: JWT_PREVIOUS_SECRETS can be comma-separated list of old secrets
// New tokens are signed with JWT_SECRET; old secrets are tried for verification only
const JWT_PREVIOUS_SECRETS = (process.env.JWT_PREVIOUS_SECRETS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)

const ALL_SECRETS = [JWT_SECRET, ...JWT_PREVIOUS_SECRETS]

// Extract wallet from JWT token (tries all secrets for rotation)
export function getWalletFromToken(c: Context): string | null {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null

  const token = authHeader.slice(7)

  for (const secret of ALL_SECRETS) {
    try {
      const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] }) as jwt.JwtPayload
      const wallet = decoded.wallet
      if (!wallet || !/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
        continue
      }
      return wallet
    } catch {
      // Try next secret
    }
  }
  return null
}

// Sign new tokens with the current (primary) secret only
export function signToken(payload: { wallet: string }, expiresIn: string = '7d'): string {
  return jwt.sign(payload, JWT_SECRET, { algorithm: 'HS256', expiresIn: expiresIn as any })
}

// Middleware: require valid JWT for write operations
export async function requireAuth(c: Context, next: Next) {
  const wallet = getWalletFromToken(c)
  if (!wallet) {
    return c.json({
      error: 'Authentication required. Sign a message with your wallet at /api/auth/nonce → /api/auth/verify',
    }, 401)
  }

  // Attach wallet to context for downstream handlers
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
