/**
 * cartogramMap — the territory's geography, derived from ADDRESS SPACE.
 *
 * The cartogram's thesis (see _design-archive/CARTOGRAM.md, design move #1):
 * "Position = address." An agent's spot on the chart is determined by their
 * wallet address — deterministically, not by hand. This module makes that
 * literal:
 *
 *   addrToPos()      — hash a hex address → a point on the plate. This is
 *                      the heart of the conceit: invisible address space
 *                      becomes a visible place.
 *   SETTLEMENTS      — the ~10 NAMED agents (top-rated + currently-active +
 *                      just-settled). Their coordinates come from their real
 *                      address, then a light collision-relaxation pass keeps
 *                      labels legible ("address-anchored, collision-relaxed").
 *   buildPopulation  — the ~1,284-agent ambient crowd. Anonymous dust that
 *                      (a) renders as the population texture and (b) IS the
 *                      elevation field: where the crowd clusters, the land
 *                      rises into highlands; empty address ranges are lowland
 *                      sea. The terrain is an emergent consequence of where
 *                      agents actually are — not a hand-tuned dome.
 *   PORT             — the single client gateway where briefs enter. NOT part
 *                      of the elevation field (it is infrastructure, not
 *                      population — adding it would recreate the old ripple).
 *   ROUTES           — trade routes from the port to active settlements.
 *                      Control points are computed from the endpoints so the
 *                      curves stay valid wherever addresses place a node.
 *
 * Pure + deterministic. viewBox is 1600 × 640 (matches the plate box).
 */

import { mulberry32, seedFrom } from './seededRandom'
import type { AgentPoint } from './contourField'

/** viewBox — wide plate ratio (~2.5:1) so the map fills the box with
 *  preserveAspectRatio="…meet" and never crops or letterboxes badly. */
export const VB = { w: 1600, h: 640 }

/** the west-coast port where client briefs enter the territory. */
export const PORT = { x: 140, y: 340 }

/** interior margins for address→position mapping (keeps nodes off the edge). */
const MARGIN = { x: 130, y: 92 }

export type Phase = 'executing' | 'delivering' | 'settled' | 'idle'

export interface Settlement {
  name: string
  addr: string
  score: number
  x: number
  y: number
  phase: Phase
  glyph: 'ring' | 'cross' | 'tri' | 'lens' | 'star' | 'keep'
  /** label anchor — flips left for eastern settlements (set after layout). */
  anchor: 'start' | 'end'
  /** capital (largest) settlement gets a bigger glyph + label. */
  capital?: boolean
}

/**
 * Position from address — deterministic. THIS is "position = address."
 * Split a 32-bit FNV hash of the address into two independent halves to get
 * (u, v) ∈ [0,1)², then map into the plate interior. A salted second hash
 * decorrelates x from y so addresses don't fall on a diagonal.
 */
export function addrToPos(addr: string): { x: number; y: number } {
  const hx = seedFrom(addr)
  const hy = seedFrom(addr + ':y')
  const u = (hx & 0xffff) / 0x10000
  const v = (hy & 0xffff) / 0x10000
  return {
    x: MARGIN.x + u * (VB.w - MARGIN.x * 2),
    y: MARGIN.y + v * (VB.h - MARGIN.y * 2),
  }
}

/** The named agents — identity, phase, score, glyph. Positions are derived
 *  from `addr` below (NOT hand-placed). Names/phases are curated demo data
 *  (the backend is frozen on preview); on prod this list is the live
 *  top-rated + active + just-settled ranking. */
interface SettlementSeed {
  name: string
  addr: string
  score: number
  phase: Phase
  glyph: Settlement['glyph']
  capital?: boolean
}

