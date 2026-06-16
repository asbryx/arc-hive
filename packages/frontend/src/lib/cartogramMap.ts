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
// Ten settlements in a clean three-band distribution that fills the whole
// canvas (1600×640) and — critically — leaves room for each label so no
// two collide. Labels extend right (anchor 'start') unless 'end' (flip
// left), used for eastern settlements near the right edge.
//   TOP band  (y~150): Lyra*, Osric, Carter, Verity
//   MID band  (y~340): Quill, Thorne, Mira, Halden
//   LOW band  (y~510): Iris, Selden
export const SETTLEMENTS: Settlement[] = [
  { name: 'Lyra Synthwright', addr: '0xA8C3', score: 9.42, x: 470,  y: 175, phase: 'executing',  glyph: 'star',  anchor: 'start', peak: 0, capital: true },
  { name: 'Osric Wynn',       addr: '0x1F44', score: 8.22, x: 780,  y: 150, phase: 'executing',  glyph: 'tri',   anchor: 'start', peak: 6 },
  { name: 'Carter & Vale',    addr: '0x4C91', score: 8.71, x: 1060, y: 180, phase: 'delivering',  glyph: 'cross', anchor: 'start', peak: 2 },
  { name: 'Verity & Bell',    addr: '0x7E02', score: 7.94, x: 1380, y: 160, phase: 'idle',        glyph: 'ring',  anchor: 'end',   peak: 5 },
  { name: 'Quill Marlowe',    addr: '0x2B66', score: 7.55, x: 300,  y: 360, phase: 'idle',        glyph: 'ring',  anchor: 'start', peak: 8 },
  { name: 'Thorne Ledger',    addr: '0x12FA', score: 8.43, x: 660,  y: 380, phase: 'executing',  glyph: 'tri',   anchor: 'start', peak: 1 },
  { name: 'Mira Tolle',       addr: '0x9D7C', score: 8.05, x: 960,  y: 360, phase: 'delivering',  glyph: 'lens',  anchor: 'start', peak: 7 },
  { name: 'Halden Court',     addr: '0x55AB', score: 7.81, x: 1400, y: 380, phase: 'idle',        glyph: 'keep',  anchor: 'end',   peak: 4 },
  { name: 'Iris Voss',        addr: '0x88BD', score: 7.68, x: 430,  y: 520, phase: 'delivering',  glyph: 'lens',  anchor: 'start', peak: 3 },
  { name: 'Selden Roe',       addr: '0x7A10', score: 7.40, x: 1120, y: 530, phase: 'idle',        glyph: 'keep',  anchor: 'end',   peak: 9 },
]

/** Elevation peaks — one under each settlement, sized by score, plus
 *  ambient swells so the terrain fills the whole field, not islands. */
export function buildPeaks(): Peak[] {
  const peaks: Peak[] = SETTLEMENTS.map(s => ({
    x: s.x,
    y: s.y,
    h: s.capital ? 160 : 90 + (s.score - 7.5) * 30,
    spread: s.capital ? 250 : 170 + (s.score - 7.5) * 44,
  }))
  // ambient swells across the lowlands + corners so contours fill the field
  peaks.push({ x: 160, y: 250, h: 44, spread: 180 })
  peaks.push({ x: 200, y: 540, h: 40, spread: 170 })
  peaks.push({ x: 820, y: 560, h: 48, spread: 210 })
  peaks.push({ x: 1260, y: 300, h: 46, spread: 200 })
  peaks.push({ x: 1500, y: 560, h: 40, spread: 180 })
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
 *  label, animate, and send a traveling brief-packet along the road;
 *  idle routes are faint dormant roads (no label, no packet). */
// indices: 0 Lyra, 1 Osric, 2 Carter, 3 Verity, 4 Quill, 5 Thorne,
//          6 Mira, 7 Halden, 8 Iris, 9 Selden
export const ROUTES: Route[] = [
  { to: 0, phase: 'executing',  payload: 'JOB-2840 · 9/12 steps',  cx: 280, cy: 210 },
  { to: 1, phase: 'executing',  payload: 'JOB-2842 · 2/6 steps',   cx: 430, cy: 170 },
  { to: 2, phase: 'settled',    payload: 'JOB-2841 · +2.40 USDC',  cx: 560, cy: 200 },
  { to: 5, phase: 'executing',  payload: 'JOB-2839 · 4/8 steps',   cx: 480, cy: 470 },
  { to: 6, phase: 'delivering', payload: 'JOB-2836 · delivering',  cx: 560, cy: 380 },
  { to: 8, phase: 'delivering', payload: 'JOB-2838 · delivering',  cx: 260, cy: 460 },
  { to: 3, phase: 'idle',       payload: '',                       cx: 720, cy: 140 },
  { to: 4, phase: 'idle',       payload: '',                       cx: 230, cy: 360 },
  { to: 7, phase: 'idle',       payload: '',                       cx: 860, cy: 380 },
  { to: 9, phase: 'idle',       payload: '',                       cx: 640, cy: 470 },
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
