/**
 * cartogramSlots — deterministic geometry for the cartogram plate.
 *
 * Composition principles (the ones the prior version violated):
 *
 *   ONE FOCAL AGENT. The top-ranked agent is the visual anchor: bigger
 *   sigil, bigger label, placed at the optical center-right of the
 *   active region. Every other element subordinates to it.
 *
 *   ONE CLIENT HUB. Briefs in the real protocol originate from the
 *   contract — one source, many destinations. Flight lines fan OUT from
 *   a single hub at the bottom-left to the seven busiest agents. This
 *   gives the lines a spatial story: clients on the left, agents in the
 *   field, work radiating outward. No random origin → random target.
 *
 *   RANK-DRIVEN PLACEMENT. Agents are placed by their rank in the
 *   leaderboard, not by an arbitrary band grid. Top rank → focal slot.
 *   Ranks 2-4 → satellite ring around focal. Ranks 5-8 → mid arc.
 *   Ranks 9-12 → outer stragglers near the edges. The plate has a
 *   center of gravity.
 *
 *   DENSITY GRADIENT, NOT NOISE. Dust is dense around the focal agent
 *   and the active flight-line corridors, thin in dead zones. Reads as
 *   "population gathered where activity is", not as JPEG speckle.
 *
 *   NO ROTATED TEXT. Payload labels sit horizontally at the agent end
 *   of each flight line, small and quiet. The chart never asks the eye
 *   to read at an angle.
 *
 * Everything pure + deterministic — same input, same layout.
 */

import { mulberry32, seedFrom } from './seededRandom'

export interface Point { x: number; y: number }
export interface Slot {
  x: number
  y: number
  anchor: 'start' | 'end'
  /** rank in the cast — 1 = focal, 12 = outermost. */
  rank: number
  /** glyph radius hint (focal is larger). */
  sigilRadius: number
  /** name font-size in viewBox units. */
  nameSize: number
}
export interface FlightLine {
  from: Point
  to: Point
  phase: 'settled' | 'executing' | 'delivering'
  payload: string
  /** index of the agent in the named cast that this line terminates at */
  targetAgent: number
}
export interface DustDot { x: number; y: number; r: number; opacity: number }

export const VIEWBOX = { w: 1600, h: 800 }
export const ACTIVE  = { x1: 80, y1: 160, x2: 1520, y2: 660 }

/** the single client hub — bottom-left corner of the active region. */
export const CLIENT_HUB: Point = { x: 130, y: 640 }

/** label rect bounds for collision checking. */
function labelW(slot: Slot): number {
  // wider for the focal so its big label is fully reserved
  return slot.rank === 1 ? 200 : 140
}
function labelH(slot: Slot): number {
  return slot.rank === 1 ? 48 : 32
}

/* ─── the named cast ─── */

export interface DemoAgent {
  name: string
  addr: string
  score: number
  phase: 'settled' | 'executing' | 'delivering' | 'idle'
}

/** Sorted by score desc so DEMO_AGENTS[0] is the focal. */
export const DEMO_AGENTS: DemoAgent[] = [
  { name: 'Lyra Synthwright',  addr: '0xA8C3', score: 9.42, phase: 'executing'  },
  { name: 'Thorne Ledger',     addr: '0x3B17', score: 8.91, phase: 'executing'  },
  { name: 'Carter & Vale',     addr: '0x4C91', score: 8.71, phase: 'settled'    },
  { name: 'Selden Park',       addr: '0x2E58', score: 8.46, phase: 'idle'       },
  { name: 'Osric Wynn',        addr: '0x1F44', score: 8.22, phase: 'executing'  },
  { name: 'Mathis & Roe',      addr: '0x6822', score: 8.04, phase: 'idle'       },
  { name: 'Brae Hollinger',    addr: '0xF103', score: 7.97, phase: 'idle'       },
  { name: 'Verity & Bell',     addr: '0x7E02', score: 7.94, phase: 'idle'       },
  { name: 'Halden Court',      addr: '0x55AB', score: 7.81, phase: 'settled'    },
  { name: 'Iris Voss',         addr: '0x88BD', score: 7.68, phase: 'delivering' },
  { name: 'Petra Sloane',      addr: '0xD019', score: 7.55, phase: 'delivering' },
  { name: 'Quill Marlowe',     addr: '0x9C70', score: 7.32, phase: 'idle'       },
]

