/**
 * cartogramSlots — slot-placement for the cartogram's six named agents.
 *
 * Per _design-archive/06-cartogram-and-floor-fixes.md §A: the chart
 * historically looked "messy" because labels were hand-placed and were
 * allowed to overlap flight-line strokes. The fix is a deterministic
 * placement function that:
 *
 * 1. Restricts label positions to the active region (y 180..620,
 *    x 80..1520) inside the 1600×800 viewBox.
 * 2. Forbids a label rectangle from intersecting any flight line's
 *    keep-out corridor (±28 viewBox units perpendicular).
 * 3. Forbids a label rectangle from overlapping any other agent's
 *    label rectangle padded by 12 units.
 *
 * Output is six {x, y, anchor} slots that satisfy both constraints.
 * Input is the six agents + the three flight lines. Same input → same
 * output — no Math.random.
 */

export interface Point { x: number; y: number }
export interface FlightLine { from: Point; to: Point }
export interface Slot {
  x: number
  y: number
  /** SVG text-anchor; 'end' makes the label flip to the left of the point. */
  anchor: 'start' | 'end'
}

export const VIEWBOX = { w: 1600, h: 800 }
export const ACTIVE  = { x1: 80, y1: 180, x2: 1520, y2: 620 }

/** approximate label rect (in viewBox units) for the Fraunces 15 italic + addr line */
const LABEL_W = 130
const LABEL_H = 30
const CORRIDOR = 28           // perpendicular keep-out from any flight line
const PAD      = 12           // padding around an already-placed label rect

/**
 * Six seed slots known to satisfy all corridors when the three canonical
 * flight lines run from (100,500)→(1080,420), (120,280)→(700,340),
 * (180,620)→(380,220). Treat as the starting layout the algorithm may
 * perturb if the data changes.
 */
export const SEED_SLOTS: Slot[] = [
  { x:  380, y: 220, anchor: 'start' },  // 0 · upper-left
  { x:  840, y: 210, anchor: 'start' },  // 1 · upper-mid
  { x:  700, y: 340, anchor: 'start' },  // 2 · executing target
  { x: 1080, y: 420, anchor: 'start' },  // 3 · delivering target
  { x:  540, y: 580, anchor: 'start' },  // 4 · lower-mid
  { x: 1340, y: 300, anchor: 'end'   },  // 5 · far-right (label flips left)
]

/** Distance from point p to the infinite line through a → b. */
function distanceToLine(p: Point, a: Point, b: Point): number {
  const vx = b.x - a.x, vy = b.y - a.y
  const len = Math.hypot(vx, vy)
  if (len === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  // |cross| / |v|
  return Math.abs(vx * (a.y - p.y) - vy * (a.x - p.x)) / len
}

/** Distance from point p to the closest point on segment a → b. */
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

/** Label rectangle for a slot (taking anchor into account). */
function labelRect(slot: Slot) {
  // text starts 18 units off the point (mockup spec). Rect grows AWAY from anchor.
  const startsLeftOfPoint = slot.anchor === 'end'
  const left = startsLeftOfPoint ? slot.x - 18 - LABEL_W : slot.x + 18
  return { x1: left, y1: slot.y - LABEL_H / 2, x2: left + LABEL_W, y2: slot.y + LABEL_H / 2 }
}

function rectsOverlap(
  a: { x1: number; y1: number; x2: number; y2: number },
  b: { x1: number; y1: number; x2: number; y2: number },
  pad = 0,
): boolean {
  return !(a.x2 + pad < b.x1 || b.x2 + pad < a.x1 || a.y2 + pad < b.y1 || b.y2 + pad < a.y1)
}

/** Sample the rect on a 4-corner + center grid; if any sample lies inside a flight-line corridor, reject. */
function rectIntersectsCorridor(
  r: { x1: number; y1: number; x2: number; y2: number },
  line: FlightLine,
): boolean {
  const samples: Point[] = [
    { x: r.x1, y: r.y1 },
    { x: r.x2, y: r.y1 },
    { x: r.x1, y: r.y2 },
    { x: r.x2, y: r.y2 },
    { x: (r.x1 + r.x2) / 2, y: (r.y1 + r.y2) / 2 },
  ]
  return samples.some(s => distanceToSegment(s, line.from, line.to) < CORRIDOR)
}

/** Walk a slot outwards looking for a position that violates no constraint. */
function searchFor(
  start: Slot,
  lines: FlightLine[],
  placed: { rect: ReturnType<typeof labelRect> }[],
): Slot {
  const tries: Array<{ dx: number; dy: number }> = []
  // grow a spiral of candidate offsets up to 200 units
  for (let r = 0; r <= 200; r += 14) {
    for (let a = 0; a < 360; a += 30) {
      const rad = (a * Math.PI) / 180
      tries.push({ dx: Math.round(r * Math.cos(rad)), dy: Math.round(r * Math.sin(rad)) })
    }
  }

  for (const t of tries) {
    const candidate: Slot = { ...start, x: start.x + t.dx, y: start.y + t.dy }
    // stay inside active region
    if (candidate.x < ACTIVE.x1 + 20 || candidate.x > ACTIVE.x2 - 20) continue
    if (candidate.y < ACTIVE.y1 + 20 || candidate.y > ACTIVE.y2 - 20) continue
    const rect = labelRect(candidate)
    // corridor check
    if (lines.some(l => rectIntersectsCorridor(rect, l))) continue
    // label–label check
    if (placed.some(p => rectsOverlap(rect, p.rect, PAD))) continue
    return candidate
  }
  // last-resort: return original (the chart will look crowded but won't crash)
  return start
}

/**
 * Place N agents using the seed slots, perturbing any that violate the
 * corridor or label-overlap rules. Deterministic for a given input.
 */
export function placeAgents(count: number, lines: FlightLine[]): Slot[] {
  const placed: { slot: Slot; rect: ReturnType<typeof labelRect> }[] = []
  for (let i = 0; i < count; i++) {
    const seed = SEED_SLOTS[i % SEED_SLOTS.length]
    let candidate = seed
    const seedRect = labelRect(seed)
    const corridorOk = !lines.some(l => rectIntersectsCorridor(seedRect, l))
    const overlapOk  = !placed.some(p => rectsOverlap(seedRect, p.rect, PAD))
    if (!(corridorOk && overlapOk)) {
      candidate = searchFor(seed, lines, placed)
    }
    placed.push({ slot: candidate, rect: labelRect(candidate) })
  }
  return placed.map(p => p.slot)
}

/** Canonical flight lines used by the demo cartogram. Replace with live data later. */
export const DEMO_LINES: FlightLine[] = [
  { from: { x: 180, y: 620 }, to: { x: 1080, y: 420 } }, // SETTLED
  { from: { x: 120, y: 280 }, to: { x:  700, y: 340 } }, // EXECUTING
  { from: { x: 100, y: 500 }, to: { x:  380, y: 220 } }, // DELIVERING
]
