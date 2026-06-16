/* ─────────────────────────────────────────────────────────────────
   agentGlyph — deterministic generative glyph from an address.

   Each agent gets:
     • a glyph (one of 10 named symbol shapes, derived from address hash)
     • a color (one of the six cartographic status colors)
     • a position (one of the 6 curated slots on the broadsheet plate,
       reserved so labels never collide with flight-line corridors,
       deterministically assigned by score rank)

   The 10 glyph symbols are the same ones used in mockup #27
   (g-lyra, g-carter, g-thorne, g-marlow, g-verity, g-halden,
    g-iris, g-ester, g-octavia, g-felix). They're emitted as one
   <defs><symbol> block by the BroadsheetHero component and
   referenced by <use href="#g-<name>"/>.
   ───────────────────────────────────────────────────────────────── */

export const GLYPH_NAMES = [
  'lyra', 'carter', 'thorne', 'marlow', 'verity',
  'halden', 'iris', 'ester', 'octavia', 'felix',
] as const
export type GlyphName = typeof GLYPH_NAMES[number]

export type AgentStatus = 'executing' | 'bidding' | 'delivering' | 'idle' | 'inactive'

/* deterministic 32-bit hash (FNV-1a variant). Non-crypto. */
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

/** Deterministic glyph name from address hash. */
export function glyphFor(addr: string | null | undefined): GlyphName {
  const h = hash32(normalize(addr))
  return GLYPH_NAMES[h % GLYPH_NAMES.length]
}

/** One of the six cartographic colors keyed by status (fallback rotates by hash). */
export function colorFor(addr: string | null | undefined, status?: AgentStatus): string {
  if (status === 'executing')  return 'var(--hot)'
  if (status === 'bidding')    return 'var(--ochre)'
  if (status === 'delivering') return 'var(--marsh)'
  if (status === 'idle')       return 'var(--slate)'
  if (status === 'inactive')   return 'var(--dust)'
  const h = hash32(normalize(addr))
  return (['var(--hot)','var(--ochre)','var(--marsh)','var(--slate)','var(--dust)','var(--ink)'])[h % 6]
}

/** Convert a last-active timestamp (and optional explicit flags) into a status. */
export function statusFor(
  lastActiveAt: string | number | null | undefined,
  flags?: { executing?: boolean; bidding?: boolean; delivering?: boolean }
): AgentStatus {
  if (flags?.executing)  return 'executing'
  if (flags?.delivering) return 'delivering'
  if (flags?.bidding)    return 'bidding'
  if (!lastActiveAt) return 'inactive'
  const t = typeof lastActiveAt === 'number' ? lastActiveAt : Date.parse(lastActiveAt)
  if (!Number.isFinite(t)) return 'inactive'
  const ageMs = Date.now() - t
  const HOUR = 3_600_000
  if (ageMs < 6 * HOUR)      return 'idle'      // active in last 6h → slate
  if (ageMs < 24 * HOUR * 7) return 'inactive'
  return 'inactive'
}
