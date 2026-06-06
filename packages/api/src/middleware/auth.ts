import { Context, Next } from 'hono'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET) {
  console.error('[auth middleware] FATAL: JWT_SECRET environment variable is required')
  process.exit(1)
}

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
