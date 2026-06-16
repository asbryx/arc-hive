/**
 * cartogramSlots — deterministic placement for the cartogram plate.
 *
 * The design intent (per _design-archive/01-style-A-cartogram.md): a
 * printed cartographic plate that treats the marketplace as a territory.
 * Each named agent is a labeled point in address-space; each in-flight
 * brief is a flow line crossing the field; ambient idle agents are dust.
 *
 * This module computes, from a fixed seed, three deterministic layers:
 *
 *   1. NAMED AGENTS — 12 labeled points in 3 reading bands. Sigil at
 *      the point, italic-Fraunces name + mono-caps addr · score offset
 *      to the right (or left, for the rightmost three, so labels don't
 *      run off the plate edge).
 *
 *   2. FLIGHT LINES — 7 lines from client markers on the left/bottom
 *      edge to 7 distinct named agents:
 *        · 2 SETTLED   (solid marsh, arrowhead, draws on once)
 *        · 3 EXECUTING (short-dashed hot, marches continuously)
 *        · 2 DELIVERING (long-dashed marsh, marches continuously)
 *
 *   3. DUST — ~120 small ink-3 dots scattered across the active region
 *      with seeded jitter. Dust dots respect a 24u keep-out from any
 *      named-agent label rect and a 18u keep-out from any flight line.
 *
 * All output is pure; same input → same layout, no Math.random() at
 * render time.
 */

import { mulberry32, seedFrom } from './seededRandom'

export interface Point { x: number; y: number }
export interface Slot { x: number; y: number; anchor: 'start' | 'end' }
export interface FlightLine {
  from: Point
  to: Point
  phase: 'settled' | 'executing' | 'delivering'
  payload: string
  /** index of the agent in the named cast that this line terminates at */
  targetAgent: number
}
export interface DustDot { x: number; y: number; r: number }

export const VIEWBOX = { w: 1600, h: 800 }
export const ACTIVE  = { x1: 80, y1: 160, x2: 1520, y2: 660 }

/** approximate label rect (in viewBox units): Fraunces 15 italic + addr line below */
const LABEL_W = 138
const LABEL_H = 32
const CORRIDOR = 30      // perpendicular keep-out around any flight line
const PAD      = 12      // padding around an already-placed label rect

/** client markers on the left and bottom edges. Flight lines originate from these. */
export const CLIENT_MARKERS: Point[] = [
  { x:  60, y: 240 },
  { x:  60, y: 380 },
  { x:  60, y: 520 },
  { x:  60, y: 640 },
  { x: 240, y: 760 },
]

/** the named cast — demo data. Replace with useLeaderboard('activity', 12) when live. */
export interface DemoAgent {
  name: string
  addr: string
  score: number
  phase: 'settled' | 'executing' | 'delivering' | 'idle'
}
export const DEMO_AGENTS: DemoAgent[] = [
  { name: 'Iris Voss',          addr: '0x88BD', score: 7.68, phase: 'delivering' },
  { name: 'Lyra Synthwright',   addr: '0xA8C3', score: 9.42, phase: 'executing'  },
  { name: 'Thorne Ledger',      addr: '0x3B17', score: 8.91, phase: 'executing'  },
  { name: 'Carter & Vale',      addr: '0x4C91', score: 8.71, phase: 'settled'    },
  { name: 'Verity & Bell',      addr: '0x7E02', score: 7.94, phase: 'idle'       },
  { name: 'Halden Court',       addr: '0x55AB', score: 7.81, phase: 'settled'    },
  { name: 'Osric Wynn',         addr: '0x1F44', score: 8.22, phase: 'executing'  },
  { name: 'Petra Sloane',       addr: '0xD019', score: 7.55, phase: 'delivering' },
  { name: 'Mathis & Roe',       addr: '0x6822', score: 8.04, phase: 'idle'       },
  { name: 'Quill Marlowe',      addr: '0x9C70', score: 7.32, phase: 'idle'       },
  { name: 'Selden Park',        addr: '0x2E58', score: 8.46, phase: 'idle'       },
  { name: 'Brae Hollinger',     addr: '0xF103', score: 7.97, phase: 'idle'       },
]

/* ─── geometry helpers ─── */

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

interface Rect { x1: number; y1: number; x2: number; y2: number }

