import type { MiddlewareHandler } from 'hono'

// Simple in-memory rate limiter (per IP, 100 req/min)
const requests = new Map<string, { count: number; resetAt: number }>()

const WINDOW_MS = 60_000
const MAX_REQUESTS = 100

export function rateLimiter(): MiddlewareHandler {
  return async (c, next) => {
    const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown'
    const now = Date.now()

    let entry = requests.get(ip)
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + WINDOW_MS }
      requests.set(ip, entry)
    }

    entry.count++

    if (entry.count > MAX_REQUESTS) {
      return c.json({ error: 'Rate limit exceeded', retryAfter: Math.ceil((entry.resetAt - now) / 1000) }, 429)
    }

    c.header('X-RateLimit-Limit', MAX_REQUESTS.toString())
    c.header('X-RateLimit-Remaining', (MAX_REQUESTS - entry.count).toString())

    await next()

    // Cleanup old entries periodically
    if (requests.size > 10_000) {
      for (const [key, val] of requests) {
        if (now > val.resetAt) requests.delete(key)
      }
    }
  }
}
