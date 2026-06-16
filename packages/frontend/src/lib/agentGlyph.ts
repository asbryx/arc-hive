/* ─────────────────────────────────────────────────────────────────
   agentGlyph — deterministic generative glyph + cartographic
   position from an agent's wallet address.

   Every agent on the broadsheet hero is rendered as a tiny
   procedurally-generated mark, and is placed at a (x, y) on the
   plate canvas that is a stable function of its address. Same
   address → same glyph + same dot for the lifetime of the agent.
   ───────────────────────────────────────────────────────────────── */

/* deterministic 32-bit hash (FNV-1a variant). Safe for non-crypto use. */
function hash32(input: string, seed = 0x811c9dc5): number {
  let h = seed >>> 0
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

function normalize(addr: string | null | undefined): string {
  if (!addr) return '0x0'
  return addr.toLowerCase().replace(/^0x/, '')
}

/** Stable [0,1] position on the cartographic plate. */
export function glyphPosition(addr: string | null | undefined): { x: number; y: number } {
  const a = normalize(addr)
  const hx = hash32(a, 0x9e3779b1)
  const hy = hash32(a, 0x85ebca6b)
  // keep marks inside a 6% inset so they don't touch the plate frame
  const x = 0.06 + (hx % 10000) / 10000 * 0.88
  const y = 0.08 + (hy % 10000) / 10000 * 0.84
  return { x, y }
}

/** One of the six cartographic colors derived from address + status. */
export function glyphColor(
  addr: string | null | undefined,
  status?: 'executing' | 'bidding' | 'delivering' | 'idle' | 'inactive'
): string {
  if (status === 'executing')  return 'var(--hot)'
  if (status === 'bidding')    return 'var(--ochre)'
  if (status === 'delivering') return 'var(--marsh)'
  if (status === 'idle')       return 'var(--slate)'
  if (status === 'inactive')   return 'var(--dust)'
  // unknown status: rotate through the six by address hash
  const h = hash32(normalize(addr))
  return (['var(--hot)','var(--ochre)','var(--marsh)','var(--slate)','var(--dust)','var(--ink)'])[h % 6]
}

/**
 * Glyph shape: 1 of 6 deterministic primitives, each composed of 2–3
 * primitive elements (dot, ring, tick, cross-mark, triangle, square).
 * Returns an SVG <g> innerHTML fragment positioned at (0,0), nominal
 * box ±6 units. Caller wraps in <g transform="translate(...) scale(...)">.
 */
export function glyphSvg(addr: string | null | undefined, opts?: { stroke?: string }): string {
  const stroke = opts?.stroke ?? 'currentColor'
  const h = hash32(normalize(addr))
  const shape = h % 6
  const stub = `stroke="${stroke}" stroke-width="0.9" fill="none" stroke-linecap="round"`

  switch (shape) {
    case 0: // dot + ring
      return `<circle cx="0" cy="0" r="1.4" fill="${stroke}"/><circle cx="0" cy="0" r="3.6" ${stub}/>`
    case 1: // cross-mark in a ring
      return `<circle cx="0" cy="0" r="3.6" ${stub}/><path d="M-2.4 0 H2.4 M0 -2.4 V2.4" ${stub}/>`
    case 2: // triangle + tick
      return `<path d="M0 -3.6 L3.2 2.4 L-3.2 2.4 Z" ${stub}/><circle cx="0" cy="0" r="0.9" fill="${stroke}"/>`
    case 3: // square + dot
      return `<rect x="-2.8" y="-2.8" width="5.6" height="5.6" ${stub}/><circle cx="0" cy="0" r="1" fill="${stroke}"/>`
    case 4: // four ticks (compass)
      return `<path d="M0 -4 V-1.6 M0 1.6 V4 M-4 0 H-1.6 M1.6 0 H4" ${stub}/><circle cx="0" cy="0" r="0.9" fill="${stroke}"/>`
    case 5: // dashed ring + dot
    default:
      return `<circle cx="0" cy="0" r="3.6" ${stub} stroke-dasharray="1.4 1.2"/><circle cx="0" cy="0" r="1.1" fill="${stroke}"/>`
  }
}

/** Convert epoch-ms-or-iso last-active stamp into one of the five statuses. */
export function statusFromLastActive(
  lastActiveAt: string | number | null | undefined,
  isExecuting?: boolean,
  isBidding?: boolean
): 'executing' | 'bidding' | 'delivering' | 'idle' | 'inactive' {
  if (isExecuting) return 'executing'
  if (isBidding) return 'bidding'
  if (!lastActiveAt) return 'inactive'
  const t = typeof lastActiveAt === 'number' ? lastActiveAt : Date.parse(lastActiveAt)
  if (!Number.isFinite(t)) return 'inactive'
  // 'delivering' isn't derivable from lastActive alone; default to slate/idle/inactive
  const ageMs = Date.now() - t
  const HOUR = 3_600_000
  if (ageMs < 6 * HOUR) return 'idle'           // active in last 6h → slate dot
  if (ageMs < 24 * HOUR * 7) return 'inactive'  // active in last week
  return 'inactive'
}
