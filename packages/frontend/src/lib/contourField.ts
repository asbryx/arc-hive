/**
 * contourField — turn a set of "activity peaks" into a topographic
 * elevation field and extract contour lines from it (marching squares).
 *
 * This is the substrate of the cartogram: address space as TERRITORY.
 * Elevation = agent density / marketplace activity. Busy clusters are
 * highlands; idle space is lowland; beyond the coastline is the void of
 * unallocated address space. Contours fill the whole plate so it reads
 * as a real map, not floating labels on empty paper.
 *
 * Everything is pure + deterministic — same peaks, same field, same
 * contours, every render.
 */

export interface Peak { x: number; y: number; h: number; spread: number }
export interface Seg { x1: number; y1: number; x2: number; y2: number }

export interface FieldConfig {
  w: number
  h: number
  /** grid cell size in viewBox units (smaller = smoother contours, slower). */
  cell: number
  peaks: Peak[]
}

export interface SampledField {
  /** field[row][col], rows 0..ny inclusive, cols 0..nx inclusive. */
  grid: number[][]
  nx: number
  ny: number
  cell: number
  max: number
  /** sample the continuous field at an arbitrary point (bilinear-free, exact gaussian sum). */
  at: (x: number, y: number) => number
}

/** Exact gaussian-sum elevation at a point. */
function elevation(peaks: Peak[], x: number, y: number): number {
  let v = 0
  for (const p of peaks) {
    const dx = x - p.x
    const dy = y - p.y
    v += p.h * Math.exp(-(dx * dx + dy * dy) / (2 * p.spread * p.spread))
  }
  return v
}

export function sampleField(cfg: FieldConfig): SampledField {
  const nx = Math.ceil(cfg.w / cfg.cell)
  const ny = Math.ceil(cfg.h / cfg.cell)
  const grid: number[][] = []
  let max = 0
  for (let r = 0; r <= ny; r++) {
    const row: number[] = []
    for (let c = 0; c <= nx; c++) {
      const v = elevation(cfg.peaks, c * cfg.cell, r * cfg.cell)
      if (v > max) max = v
      row.push(v)
    }
    grid.push(row)
  }
  return {
    grid, nx, ny, cell: cfg.cell, max,
    at: (x, y) => elevation(cfg.peaks, x, y),
  }
}

/* ─── marching squares ─── */

// edge crossing helpers: linear interpolation where value == level
function lerp(a: number, b: number, level: number): number {
  if (a === b) return 0.5
  return (level - a) / (b - a)
}

/**
 * Extract contour segments at a given level. Returns line segments in
 * viewBox coordinates. Standard 16-case marching squares with
 * TL=8, TR=4, BR=2, BL=1.
 */
export function contourAt(field: SampledField, level: number): Seg[] {
  const { grid, nx, ny, cell } = field
  const segs: Seg[] = []

  for (let r = 0; r < ny; r++) {
    for (let c = 0; c < nx; c++) {
      const tl = grid[r][c]
      const tr = grid[r][c + 1]
      const br = grid[r + 1][c + 1]
      const bl = grid[r + 1][c]

      let idx = 0
      if (tl > level) idx |= 8
      if (tr > level) idx |= 4
      if (br > level) idx |= 2
      if (bl > level) idx |= 1
      if (idx === 0 || idx === 15) continue

      const x0 = c * cell
      const y0 = r * cell
      const x1 = (c + 1) * cell
      const y1 = (r + 1) * cell

      // edge crossing points
      const T = { x: x0 + lerp(tl, tr, level) * cell, y: y0 }
      const R = { x: x1, y: y0 + lerp(tr, br, level) * cell }
      const B = { x: x0 + lerp(bl, br, level) * cell, y: y1 }
      const L = { x: x0, y: y0 + lerp(tl, bl, level) * cell }

      const push = (a: { x: number; y: number }, b: { x: number; y: number }) =>
        segs.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y })

      switch (idx) {
        case 1:  push(L, B); break
        case 2:  push(B, R); break
        case 3:  push(L, R); break
        case 4:  push(T, R); break
        case 5:  push(L, T); push(B, R); break
        case 6:  push(T, B); break
        case 7:  push(L, T); break
        case 8:  push(L, T); break
        case 9:  push(T, B); break
        case 10: push(T, R); push(L, B); break
        case 11: push(T, R); break
        case 12: push(L, R); break
        case 13: push(B, R); break
        case 14: push(L, B); break
      }
    }
  }
  return segs
}