const SETTLEMENT_SEEDS: SettlementSeed[] = [
  { name: 'Lyra Synthwright', addr: '0xA8C3', score: 9.42, phase: 'executing',  glyph: 'star',  capital: true },
  { name: 'Osric Wynn',       addr: '0x1F44', score: 8.22, phase: 'executing',  glyph: 'tri'   },
  { name: 'Carter & Vale',    addr: '0x4C91', score: 8.71, phase: 'settled',    glyph: 'cross' },
  { name: 'Verity & Bell',    addr: '0x7E02', score: 7.94, phase: 'idle',       glyph: 'ring'  },
  { name: 'Quill Marlowe',    addr: '0x2B66', score: 7.55, phase: 'idle',       glyph: 'ring'  },
  { name: 'Thorne Ledger',    addr: '0x12FA', score: 8.43, phase: 'executing',  glyph: 'tri'   },
  { name: 'Mira Tolle',       addr: '0x9D7C', score: 8.05, phase: 'delivering', glyph: 'lens'  },
  { name: 'Halden Court',     addr: '0x55AB', score: 7.81, phase: 'idle',       glyph: 'keep'  },
  { name: 'Iris Voss',        addr: '0x88BD', score: 7.68, phase: 'delivering', glyph: 'lens'  },
  { name: 'Selden Roe',       addr: '0x7A10', score: 7.40, phase: 'idle',       glyph: 'keep'  },
]

/** zones the labels must avoid: the port and the two top marginalia corners
 *  (legend top-left, edition stamp top-right). */
const CLEAR_ZONES = [
  { x: PORT.x, y: PORT.y, r: 150 },  // CLIENT PORT + its label
  { x: 150, y: 96, r: 150 },         // top-left legend
  { x: 1480, y: 92, r: 140 },        // top-right edition stamp
]

/**
 * Light collision relaxation over the NAMED settlements only. Each label is
 * a wide-but-short box, so we use an elliptical exclusion (RX ≫ RY) and push
 * overlapping pairs apart, then shove nodes out of the clear zones and clamp
 * to the interior. Deterministic (no randomness) so positions never flicker.
 */
function relaxPositions(pts: Array<{ x: number; y: number }>): void {
  const RX = 215, RY = 70
  for (let it = 0; it < 260; it++) {
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[j].x - pts[i].x
        const dy = pts[j].y - pts[i].y
        const nd = Math.hypot(dx / RX, dy / RY)
        if (nd > 0 && nd < 1) {
          const push = (1 - nd) * 0.5
          const ux = (dx / RX) / nd
          const uy = (dy / RY) / nd
          pts[i].x -= ux * RX * push * 0.5
          pts[i].y -= uy * RY * push * 0.5
          pts[j].x += ux * RX * push * 0.5
          pts[j].y += uy * RY * push * 0.5
        }
      }
      for (const z of CLEAR_ZONES) {
        const dx = pts[i].x - z.x
        const dy = pts[i].y - z.y
        const d = Math.hypot(dx, dy)
        if (d < z.r) {
          const u = d || 1
          pts[i].x += (dx / u) * (z.r - d)
          pts[i].y += (dy / u) * (z.r - d)
        }
      }
      pts[i].x = Math.max(MARGIN.x, Math.min(VB.w - MARGIN.x, pts[i].x))
      pts[i].y = Math.max(MARGIN.y, Math.min(VB.h - MARGIN.y, pts[i].y))
    }
  }
}

/** Resolve named settlements: address → position → relax → anchor. */
function buildSettlements(): Settlement[] {
  const pts = SETTLEMENT_SEEDS.map(s => addrToPos(s.addr))
  relaxPositions(pts)
  return SETTLEMENT_SEEDS.map((s, i) => ({
    ...s,
    x: pts[i].x,
    y: pts[i].y,
    // labels flip left when the node sits in the eastern third
    anchor: pts[i].x > VB.w * 0.6 ? 'end' : 'start',
  }))
}

export const SETTLEMENTS: Settlement[] = buildSettlements()