function labelRect(slot: Slot): Rect {
  const startsLeftOfPoint = slot.anchor === 'end'
  const left = startsLeftOfPoint ? slot.x - 18 - LABEL_W : slot.x + 18
  return {
    x1: left,
    y1: slot.y - LABEL_H / 2,
    x2: left + LABEL_W,
    y2: slot.y + LABEL_H / 2,
  }
}

function rectsOverlap(a: Rect, b: Rect, pad = 0): boolean {
  return !(
    a.x2 + pad < b.x1 ||
    b.x2 + pad < a.x1 ||
    a.y2 + pad < b.y1 ||
    b.y2 + pad < a.y1
  )
}

function rectIntersectsCorridor(r: Rect, line: FlightLine): boolean {
  const samples: Point[] = [
    { x: r.x1, y: r.y1 },
    { x: r.x2, y: r.y1 },
    { x: r.x1, y: r.y2 },
    { x: r.x2, y: r.y2 },
    { x: (r.x1 + r.x2) / 2, y: (r.y1 + r.y2) / 2 },
  ]
  return samples.some(s => distanceToSegment(s, line.from, line.to) < CORRIDOR)
}

/* ─── named-agent placement ─── */

/** 3 reading bands × 4 agents each. */
const BANDS: Array<{ y: number; count: number }> = [
  { y: 215, count: 4 },
  { y: 380, count: 4 },
  { y: 555, count: 4 },
]

/**
 * Compute seed slots for the named cast: 4 agents per band, evenly
 * spaced along x with seeded jitter so the plate reads organic rather
 * than gridded. The rightmost agent in each band gets anchor='end' so
 * its label flips left.
 */
function seedSlots(): Slot[] {
  const rng = mulberry32(seedFrom('cartogram-slots-v2'))
  const slots: Slot[] = []
  const xMin = ACTIVE.x1 + 220
  const xMax = ACTIVE.x2 - 200
  for (const band of BANDS) {
    const stride = (xMax - xMin) / (band.count - 1)
    for (let i = 0; i < band.count; i++) {
      const baseX = xMin + i * stride
      const jx = (rng() - 0.5) * 90
      const jy = (rng() - 0.5) * 40
      const anchor: 'start' | 'end' = i === band.count - 1 ? 'end' : 'start'
      slots.push({ x: baseX + jx, y: band.y + jy, anchor })
    }
  }
  return slots
}

/** Spiral-search outward from a seed slot for a position with no collision. */
function searchFor(
  start: Slot,
  lines: FlightLine[],
  placed: Rect[],
): Slot {
  for (let ring = 1; ring <= 10; ring++) {
    const step = 18 * ring
    const directions: Array<[number, number]> = [
      [step, 0], [-step, 0], [0, step], [0, -step],
      [step, step], [step, -step], [-step, step], [-step, -step],
    ]
    for (const [dx, dy] of directions) {
      const cand: Slot = { x: start.x + dx, y: start.y + dy, anchor: start.anchor }
      if (cand.y < ACTIVE.y1 + 20 || cand.y > ACTIVE.y2 - 20) continue
      if (cand.x < ACTIVE.x1 + 30 || cand.x > ACTIVE.x2 - 30) continue
      const r = labelRect(cand)
      const corridorOk = !lines.some(l => rectIntersectsCorridor(r, l))
      const overlapOk  = !placed.some(p => rectsOverlap(r, p, PAD))
      if (corridorOk && overlapOk) return cand
    }
  }
  return start
}

export function placeAgents(count: number, lines: FlightLine[]): Slot[] {
  const seeds = seedSlots()
  const placed: Rect[] = []
  const out: Slot[] = []
  for (let i = 0; i < count; i++) {
    const seed = seeds[i % seeds.length]
    const seedR = labelRect(seed)
    const corridorOk = !lines.some(l => rectIntersectsCorridor(seedR, l))
    const overlapOk  = !placed.some(p => rectsOverlap(seedR, p, PAD))
    const slot = corridorOk && overlapOk ? seed : searchFor(seed, lines, placed)
    out.push(slot)
    placed.push(labelRect(slot))
  }
  return out
}

/* ─── flight lines ─── */

/**
 * Build 7 flight lines from the 5 client markers to 7 of the 12 named
 * agents. The targetAgent indices are stable so the SETTLED / EXECUTING /
 * DELIVERING phases land where they should.
 */
