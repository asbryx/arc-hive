/**
 * cartogramSlots — deterministic geometry for the cartogram plate.
 *
 * The plate is a MAP OF ADDRESS SPACE. Six layers, each earning its
 * place in the territorial reading:
 *
 *   GRATICULE   — faint orthogonal grid at major hex boundaries. The
 *                 graticule of a meridian/parallel chart. Reads as
 *                 "this is a coordinate space," not floating cream.
 *
 *   REGIONS     — convex hulls around the three agent clusters. Reads
 *                 as territories (the way state lines do on a USGS
 *                 plate), with faint fill so dust shows through.
 *
 *   DENSITY     — dust biased to the regions + flight-line corridors,
 *                 sparse in the gutters. The "population" of the
 *                 territory.
 *
 *   CLIENT HUB  — single bigger marker at the southwest corner where
 *                 briefs originate.
 *
 *   FLIGHT FLOW — curved Bezier paths from hub to the 7 busiest agents,
 *                 not radial spokes. Reads as flow, the way Minard's
 *                 lines flow with the army's actual march.
 *
 *   NAMED CAST  — 12 agents placed inside three regions (5 in NW,
 *                 4 in NE, 3 in SE-stragglers), sized by rank: focal
 *                 #1 = 18u sigil / 22px name, etc.
 *
 * Everything pure + deterministic — same input, same layout.
 */

import { mulberry32, seedFrom } from './seededRandom'

export interface Point { x: number; y: number }
export interface Slot {
  x: number
  y: number
  anchor: 'start' | 'end'
  rank: number
  region: number              // 0..2
  sigilRadius: number
  nameSize: number
}
export interface FlightLine {
  from: Point
  to: Point
  /** Bezier control point for the curve */
  ctrl: Point
  phase: 'settled' | 'executing' | 'delivering'
  payload: string
  targetAgent: number
}
export interface DustDot { x: number; y: number; r: number; opacity: number }

/** A region = convex polygon enclosing a cluster of agents. */
export interface Region {
  /** points of the convex hull, in order. */
  hull: Point[]
  /** centroid for label placement. */
  centroid: Point
  /** label drawn at the top of the region. */
  label: string
  /** hex address-range caption drawn under the label. */
  subLabel: string
}

export const VIEWBOX = { w: 1600, h: 800 }
export const ACTIVE  = { x1: 80, y1: 160, x2: 1520, y2: 660 }

export const CLIENT_HUB: Point = { x: 145, y: 615 }

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

/* ─── hand-tuned slot positions, organized by region ───
 *
 * Three regions in the territory: a NW band (top-left of the plate, the
 * busy quarter where the focal lives), a NE band (top-right, mid-rank),
 * and a SE strip (bottom-center, quieter stragglers). The cartouche
 * occupies the SE-right corner and is excluded from agent placement.
 *
 * Coordinates are hand-tuned so the plate has a real composition. No
 * concentric rings, no math-derived "satellite arcs."
 */
interface SlotSeed {
  x: number; y: number; region: number; anchor: 'start' | 'end'
}

// rank-1-indexed → seed. Index 0 is the focal.
// Spread agents to fill the plate; avoid the cartouche zone (x>1200, y>480).
const SEEDS: SlotSeed[] = [
  // RANK 1 — Lyra, focal, NW center
  { x:  560, y: 300, region: 0, anchor: 'start' },
  // RANK 2 — Thorne, NW upper-right
  { x:  860, y: 230, region: 0, anchor: 'start' },
  // RANK 3 — Carter & Vale, NW lower
  { x:  340, y: 410, region: 0, anchor: 'start' },
  // RANK 4 — Selden Park, NW mid-right
  { x:  760, y: 400, region: 0, anchor: 'start' },
  // RANK 5 — Osric Wynn, NW upper-left
  { x:  250, y: 240, region: 0, anchor: 'start' },
  // RANK 6 — Mathis & Roe, NE upper-center
  { x: 1090, y: 250, region: 1, anchor: 'start' },
  // RANK 7 — Brae Hollinger, NE upper-right (label flips left, well clear of edge)
  { x: 1340, y: 220, region: 1, anchor: 'end'   },
  // RANK 8 — Verity & Bell, NE mid
  { x: 1100, y: 390, region: 1, anchor: 'start' },
  // RANK 9 — Halden Court, NE mid-right (label flips left)
  { x: 1380, y: 360, region: 1, anchor: 'end'   },
  // RANK 10 — Iris Voss, SW (south, west of cartouche)
  { x:  690, y: 570, region: 2, anchor: 'start' },
  // RANK 11 — Petra Sloane, SW left
  { x:  360, y: 590, region: 2, anchor: 'start' },
  // RANK 12 — Quill Marlowe, SW center
  { x:  970, y: 560, region: 2, anchor: 'start' },
]

