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
 * Layout pass over the NAMED settlements. Two forces, both deterministic:
 *
 *  1. Ranked-lattice spread (anti-clump): agents are ranked by their
 *     address-derived x, then gently pulled toward evenly-spaced x slots.
 *     This preserves address ORDER (west addresses stay west) while
 *     guaranteeing the territory fills the plate edge-to-edge instead of
 *     hashing into two clumps with a dead gap between them.
 *  2. Elliptical collision push (legibility): each label is a wide-but-short
 *     box, so overlapping pairs are pushed apart (RX ≫ RY). Then nodes are
 *     shoved out of the clear zones (port + the two top marginalia) and
 *     clamped to the interior.
 *
 * No randomness → positions never flicker. The x-order is still the agents'
 * address order, so "position = address" stays honest; we only relax spacing.
 */
function relaxPositions(pts: Array<{ x: number; y: number }>): void {
  const RX = 215, RY = 70
  const GRID_PULL = 0.06
  // even x slots, assigned by address-x rank (keeps west/east order)
  const lo = MARGIN.x + 70
  const hi = VB.w - MARGIN.x - 70
  const order = pts.map((_, i) => i).sort((a, b) => pts[a].x - pts[b].x)
  const targetX = new Array(pts.length)
  order.forEach((idx, rank) => {
    targetX[idx] = lo + (hi - lo) * (rank / (pts.length - 1))
  })

  for (let it = 0; it < 300; it++) {
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
      // pull toward the evenly-spaced address-ranked x slot
      pts[i].x += (targetX[i] - pts[i].x) * GRID_PULL
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
    if (rng() < 0.45) {
      // cluster around a named settlement, chosen with probability ∝ score
      let t = rng() * totalScore
      let k = 0
      for (; k < named.length - 1; k++) {
        t -= named[k].score
        if (t <= 0) break
      }
      const s = named[k]
      const sigma = s.capital ? 138 : 84 + (s.score - 7.4) * 32
      x = s.x + g() * sigma
      y = s.y + g() * sigma * 0.7   // squashed: terrain reads wider than tall
      weight = 0.14 + rng() * 0.16
    } else {
      // scattered background population — fills the lowland so the territory
      // reads as continuous land with bays/inlets, not floating islands.
      x = MARGIN.x + rng() * (VB.w - MARGIN.x * 2)
      y = MARGIN.y + rng() * (VB.h - MARGIN.y * 2)
      weight = 0.12 + rng() * 0.14
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
  /** brief magnitude ∈ ~[0,1] — drives route stroke width (Minard: line
   *  thickness carries information, not just connection). Big payouts and
   *  near-complete multi-step jobs draw bolder roads. */
  mag: number
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

/** Raw route definitions. `mag` ∈ [0,1] encodes brief importance for the
 *  Minard line-width: USDC settlements weigh by payout, step-jobs by both
 *  progress and total size, deliveries mid-weight, idle ~0. */
const ROUTE_SEEDS: Array<Omit<Route, 'cx' | 'cy'>> = [
  { to: 0, phase: 'executing',  payload: 'JOB-2840 · 9/12 steps', mag: 0.85 },
  { to: 1, phase: 'executing',  payload: 'JOB-2842 · 2/6 steps',  mag: 0.34 },
  { to: 2, phase: 'settled',    payload: 'JOB-2841 · +2.40 USDC', mag: 0.70 },
  { to: 5, phase: 'executing',  payload: 'JOB-2839 · 4/8 steps',  mag: 0.52 },
  { to: 6, phase: 'delivering', payload: 'JOB-2836 · delivering', mag: 0.60 },
  { to: 8, phase: 'delivering', payload: 'JOB-2838 · delivering', mag: 0.48 },
  { to: 3, phase: 'idle',       payload: '', mag: 0 },
  { to: 4, phase: 'idle',       payload: '', mag: 0 },
  { to: 7, phase: 'idle',       payload: '', mag: 0 },
  { to: 9, phase: 'idle',       payload: '', mag: 0 },
]

export const ROUTES: Route[] = ROUTE_SEEDS.map((r, i) => {
  const dest = SETTLEMENTS[r.to]
  const bend = (i % 2 === 0 ? 1 : -1) * 0.12
  const { cx, cy } = routeControl(dest, bend)
  return { ...r, cx, cy }
})

/* ─── label layout / de-confliction ───────────────────────────────────────
 *
 * Two text systems share the plate: agent labels (anchored to each glyph)
 * and route-job labels (the "JOB-2840 · 9/12 steps" tags). Agent labels are
 * tied to position; route labels can SLIDE along their own curve. So we:
 *   1. compute every agent label's bounding box (anchor flips L/R),
 *   2. slide each route label along its Bézier to the spot with the least
 *      overlap against agent boxes + already-placed route boxes + the
 *      marginalia corners,
 *   3. expose all boxes as KNOCKOUT_BOXES so contours/dust can be masked out
 *      from under text (a real printed-plate "label mask", not a white box).
 * Pure + deterministic — runs once at module load. */

export interface Box { x: number; y: number; w: number; h: number }
export interface PlacedRouteLabel extends Box { payload: string; phase: Phase }

/** rough text width in svg units (monospace ≈ 0.6em, serif italic ≈ 0.52em). */
function textW(text: string, size: number, mono: boolean): number {
  return text.length * size * (mono ? 0.6 : 0.52)
}

/** Only ACTIVE agents (executing/delivering/settled) get a full name label.
 *  Idle agents are quiet, unlabeled landmarks — small markers on their hill,
 *  no shouting text. This is both the declutter and the meaning: every NAMED
 *  agent on the plate is one you can see doing something. */
export function isLabeled(s: Settlement): boolean {
  return s.phase !== 'idle'
}

/** Bounding box of an agent's stacked label (name + addr + optional capital
 *  tag), accounting for anchor side. Coordinates are absolute (plate space). */
function agentLabelBox(s: Settlement): Box {
  const nameSize = s.capital ? 19 : 15
  const nameW = textW(s.name, nameSize, false)
  const addrW = textW(`${s.addr} · ${s.score.toFixed(2)}`, 10, true)
  const capW = s.capital ? textW('CAPITAL · TOP OF FIELD', 9, true) : 0
  const w = Math.max(nameW, addrW, capW) + 8
  const gap = 12
  const x = s.anchor === 'end' ? s.x - gap - w : s.x + gap
  const yTop = s.y - (s.capital ? 36 : 16)
  const yBot = s.y + 28
  return { x, y: yTop, w, h: yBot - yTop }
}

/** Label keep-out boxes — only labeled (active) agents claim label space. */
export const AGENT_LABEL_BOXES: Box[] = SETTLEMENTS.filter(isLabeled).map(agentLabelBox)

/** glyph keep-out discs (so route labels avoid sitting on a marker). Labeled
 *  agents get a wide disc (glyph + clearing); idle agents only a small one. */
const GLYPH_BOXES: Box[] = [
  ...SETTLEMENTS.map(s => {
    const r = !isLabeled(s) ? 11 : s.capital ? 24 : 17
    return { x: s.x - r, y: s.y - r, w: r * 2, h: r * 2 }
  }),
  { x: PORT.x - 60, y: PORT.y - 16, w: 120, h: 74 }, // port + its two labels
]

/** marginalia keep-out: legend (TL), edition stamp (TR), fig caption (bottom). */
const MARGINALIA_BOXES: Box[] = [
  { x: 24, y: 24, w: 256, h: 130 },          // legend (now taller — has state swatches)
  { x: VB.w - 250, y: 24, w: 240, h: 92 },   // edition stamp
  { x: VB.w / 2 - 230, y: VB.h - 70, w: 460, h: 60 }, // caption
]

function overlapArea(a: Box, b: Box): number {
  const ox = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))
  const oy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))
  return ox * oy
}

