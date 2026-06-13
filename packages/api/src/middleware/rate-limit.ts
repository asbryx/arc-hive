import type { MiddlewareHandler } from 'hono'

// Simple in-memory rate limiter (per IP, 100 req/min)
const requests = new Map<string, { count: number; resetAt: number }>()

const WINDOW_MS = 60_000
const MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX || '100', 10)
const CLEANUP_INTERVAL = 1000 // Check every 1000 requests
let requestCounter = 0

// SEC-050: Trust only headers we explicitly opt into via TRUSTED_PROXY_HEADER.
// Previous logic preferred `cf-connecting-ip`/`x-vercel-forwarded-for` unconditionally,
// but the upstream tunnel/proxy in this deployment forwards ALL headers verbatim,
// so any client could spoof those values to evade the limiter and SSRF allowlists.
const TRUSTED_PROXY_HEADER = (process.env.TRUSTED_PROXY_HEADER || '').toLowerCase()

function isIPv4(ip: string): boolean {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!m) return false
  const o = m.slice(1).map(Number)
  return o.every(n => n >= 0 && n <= 255)
}

function getClientIP(c: any): string {
  if (TRUSTED_PROXY_HEADER) {
    const v = c.req.header(TRUSTED_PROXY_HEADER)
    if (v) {
      const candidate = v.split(',')[0].trim()
      if (candidate && (isIPv4(candidate) || candidate.includes(':'))) return candidate
    }
  }

  const trustCount = parseInt(process.env.TRUSTED_PROXY_COUNT || '0', 10)
  const xff = c.req.header('x-forwarded-for')
  if (xff && trustCount > 0) {
    const ips = xff.split(',').map((s: string) => s.trim()).filter(Boolean)
    const idx = Math.max(0, ips.length - 1 - trustCount)
    if (ips[idx]) return ips[idx]
  }

  // SEC-051: Do not blindly accept x-real-ip / cf-connecting-ip without configuration.
  const env = (c as any).env
  const remote = env?.incoming?.socket?.remoteAddress
  return remote || 'unknown'
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

    if (requestCounter > CLEANUP_INTERVAL) {
      requestCounter = 0
      for (const [key, val] of requests) {
        if (now > val.resetAt) requests.delete(key)
      }
    }
  }
}