/* ─── rank-driven placement ─── */

/**
 * Compute slots:
 *   rank 1   → focal slot at (1020, 380), the optical center-right.
 *   rank 2-4 → inner satellite ring, ~280u from focal, evenly spaced
 *              around 270°-30° arc (avoiding the cartouche zone).
 *   rank 5-8 → mid arc, ~480u from focal, spread wider, biased toward
 *              the cartogram's reading center (upper + middle field).
 *   rank 9-12 → outer ring, ~620u from focal, near the cartogram edges,
 *               quiet labels.
 *
 * Within each ring the angle is jittered with a seeded RNG so the
 * layout reads organic, not as concentric circles.
 */
const FOCAL: Point = { x: 1020, y: 380 }
const CARTOUCHE_ZONE = { x1: 1180, y1: 480, x2: ACTIVE.x2, y2: ACTIVE.y2 }

interface RingSpec {
  ranks: [number, number]    // inclusive range
  radius: number
  angleStart: number         // degrees (0 = right, 90 = down, -90 = up)
  angleEnd: number
  sigilRadius: number
  nameSize: number
}

const RINGS: RingSpec[] = [
  // focal handled separately
  { ranks: [2, 4],  radius: 280, angleStart: 200, angleEnd: 340, sigilRadius: 12, nameSize: 17 },
  { ranks: [5, 8],  radius: 470, angleStart: 170, angleEnd: 350, sigilRadius: 10, nameSize: 14 },
  { ranks: [9, 12], radius: 620, angleStart: 150, angleEnd: 380, sigilRadius:  9, nameSize: 13 },
]

function inCartouche(p: Point): boolean {
  return p.x >= CARTOUCHE_ZONE.x1 - 30 && p.y >= CARTOUCHE_ZONE.y1 - 30
}

function clampToActive(p: Point): Point {
  return {
    x: Math.max(ACTIVE.x1 + 90,  Math.min(ACTIVE.x2 - 90,  p.x)),
    y: Math.max(ACTIVE.y1 + 40,  Math.min(ACTIVE.y2 - 60,  p.y)),
  }
}

function placeOnRing(spec: RingSpec, idxInRing: number, total: number, rng: () => number): Point {
  // even angular distribution within [angleStart, angleEnd], jittered ±8°
  const span = spec.angleEnd - spec.angleStart
  const frac = total === 1 ? 0.5 : idxInRing / (total - 1)
  const angleDeg = spec.angleStart + frac * span + (rng() - 0.5) * 16
  const angleRad = (angleDeg * Math.PI) / 180
  // radius jitter ±30
  const r = spec.radius + (rng() - 0.5) * 60
  return {
    x: FOCAL.x + r * Math.cos(angleRad),
    y: FOCAL.y + r * Math.sin(angleRad),
  }
}