/** quadratic Bézier point at parameter t. */
function bezier(t: number, p0: number, c: number, p1: number): number {
  const u = 1 - t
  return u * u * p0 + 2 * u * t * c + t * t * p1
}

/**
 * Place each route-job label by sliding it along its route to the position
 * that minimises overlap with everything else. Greedy, deterministic order
 * (settled → executing → delivering) so the most important labels claim the
 * clearest space first.
 */
function placeRouteLabels(): PlacedRouteLabel[] {
  const phaseRank: Record<Phase, number> = { settled: 0, executing: 1, delivering: 2, idle: 3 }
  const labelled = ROUTES
    .filter(r => r.payload)
    .sort((a, b) => phaseRank[a.phase] - phaseRank[b.phase])

  const placed: PlacedRouteLabel[] = []
  const fixed = [...AGENT_LABEL_BOXES, ...GLYPH_BOXES, ...MARGINALIA_BOXES]

  for (const rt of labelled) {
    const dest = SETTLEMENTS[rt.to]
    const w = textW(rt.payload, 10.5, true) + 10
    const h = 15
    let best: PlacedRouteLabel | null = null
    let bestScore = Infinity

    // sweep along the curve, with small perpendicular offsets
    for (let ti = 0; ti <= 16; ti++) {
      const t = 0.26 + (ti / 16) * 0.48          // t ∈ [0.26, 0.74]
      const bx = bezier(t, PORT.x, rt.cx, dest.x)
      const by = bezier(t, PORT.y, rt.cy, dest.y)
      // perpendicular direction (tangent rotated 90°)
      const tx = 2 * (1 - t) * (rt.cx - PORT.x) + 2 * t * (dest.x - rt.cx)
      const ty = 2 * (1 - t) * (rt.cy - PORT.y) + 2 * t * (dest.y - rt.cy)
      const tl = Math.hypot(tx, ty) || 1
      const px = -ty / tl, py = tx / tl
      for (const off of [0, -15, 15, -28, 28]) {
        const cx = bx + px * off
        const cy = by + py * off
        const box: Box = { x: cx - w / 2, y: cy - h / 2, w, h }
        // keep inside the plate
        if (box.x < 20 || box.x + box.w > VB.w - 20 || box.y < 18 || box.y + box.h > VB.h - 18) continue
        let score = 0
        for (const f of fixed) score += overlapArea(box, f) * 1.0
        for (const p of placed) score += overlapArea(box, p) * 1.4
        score += Math.abs(off) * 0.15           // prefer on-the-line
        score += Math.abs(t - 0.5) * 12         // prefer mid-route
        if (score < bestScore) {
          bestScore = score
          best = { ...box, payload: rt.payload, phase: rt.phase }
        }
      }
    }
    if (best) placed.push(best)
  }
  return placed
}

export const ROUTE_LABELS: PlacedRouteLabel[] = placeRouteLabels()

/** Every text box on the plate — fed to the SVG mask so contour lines and
 *  dust are knocked out from under text (printed-plate label mask). */
export const KNOCKOUT_BOXES: Box[] = [
  ...AGENT_LABEL_BOXES,
  ...ROUTE_LABELS.map(l => ({ x: l.x, y: l.y, w: l.w, h: l.h })),
]
