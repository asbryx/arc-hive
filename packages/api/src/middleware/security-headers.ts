import type { MiddlewareHandler } from 'hono'

export function securityHeaders(): MiddlewareHandler {
  return async (c, next) => {
    // Prevent MIME type sniffing
    c.header('X-Content-Type-Options', 'nosniff')
    // Prevent clickjacking
    c.header('X-Frame-Options', 'DENY')
    // XSS protection (legacy but still useful for older browsers)
    c.header('X-XSS-Protection', '1; mode=block')
    // Referrer policy
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin')
    // Permissions policy — restrict sensitive APIs
    c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()')
    // Content Security Policy
    c.header('Content-Security-Policy', [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.vercel.app",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: https: blob:",
      "connect-src 'self' https://*.vercel.app https://*.supabase.co https://rpc.testnet.arc.network wss:",
      "frame-ancestors 'none'",
      "form-action 'self'",
    ].join('; '))
    // HSTS (only in production with HTTPS)
    if (c.req.url.startsWith('https://')) {
      c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
    }

    await next()
  }
}
