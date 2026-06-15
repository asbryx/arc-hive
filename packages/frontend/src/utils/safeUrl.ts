/**
 * URL sanitization helpers.
 *
 * Audit fix T4 (2026-06-15): agent-controlled fields (portfolio.url,
 * portfolio.image_url, deliverable.link) flowed straight into JSX `href`
 * and `src` attributes. A malicious agent could submit a `javascript:`
 * URL; any visitor's JWT (in localStorage) would then be stealable on
 * click.
 *
 * Use `safeHref(...)` for `<a href>`, `safeImageSrc(...)` for `<img src>`.
 * Both return `undefined` for unsafe inputs — the attribute is then simply
 * omitted by React, rather than rendering a broken/dangerous one.
 */

const HTTP_SCHEMES = new Set(['http:', 'https:'])
const IMAGE_SCHEMES = new Set(['http:', 'https:', 'data:'])

// data: image — only allow the common raster + svg-image types.
// We deliberately exclude data:text/html, data:application/* etc.
const SAFE_DATA_IMAGE_RE =
  /^data:image\/(png|jpe?g|gif|webp|avif|svg\+xml);(base64,|[^,]*,)/i

/**
 * Sanitize a URL intended for `<a href>`.
 *
 * Returns the trimmed URL if it parses to a safe http(s) origin, otherwise
 * `undefined`. Allowed schemes: http, https. Rejected: javascript, data,
 * vbscript, file, plus anything that doesn't parse as a URL at all.
 *
 * Relative URLs (`/foo`, `./foo`, `foo`) are also accepted — those can't
 * be malicious unless the agent controls our own origin, in which case
 * we have bigger problems.
 */
export function safeHref(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const trimmed = raw.trim()
  if (trimmed === '') return undefined

  // Relative URLs are always safe (no scheme = same origin)
  if (/^(?:\/|\.\.?\/|#|\?)/.test(trimmed)) return trimmed

  // Mailto / tel — render but don't open js
  if (/^(mailto|tel):/i.test(trimmed)) return trimmed

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    // Not a valid URL — could be a domain like "example.com" the agent
    // forgot to prefix. Best NOT to silently add https:// (a malicious
    // string like "javascript\u00aialert(1)" would be hidden by
    // url-encoding under prefix). Bail.
    return undefined
  }

  // Catches javascript:, data:, vbscript:, file:, blob:, etc.
  if (!HTTP_SCHEMES.has(parsed.protocol)) return undefined

  return parsed.toString()
}

/**
 * Sanitize a URL intended for `<img src>`.
 *
 * Allows http(s) and a limited subset of data:image/ types. Everything
 * else (including data:text/html, javascript:) returns undefined.
 */
export function safeImageSrc(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const trimmed = raw.trim()
  if (trimmed === '') return undefined

  if (/^(?:\/|\.\.?\/)/.test(trimmed)) return trimmed

  // data:image/... — match against a deliberately strict allow-list
  if (/^data:/i.test(trimmed)) {
    return SAFE_DATA_IMAGE_RE.test(trimmed) ? trimmed : undefined
  }

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return undefined
  }

  if (!IMAGE_SCHEMES.has(parsed.protocol)) return undefined
  return parsed.toString()
}

/**
 * Convenience: returns a host string ("example.com") for display, or null.
 * Useful when you want to show users where a link goes before they click.
 */
export function safeHostname(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  try {
    const u = new URL(raw)
    if (!HTTP_SCHEMES.has(u.protocol)) return null
    return u.hostname
  } catch {
    return null
  }
}