const SIGIL_RADIUS_BY_RANK = (rank: number): number => {
  if (rank === 1)  return 18
  if (rank <= 4)   return 12
  if (rank <= 8)   return 10
  return 9
}
const NAME_SIZE_BY_RANK = (rank: number): number => {
  if (rank === 1)  return 22
  if (rank <= 4)   return 17
  if (rank <= 8)   return 14
  return 13
}

export function placeAgents(count: number): Slot[] {
  const out: Slot[] = []
  for (let i = 0; i < Math.min(count, SEEDS.length); i++) {
    const s = SEEDS[i]
    out.push({
      x: s.x,
      y: s.y,
      anchor: s.anchor,
      rank: i + 1,
      region: s.region,
      sigilRadius: SIGIL_RADIUS_BY_RANK(i + 1),
      nameSize: NAME_SIZE_BY_RANK(i + 1),
    })
  }
  return out
}

/* ─── regions (convex hulls over the cluster of agents per region) ─── */

function convexHull(points: Point[]): Point[] {
  // Andrew's monotone chain
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y)
  const cross = (o: Point, a: Point, b: Point) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const lower: Point[] = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0)
      lower.pop()
    lower.push(p)
  }
  const upper: Point[] = []
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0)
      upper.pop()
    upper.push(p)
  }
  lower.pop()
  upper.pop()
  return lower.concat(upper)
}

function expandHull(hull: Point[], pad: number): Point[] {
  // centroid-relative expansion
  const cx = hull.reduce((a, p) => a + p.x, 0) / hull.length
  const cy = hull.reduce((a, p) => a + p.y, 0) / hull.length
  return hull.map(p => {
    const dx = p.x - cx, dy = p.y - cy
    const d = Math.hypot(dx, dy) || 1
    return { x: p.x + (dx / d) * pad, y: p.y + (dy / d) * pad }
  })
}

export function buildRegions(slots: Slot[]): Region[] {
  const groups: Point[][] = [[], [], []]
  for (const s of slots) {
    if (s.region < 3) groups[s.region].push({ x: s.x, y: s.y })
  }
  const meta = [
    { label: 'NW QUADRANT · busy belt', subLabel: '0x00__ → 0x9F__' },
    { label: 'NE QUADRANT · long tail', subLabel: '0xA0__ → 0xFF__' },
    { label: 'SOUTH STRIP · settling',  subLabel: '0x20__ → 0xC0__' },
  ]
  return groups.map((g, i) => {
    if (g.length < 3) {
      const cx = g.reduce((a, p) => a + p.x, 0) / Math.max(g.length, 1)
      const cy = g.reduce((a, p) => a + p.y, 0) / Math.max(g.length, 1)
      return { hull: [], centroid: { x: cx, y: cy }, label: meta[i].label, subLabel: meta[i].subLabel }
    }
    const hull = expandHull(convexHull(g), 75)
    // place the label at the TOP of the hull (not centroid), so it sits in dust not over agents
    const topY = Math.min(...hull.map(p => p.y))
    const topX = hull.reduce((a, p) => a + p.x, 0) / hull.length
    return {
      hull,
      centroid: { x: topX, y: topY },
      label: meta[i].label,
      subLabel: meta[i].subLabel,
    }
  })
}

/* ─── flight lines (curved Bezier paths from hub) ─── */

interface LineSpec {
  targetRank: number
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
  { targetRank: 7,  phase: 'delivering', payload: 'JOB-2835 · deliv.' },
]

/**
 * Curve each line out of the hub so they don't all radiate as a star.
 * Control point: midpoint pushed perpendicular to the line by a seeded
 * amount, alternating sign to spread the bundle.
 */
