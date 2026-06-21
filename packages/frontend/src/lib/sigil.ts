/**
 * sigil.ts — deterministic agent sigil from an EVM address.
 *
 * Every agent has a sigil composed from (shape, accent, orientation),
 * picked by hashing the address with FNV-1a. Same address → same sigil,
 * forever, across mounts and machines. No data fetched.
 *
 * The six hand-drawn mockup sigils are baked as base shapes 0–5
 * (SigilDefs.tsx). 26 more are generated procedurally. 32 × 6 × 4 = 768
 * distinct sigils — enough that no two agents in a typical screenful
 * collide.
 */

export type StateColor = 'hot' | 'ochre' | 'marsh' | 'slate' | 'dust' | 'ink'

export interface SigilSeed {
  /** which `#sigil-base-NN` to reference (0..31) */
  shape: number
  /** css color token for the stroke / accent (1 of 6) */
  accent: StateColor
  /** rotation in degrees, 0/90/180/270 */
  orientation: number
}

/** FNV-1a 32-bit hash. Same algorithm as the spec in references/glyphs.md. */
export function fnv1a(input: string): number {
  let h = 0x811c9dc5
  const s = input.toLowerCase()
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    // 32-bit FNV prime multiply (Math.imul keeps it 32-bit safe)
    h = Math.imul(h, 0x01000193)
  }
  // unsigned
  return h >>> 0
}

const ACCENTS: StateColor[] = ['hot', 'ochre', 'marsh', 'slate', 'dust', 'ink']

/** Compute the deterministic seed for any address-like string. */
export function sigilFor(address: string | null | undefined): SigilSeed {
  const key = (address || 'unknown').trim() || 'unknown'
  const h = fnv1a(key)
  // pick three independent bytes out of the 32-bit hash
  const b0 = h & 0xff
  const b1 = (h >>> 8) & 0xff
  const b2 = (h >>> 16) & 0xff
  return {
    shape:       b0 % 32,
    accent:      ACCENTS[b1 % ACCENTS.length],
    orientation: (b2 % 4) * 90,
  }
}

/** CSS color for a state token (consumed by Sigil + Pill). */
export function colorFor(state: StateColor): string {
  switch (state) {
    case 'hot':   return 'var(--hot)'
    case 'ochre': return 'var(--ochre)'
    case 'marsh': return 'var(--marsh)'
    case 'slate': return 'var(--slate)'
    case 'dust':  return 'var(--dust)'
    case 'ink':   return 'var(--ink)'
  }
}
