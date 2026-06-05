import { Context, Next } from 'hono'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || process.env.PROVIDER_PRIVATE_KEY || 'arc-hive-dev-secret-change-me'

// Extract wallet from JWT token
export function getWalletFromToken(c: Context): string | null {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null

  try {
    const token = authHeader.slice(7)
    const decoded = jwt.verify(token, JWT_SECRET) as any
    return decoded.wallet || null
  } catch {
    return null
  }
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