/**
 * The ambient population — ~1,284 anonymous agents. This array IS the
 * elevation field's input (see Plate.tsx) AND the rendered dust layer.
 *
 * Distribution: ~60% cluster around the named settlements (successful agents
 * attract neighbours → those regions become highlands the named agent
 * crowns), ~40% scattered as background so empty ground still has faint
 * texture and the coastline stays organic. Deterministic.
 */
export function buildPopulation(n = 1284): AgentPoint[] {
  const rng = mulberry32(seedFrom('arc-hive-population-v2'))
  const named = SETTLEMENTS
  const totalScore = named.reduce((a, s) => a + s.score, 0)
  const out: AgentPoint[] = []

  // approx-gaussian in [-1,1] via averaged uniforms (cheap, deterministic)
  const g = () => (rng() + rng() + rng() - 1.5) / 1.5

  for (let i = 0; i < n; i++) {
    let x: number, y: number, weight: number
    if (rng() < 0.6) {
      // cluster around a named settlement, chosen with probability ∝ score
      let t = rng() * totalScore
      let k = 0
      for (; k < named.length - 1; k++) {
        t -= named[k].score
        if (t <= 0) break
      }
      const s = named[k]
      const sigma = s.capital ? 132 : 78 + (s.score - 7.4) * 30
      x = s.x + g() * sigma
      y = s.y + g() * sigma * 0.7   // squashed: terrain reads wider than tall
      weight = 0.14 + rng() * 0.16
    } else {
      x = MARGIN.x + rng() * (VB.w - MARGIN.x * 2)
      y = MARGIN.y + rng() * (VB.h - MARGIN.y * 2)
      weight = 0.07 + rng() * 0.11
    }
    x = Math.max(16, Math.min(VB.w - 16, x))
    y = Math.max(16, Math.min(VB.h - 16, y))
    out.push({ x, y, weight })
  }
  return out
}

export interface Route {
  to: number          // settlement index
  phase: Phase
  payload: string
  /** quadratic control point for the route curve (computed from endpoints). */
  cx: number
  cy: number
}

/** Compute a gentle quadratic control point for a port→dest route. `bend`
 *  offsets the midpoint perpendicular to the line so routes arc instead of
 *  running dead straight; alternating signs spread a fan of routes apart. */
function routeControl(dest: { x: number; y: number }, bend: number): { cx: number; cy: number } {
  const mx = (PORT.x + dest.x) / 2
  const my = (PORT.y + dest.y) / 2
  const dx = dest.x - PORT.x
  const dy = dest.y - PORT.y
  return { cx: mx - dy * bend, cy: my + dx * bend }
}

/** Raw route definitions (to-index, phase, payload). Control points are
 *  derived from the resolved settlement positions below. */
const ROUTE_SEEDS: Array<Omit<Route, 'cx' | 'cy'>> = [
  { to: 0, phase: 'executing',  payload: 'JOB-2840 · 9/12 steps' },
  { to: 1, phase: 'executing',  payload: 'JOB-2842 · 2/6 steps'  },
  { to: 2, phase: 'settled',    payload: 'JOB-2841 · +2.40 USDC' },
  { to: 5, phase: 'executing',  payload: 'JOB-2839 · 4/8 steps'  },
  { to: 6, phase: 'delivering', payload: 'JOB-2836 · delivering' },
  { to: 8, phase: 'delivering', payload: 'JOB-2838 · delivering' },
  { to: 3, phase: 'idle',       payload: '' },
  { to: 4, phase: 'idle',       payload: '' },
  { to: 7, phase: 'idle',       payload: '' },
  { to: 9, phase: 'idle',       payload: '' },
]

export const ROUTES: Route[] = ROUTE_SEEDS.map((r, i) => {
  const dest = SETTLEMENTS[r.to]
  const bend = (i % 2 === 0 ? 1 : -1) * 0.12
  const { cx, cy } = routeControl(dest, bend)
  return { ...r, cx, cy }
})
