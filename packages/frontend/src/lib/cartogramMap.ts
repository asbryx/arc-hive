/**
 * cartogramMap — the territory's geography.
 *
 * The cartogram is "address space as a place." This module defines that
 * place as a real map:
 *
 *   PEAKS        — six activity centers. Their gaussian sum is the
 *                  elevation field (see contourField.ts). Busy clusters
 *                  = highlands, idle space = lowland.
 *   SETTLEMENTS  — the named agents, each sitting ON a peak (its capital).
 *                  A settlement has a glyph, a name, an address, a score.
 *   PORT         — the single client gateway on the west coast where
 *                  briefs enter the territory.
 *   ROUTES       — trade routes from the port to active settlements.
 *                  Both endpoints are real, visible places — no dangling
 *                  lines into empty space.
 *   STIPPLE      — ~600 tiny dots, denser on the highlands, that read as
 *                  the 1,284-agent ambient population (Stamen-style
 *                  terrain texture, not random confetti).
 *
 * Pure + deterministic. viewBox is 1600 × 900 (matches the plate box).
 */

import { mulberry32, seedFrom } from './seededRandom'
import type { Peak } from './contourField'

/** viewBox — wide plate ratio (~2.5:1) so the map fills the box with
 *  preserveAspectRatio="…meet" and never crops or letterboxes badly. */
export const VB = { w: 1600, h: 640 }

/** the west-coast port where client briefs enter the territory. */
export const PORT = { x: 140, y: 340 }

export type Phase = 'executing' | 'delivering' | 'settled' | 'idle'

export interface Settlement {
  name: string
  addr: string
  score: number
  x: number
  y: number
  phase: Phase
  glyph: 'ring' | 'cross' | 'tri' | 'lens' | 'star' | 'keep'
  /** label anchor — flips left for eastern settlements. */
  anchor: 'start' | 'end'
  /** the peak index this settlement crowns. */
  peak: number
  /** capital (largest) settlement gets a bigger glyph + label. */
  capital?: boolean
}

/**
 * Six settlements, hand-placed across the territory so the map has a real
 * composition: a dense western highland (where the port feeds activity),
 * a central ridge, and quieter eastern uplands. Each crowns one peak.
 */
// Spread across the FULL width so the territory is balanced, not left-heavy.
// West: Iris + the capital Lyra. Center: Thorne. East: Carter, Verity, Halden.
export const SETTLEMENTS: Settlement[] = [
  { name: 'Lyra Synthwright', addr: '0xA8C3', score: 9.42, x: 470,  y: 250, phase: 'executing',  glyph: 'star',  anchor: 'start', peak: 0, capital: true },
  { name: 'Thorne Ledger',    addr: '0x12FA', score: 8.43, x: 800,  y: 440, phase: 'executing',  glyph: 'tri',   anchor: 'start', peak: 1 },
  { name: 'Carter & Vale',    addr: '0x4C91', score: 8.71, x: 1080, y: 270, phase: 'delivering',  glyph: 'cross', anchor: 'start', peak: 2 },
  { name: 'Iris Voss',        addr: '0x88BD', score: 7.68, x: 380,  y: 480, phase: 'delivering',  glyph: 'lens',  anchor: 'start', peak: 3 },
  { name: 'Halden Court',     addr: '0x55AB', score: 7.81, x: 1410, y: 430, phase: 'idle',        glyph: 'keep',  anchor: 'end',   peak: 4 },
  { name: 'Verity & Bell',    addr: '0x7E02', score: 7.94, x: 1290, y: 200, phase: 'idle',        glyph: 'ring',  anchor: 'end',   peak: 5 },
]

/** Elevation peaks — one under each settlement, sized by score, plus two
 *  unnamed low swells so the terrain isn't just six islands. */
export function buildPeaks(): Peak[] {
  const peaks: Peak[] = SETTLEMENTS.map(s => ({
    x: s.x,
    y: s.y,
    h: s.capital ? 150 : 80 + (s.score - 7.5) * 28,
    spread: s.capital ? 230 : 150 + (s.score - 7.5) * 40,
  }))
  // ambient swells — give the lowlands gentle relief so contours fill the
  // field across the FULL width (incl. the right flank + corners)
  peaks.push({ x: 230, y: 150, h: 38, spread: 170 })
  peaks.push({ x: 620, y: 560, h: 44, spread: 200 })
  peaks.push({ x: 1000, y: 540, h: 42, spread: 200 })
  peaks.push({ x: 1480, y: 250, h: 40, spread: 180 })
  peaks.push({ x: 1500, y: 580, h: 34, spread: 160 })
  return peaks
}

export interface Route {
  to: number          // settlement index
  phase: Phase
  payload: string
  /** quadratic control point for the route curve. */
  cx: number
  cy: number
}

/** Trade routes from the PORT to EVERY settlement — no settlement is
 *  stranded without a connecting road. Active routes carry a payload
 *  label + animate; idle routes are faint dormant roads (no label). */
export const ROUTES: Route[] = [
  { to: 0, phase: 'executing',  payload: 'JOB-2840 · 9/12 steps',  cx: 280, cy: 250 },
  { to: 1, phase: 'executing',  payload: 'JOB-2839 · 4/8 steps',   cx: 460, cy: 470 },
  { to: 2, phase: 'settled',    payload: 'JOB-2841 · +2.40 USDC',  cx: 600, cy: 220 },
  { to: 3, phase: 'delivering', payload: 'JOB-2838 · delivering',  cx: 250, cy: 460 },
  { to: 5, phase: 'idle',       payload: '',                       cx: 720, cy: 180 },
  { to: 4, phase: 'idle',       payload: '',                       cx: 880, cy: 470 },
]

export interface Stipple { x: number; y: number; r: number }

/**
 * Population stipple — denser where elevation is higher, so the texture
 * reads as "more agents live on the busy highlands." Rejection-sampled
 * against the elevation field passed in via `density(x,y) ∈ [0,1]`.
 */
export function buildStipple(
  count: number,
  density: (x: number, y: number) => number,
  keepClear: Array<{ x: number; y: number; r: number }>,
): Stipple[] {
  const rng = mulberry32(seedFrom('cartogram-stipple-v1'))
  const out: Stipple[] = []
  let attempts = 0
  const margin = 40
  while (out.length < count && attempts < count * 14) {
    attempts++
    const x = margin + rng() * (VB.w - margin * 2)
    const y = margin + rng() * (VB.h - margin * 2)
    const d = density(x, y)
    // bias toward populated ground but keep a faint scatter everywhere
    const p = 0.06 + d * 0.9
    if (rng() > p) continue
    // don't stipple on top of a settlement glyph/label
    if (keepClear.some(k => Math.hypot(k.x - x, k.y - y) < k.r)) continue
    const r = d > 0.55 ? (rng() < 0.3 ? 2.1 : 1.5) : (rng() < 0.5 ? 1.2 : 0.9)
    out.push({ x, y, r })
  }
  return out
}