export function buildFlightLines(slots: Slot[]): FlightLine[] {
  const rng = mulberry32(seedFrom('flight-curve-v5'))
  const out: FlightLine[] = []
  for (let i = 0; i < LINE_SPECS.length; i++) {
    const spec = LINE_SPECS[i]
    const target = slots[spec.targetRank - 1]
    if (!target) continue
    const dx = target.x - CLIENT_HUB.x
    const dy = target.y - CLIENT_HUB.y
    const mx = CLIENT_HUB.x + dx * 0.5
    const my = CLIENT_HUB.y + dy * 0.5
    const len = Math.hypot(dx, dy) || 1
    // perpendicular direction
    const px = -dy / len
    const py =  dx / len
    // alternate sign so lines bow up vs down
    const sign = i % 2 === 0 ? -1 : 1
    // magnitude is a fraction of line length + jitter
    const mag = len * 0.18 + rng() * 30
    out.push({
      from: CLIENT_HUB,
      to: { x: target.x, y: target.y },
      ctrl: { x: mx + px * mag * sign, y: my + py * mag * sign },
      phase: spec.phase,
      payload: spec.payload,
      targetAgent: spec.targetRank - 1,
    })
  }
  return out
}

/* ─── ambient dust ─── */

export function placeDust(
  count: number,
  agentSlots: Slot[],
  lines: FlightLine[],
): DustDot[] {
  const rng = mulberry32(seedFrom('cartogram-dust-v6'))
  const out: DustDot[] = []

  const labelRects = agentSlots.map(s => {
    const w = s.rank === 1 ? 200 : 140
    const h = s.rank === 1 ? 48 : 32
    const left = s.anchor === 'end' ? s.x - 24 - w : s.x + 24
    return { x1: left - 8, y1: s.y - h / 2 - 8, x2: left + w + 8, y2: s.y + h / 2 + 8 }
  })

  // density field: dense in each region's vicinity, denser along curved flight paths
  const regionCenters = [
    { x: 540, y: 320 },
    { x: 1200, y: 320 },
    { x: 660, y: 580 },
  ]
  const density = (x: number, y: number): number => {
    let d = 0   // HARD ZERO baseline — dead zones get NO dust
    for (const c of regionCenters) {
      const r = Math.hypot(c.x - x, c.y - y)
      if (r < 300) d = Math.max(d, 1.0 - r / 360)
    }
    for (const l of lines) {
      const r = distanceToSegment({ x, y }, l.from, l.to)
      if (r < 70) d = Math.max(d, 0.85 - r / 100)
    }
    return Math.min(1.2, d)
  }

  let attempts = 0
  while (out.length < count && attempts < count * 20) {
    attempts++
    const x = ACTIVE.x1 + 24 + rng() * (ACTIVE.x2 - ACTIVE.x1 - 48)
    const y = ACTIVE.y1 + 24 + rng() * (ACTIVE.y2 - ACTIVE.y1 - 48)
    const d = density(x, y)
    if (d <= 0) continue           // dead zone — skip outright
    if (rng() > d) continue
    if (labelRects.some(r => x >= r.x1 && x <= r.x2 && y >= r.y1 && y <= r.y2)) continue
    if (agentSlots.some(s => Math.hypot(s.x - x, s.y - y) < s.sigilRadius + 12)) continue
    if (lines.some(l => distanceToSegment({ x, y }, l.from, l.to) < 5)) continue
    if (x > 1200 && y > 480) continue   // cartouche zone

    // dot size + opacity scale with density (denser zones = bolder dots)
    const r = d > 0.7 ? (rng() < 0.4 ? 1.7 : 1.3) : (rng() < 0.6 ? 1.0 : 0.7)
    const op = 0.40 + d * 0.45
    out.push({ x, y, r, opacity: Math.min(0.85, op) })
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
  regions: Region[]
  dust:  DustDot[]
}

export function buildPlateGeometry(agentCount = DEMO_AGENTS.length): PlateGeometry {
  const slots = placeAgents(agentCount)
  const lines = buildFlightLines(slots)
  const regions = buildRegions(slots)
  const dust  = placeDust(240, slots, lines)
  return { slots, lines, regions, dust }
}