export function buildFlightLines(slots: Slot[]): FlightLine[] {
  const target = (i: number) => slots[i] ?? slots[0]
  return [
    // SETTLED — 2 lines, originating from upper-left clients
    {
      from: CLIENT_MARKERS[0],
      to: target(3),
      phase: 'settled',
      payload: 'JOB-2841 · +2.40 USDC',
      targetAgent: 3,
    },
    {
      from: CLIENT_MARKERS[3],
      to: target(5),
      phase: 'settled',
      payload: 'JOB-2837 · +1.85 USDC',
      targetAgent: 5,
    },
    // EXECUTING — 3 lines, hot dashes, mid + lower-right targets
    {
      from: CLIENT_MARKERS[1],
      to: target(1),
      phase: 'executing',
      payload: 'JOB-2840 · 9/12 STEPS',
      targetAgent: 1,
    },
    {
      from: CLIENT_MARKERS[2],
      to: target(2),
      phase: 'executing',
      payload: 'JOB-2839 · 4/8 STEPS',
      targetAgent: 2,
    },
    {
      from: CLIENT_MARKERS[4],
      to: target(6),
      phase: 'executing',
      payload: 'JOB-2836 · 11/14',
      targetAgent: 6,
    },
    // DELIVERING — 2 lines, long-dash marsh
    {
      from: CLIENT_MARKERS[0],
      to: target(0),
      phase: 'delivering',
      payload: 'JOB-2838 · DELIV.',
      targetAgent: 0,
    },
    {
      from: CLIENT_MARKERS[2],
      to: target(7),
      phase: 'delivering',
      payload: 'JOB-2835 · DELIV.',
      targetAgent: 7,
    },
  ]
}

/* ─── ambient dust ─── */

/**
 * Place N dust dots inside the active region with seeded jitter, skipping
 * any position that would violate the keep-out from named agents or
 * flight lines. The result is the visible "ambient population" of the
 * marketplace — a printed plate's equivalent of background noise.
 */
export function placeDust(
  count: number,
  agentSlots: Slot[],
  lines: FlightLine[],
): DustDot[] {
  const rng = mulberry32(seedFrom('cartogram-dust-v2'))
  const out: DustDot[] = []
  const labelRects = agentSlots.map(labelRect)
  const xPad = 30
  const yPad = 30
  let attempts = 0
  while (out.length < count && attempts < count * 10) {
    attempts++
    const x = ACTIVE.x1 + xPad + rng() * (ACTIVE.x2 - ACTIVE.x1 - xPad * 2)
    const y = ACTIVE.y1 + yPad + rng() * (ACTIVE.y2 - ACTIVE.y1 - yPad * 2)

    // keep-out from named agent points (sigil zone)
    const tooCloseToAgent = agentSlots.some(s =>
      Math.hypot(s.x - x, s.y - y) < 28,
    )
    if (tooCloseToAgent) continue

    // keep-out from label rects (with small pad so dust doesn't muddy text)
    const tooCloseToLabel = labelRects.some(r =>
      x >= r.x1 - 6 && x <= r.x2 + 6 && y >= r.y1 - 6 && y <= r.y2 + 6,
    )
    if (tooCloseToLabel) continue

    // keep-out from flight lines
    const tooCloseToLine = lines.some(l =>
      distanceToSegment({ x, y }, l.from, l.to) < 18,
    )
    if (tooCloseToLine) continue

    // tiny size jitter
    const r = rng() < 0.18 ? 1.6 : rng() < 0.6 ? 1.2 : 0.9
    out.push({ x, y, r })
  }
  return out
}

/* ─── one-shot composer for the Plate ─── */

export interface PlateGeometry {
  slots: Slot[]
  lines: FlightLine[]
  dust:  DustDot[]
}

export function buildPlateGeometry(agentCount = DEMO_AGENTS.length): PlateGeometry {
  // seed an empty line list first to get slot positions, then build real
  // lines against those slots so payloads terminate at agent points.
  const slots0 = placeAgents(agentCount, [])
  const lines  = buildFlightLines(slots0)
  // re-run placement now that lines exist so labels respect corridors
  const slots  = placeAgents(agentCount, lines)
  const dust   = placeDust(120, slots, lines)
  return { slots, lines, dust }
}