/** Build an SVG path `d` string from a list of independent segments. */
export function segsToPath(segs: Seg[]): string {
  let d = ''
  for (const s of segs) {
    d += `M${s.x1.toFixed(1)} ${s.y1.toFixed(1)}L${s.x2.toFixed(1)} ${s.y2.toFixed(1)}`
  }
  return d
}

/**
 * Chain disconnected marching-squares segments into continuous polylines
 * by matching endpoints, then emit smooth SVG paths (Catmull-Rom → cubic
 * Bézier). This turns the jagged broken-dash output into clean, elegant,
 * nested contour lines that read as real topography.
 */
export function segsToSmoothPaths(segs: Seg[], quant = 1): string {
  if (segs.length === 0) return ''
  const key = (x: number, y: number) => `${Math.round(x / quant)},${Math.round(y / quant)}`

  // adjacency: endpoint key -> list of {seg index, which end}
  type End = { seg: number; end: 0 | 1 }
  const ends = new Map<string, End[]>()
  segs.forEach((s, i) => {
    const k0 = key(s.x1, s.y1)
    const k1 = key(s.x2, s.y2)
    ;(ends.get(k0) ?? ends.set(k0, []).get(k0)!).push({ seg: i, end: 0 })
    ;(ends.get(k1) ?? ends.set(k1, []).get(k1)!).push({ seg: i, end: 1 })
  })

  const used = new Array(segs.length).fill(false)
  const polylines: Array<Array<{ x: number; y: number }>> = []

  const ptOf = (i: number, end: 0 | 1) =>
    end === 0 ? { x: segs[i].x1, y: segs[i].y1 } : { x: segs[i].x2, y: segs[i].y2 }

  for (let start = 0; start < segs.length; start++) {
    if (used[start]) continue
    used[start] = true
    const line = [ptOf(start, 0), ptOf(start, 1)]

    // extend forward from the tail
    let grew = true
    while (grew) {
      grew = false
      const tail = line[line.length - 1]
      const cand = ends.get(key(tail.x, tail.y)) ?? []
      for (const e of cand) {
        if (used[e.seg]) continue
        const near = ptOf(e.seg, e.end)
        const far = ptOf(e.seg, e.end === 0 ? 1 : 0)
        if (Math.abs(near.x - tail.x) < quant && Math.abs(near.y - tail.y) < quant) {
          line.push(far)
          used[e.seg] = true
          grew = true
          break
        }
      }
    }
    polylines.push(line)
  }

  // emit each polyline as a smoothed path (Catmull-Rom to cubic Bézier)
  let d = ''
  for (const pts of polylines) {
    if (pts.length < 2) continue
    if (pts.length === 2) {
      d += `M${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}L${pts[1].x.toFixed(1)} ${pts[1].y.toFixed(1)}`
      continue
    }
    d += `M${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] ?? pts[i]
      const p1 = pts[i]
      const p2 = pts[i + 1]
      const p3 = pts[i + 2] ?? p2
      const c1x = p1.x + (p2.x - p0.x) / 6
      const c1y = p1.y + (p2.y - p0.y) / 6
      const c2x = p2.x - (p3.x - p1.x) / 6
      const c2y = p2.y - (p3.y - p1.y) / 6
      d += `C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`
    }
  }
  return d
}