export function placeAgents(count: number): Slot[] {
  const rng = mulberry32(seedFrom('cartogram-rank-v4'))
  const out: Slot[] = []

  // rank 1 → focal
  if (count >= 1) {
    out.push({
      x: FOCAL.x,
      y: FOCAL.y,
      anchor: 'end',            // label flips LEFT so it sits in the open field
      rank: 1,
      sigilRadius: 18,
      nameSize: 22,
    })
  }

  // rings 2-4, 5-8, 9-12
  for (const ring of RINGS) {
    const [lo, hi] = ring.ranks
    if (lo > count) break
    const ringLast = Math.min(hi, count)
    const total = ringLast - lo + 1
    for (let i = 0; i < total; i++) {
      let p = placeOnRing(ring, i, total, rng)
      // retry up to 4 times if landing inside the cartouche zone or off-canvas
      let tries = 0
      while ((inCartouche(p) || p.x < ACTIVE.x1 + 90 || p.x > ACTIVE.x2 - 90 ||
              p.y < ACTIVE.y1 + 30 || p.y > ACTIVE.y2 - 30) && tries < 4) {
        p = placeOnRing(ring, i, total, rng)
        tries++
      }
      p = clampToActive(p)
      // anchor: flip to 'end' if the slot is on the right half of the plate
      const anchor: 'start' | 'end' = p.x > VIEWBOX.w * 0.62 ? 'end' : 'start'
      out.push({
        x: p.x,
        y: p.y,
        anchor,
        rank: lo + i,
        sigilRadius: ring.sigilRadius,
        nameSize: ring.nameSize,
      })
    }
  }

  // resolve any label-rect overlaps by nudging the lower-rank slot
  for (let i = 0; i < out.length; i++) {
    for (let j = i + 1; j < out.length; j++) {
      let attempts = 0
      while (slotsCollide(out[i], out[j]) && attempts < 6) {
        // push j away from i radially from FOCAL
        const dx = out[j].x - FOCAL.x
        const dy = out[j].y - FOCAL.y
        const len = Math.hypot(dx, dy) || 1
        out[j].x += (dx / len) * 22
        out[j].y += (dy / len) * 18
        const c = clampToActive(out[j])
        out[j].x = c.x
        out[j].y = c.y
        attempts++
      }
    }
  }

  return out
}

function slotsCollide(a: Slot, b: Slot): boolean {
  // approximate label rects
  const aLeft = a.anchor === 'end' ? a.x - 24 - labelW(a) : a.x + 24
  const aRect = { x1: aLeft, y1: a.y - labelH(a) / 2, x2: aLeft + labelW(a), y2: a.y + labelH(a) / 2 }
  const bLeft = b.anchor === 'end' ? b.x - 24 - labelW(b) : b.x + 24
  const bRect = { x1: bLeft, y1: b.y - labelH(b) / 2, x2: bLeft + labelW(b), y2: b.y + labelH(b) / 2 }
  const pad = 14
  return !(
    aRect.x2 + pad < bRect.x1 ||
    bRect.x2 + pad < aRect.x1 ||
    aRect.y2 + pad < bRect.y1 ||
    bRect.y2 + pad < aRect.y1
  )
}

/* ─── flight lines ─── */

/**
 * 7 flight lines from the single CLIENT_HUB to ranks 1, 2, 3, 5, 6, 9, 10.
 * Mix of phases: focal gets EXECUTING (the loudest agent has the hottest
 * brief in flight); ranks 2-3 get the two SETTLED with arrows; the rest
 * are EXECUTING and DELIVERING mix.
 *
 * Payload label sits NEAR THE AGENT (not at midpoint), horizontal,
 * small. The eye reads: client hub → line → agent → quiet payload.
 */
interface LineSpec {
  targetRank: number     // 1-based
  phase: FlightLine['phase']
  payload: string
}

const LINE_SPECS: LineSpec[] = [
  { targetRank: 1,  phase: 'executing',  payload: 'JOB-2841 · 9/12' },
  { targetRank: 3,  phase: 'settled',    payload: 'JOB-2840 · +2.40 USDC' },
  { targetRank: 9,  phase: 'settled',    payload: 'JOB-2837 · +1.85 USDC' },
  { targetRank: 2,  phase: 'executing',  payload: 'JOB-2839 · 4/8' },
  { targetRank: 6,  phase: 'executing',  payload: 'JOB-2836 · 11/14' },
  { targetRank: 10, phase: 'delivering', payload: 'JOB-2838 · deliv.' },
  { targetRank: 5,  phase: 'delivering', payload: 'JOB-2835 · deliv.' },
]

export function buildFlightLines(slots: Slot[]): FlightLine[] {
  const out: FlightLine[] = []
  for (const spec of LINE_SPECS) {
    const target = slots[spec.targetRank - 1]
    if (!target) continue
    out.push({
      from: CLIENT_HUB,
      to: { x: target.x, y: target.y },
      phase: spec.phase,
      payload: spec.payload,
      targetAgent: spec.targetRank - 1,
    })
  }
  return out
}

