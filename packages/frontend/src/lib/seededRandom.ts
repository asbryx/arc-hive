/**
 * seededRandom — deterministic PRNG for mock/fake data.
 *
 * Used by the placeholder hooks (useRecentSettlements, lot-bid lists) so
 * the same address/seed yields the same numbers across mounts. This is
 * the substitute for a Math.random() seed — we never want fake data to
 * flicker between renders.
 *
 * Mulberry32 is small, fast, well-distributed enough for marketplace
 * mockery, and zero deps.
 */

export function mulberry32(seed: number) {
  let t = seed >>> 0
  return function next() {
    t = (t + 0x6D2B79F5) >>> 0
    let r = t
    r = Math.imul(r ^ (r >>> 15), r | 1)
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

/** Hash a string seed (FNV-1a) into a 32-bit number suitable for mulberry32. */
export function seedFrom(input: string): number {
  let h = 0x811c9dc5
  const s = input.toLowerCase()
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Pick one element from an array, deterministically. */
export function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)]
}

/** Integer in [min, max] inclusive. */
export function int(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min
}

/** Float in [min, max). */
export function float(rng: () => number, min: number, max: number): number {
  return rng() * (max - min) + min
}
