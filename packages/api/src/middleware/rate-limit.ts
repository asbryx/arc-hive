import type { MiddlewareHandler } from 'hono'

// Simple in-memory rate limiter (per IP, 100 req/min)
const requests = new Map<string, { count: number; resetAt: number }>()

const WINDOW_MS = 60_000
const MAX_REQUESTS = 100
const CLEANUP_INTERVAL = 1000 // Check every 1000 requests
let requestCounter = 0

function getClientIP(c: any): string {
  const trustCount = parseInt(process.env.TRUSTED_PROXY_COUNT || '1', 10)
  const xff = c.req.header('x-forwarded-for')
  if (xff) {
    const ips = xff.split(',').map((s: string) => s.trim()).filter(Boolean)
    if (ips.length > trustCount) {
      return ips[ips.length - 1 - trustCount]
    }
  }
  return c.req.header('x-real-ip') || c.req.header('cf-connecting-ip') || 'unknown'
}

export function rateLimiter(): MiddlewareHandler {
  return async (c, next) => {
    const ip = getClientIP(c)
    const now = Date.now()

    let entry = requests.get(ip)
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + WINDOW_MS }
      requests.set(ip, entry)
    }

    entry.count++
    requestCounter++

    if (entry.count > MAX_REQUESTS) {
      return c.json({ error: 'Rate limit exceeded', retryAfter: Math.ceil((entry.resetAt - now) / 1000) }, 429)
    }

    c.header('X-RateLimit-Limit', MAX_REQUESTS.toString())
    c.header('X-RateLimit-Remaining', Math.max(0, MAX_REQUESTS - entry.count).toString())

    await next()

    // Periodic cleanup of expired entries
    if (requestCounter > CLEANUP_INTERVAL) {
      requestCounter = 0
      for (const [key, val] of requests) {
        if (now > val.resetAt) requests.delete(key)
      }
    }
  }
}