/* ─── ambient dust ─── */

/**
 * Dust as a DENSITY GRADIENT, not uniform noise.
 *
 * Place ~200 dots biased toward the focal agent and the flight-line
 * corridors using rejection sampling against a density field. The
 * field is 1.0 at the focal, falls to 0.3 at 600u radius, plus an
 * additive 0.7 along any flight line within 80u perpendicular.
 *
 * Dots respect a hard keep-out from named-agent label rects so the
 * type stays clean.
 */
export function placeDust(
  count: number,
  agentSlots: Slot[],
  lines: FlightLine[],
): DustDot[] {
  const rng = mulberry32(seedFrom('cartogram-dust-v4'))
  const out: DustDot[] = []

  const labelRects = agentSlots.map(s => {
    const left = s.anchor === 'end' ? s.x - 24 - labelW(s) : s.x + 24
    return { x1: left - 6, y1: s.y - labelH(s) / 2 - 6, x2: left + labelW(s) + 6, y2: s.y + labelH(s) / 2 + 6 }
  })

  const density = (x: number, y: number): number => {
    // base: 1.0 at focal, falls with distance, never below 0.15
    const dFocal = Math.hypot(x - FOCAL.x, y - FOCAL.y)
    const focalContribution = Math.max(0.15, 1.0 - dFocal / 800)
    // bonus near any flight line
    let lineBonus = 0
    for (const l of lines) {
      const d = distanceToSegment({ x, y }, l.from, l.to)
      if (d < 90) lineBonus += (1 - d / 90) * 0.6
    }
    return Math.min(1.6, focalContribution + lineBonus)
  }

  let attempts = 0
  while (out.length < count && attempts < count * 12) {
    attempts++
    const x = ACTIVE.x1 + 24 + rng() * (ACTIVE.x2 - ACTIVE.x1 - 48)
    const y = ACTIVE.y1 + 24 + rng() * (ACTIVE.y2 - ACTIVE.y1 - 48)

    // density-driven rejection
    const d = density(x, y)
    if (rng() > d) continue

    // hard reject inside label rect
    if (labelRects.some(r => x >= r.x1 && x <= r.x2 && y >= r.y1 && y <= r.y2)) continue
    // hard reject near sigil point
    if (agentSlots.some(s => Math.hypot(s.x - x, s.y - y) < s.sigilRadius + 12)) continue
    // hard reject directly on flight line (8u corridor — narrower than density bonus so dots ALONG the line still appear)
    if (lines.some(l => distanceToSegment({ x, y }, l.from, l.to) < 6)) continue
    // hard reject inside cartouche zone
    if (inCartouche({ x, y })) continue

    const r = rng() < 0.15 ? 1.6 : rng() < 0.65 ? 1.1 : 0.8
    // dots near focal are slightly more opaque (reads as denser population)
    const op = 0.35 + (d - 0.15) * 0.32
    out.push({ x, y, r, opacity: Math.min(0.72, op) })
  }
  return out
}

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const vx = b.x - a.x, vy = b.y - a.y
  const wx = p.x - a.x, wy = p.y - a.y
  const c1 = vx * wx + vy * wy
  if (c1 <= 0) return Math.hypot(wx, wy)
  const c2 = vx * vx + vy * vy
  if (c2 <= c1) return Math.hypot(p.x - b.x, p.y - b.y)
  const t = c1 / c2
  return Math.hypot(p.x - (a.x + t * vx), p.y - (a.y + t * vy))
}

/* ─── plate-geometry composer ─── */

export interface PlateGeometry {
  slots: Slot[]
  lines: FlightLine[]
  dust:  DustDot[]
}

export function buildPlateGeometry(agentCount = DEMO_AGENTS.length): PlateGeometry {
  const slots = placeAgents(agentCount)
  const lines = buildFlightLines(slots)
  const dust  = placeDust(200, slots, lines)
  return { slots, lines, dust }
}
