/**
 * squarifiedTreemap — pack rectangles into a bounding box such that:
 *   - area(i) ∝ weight(i)
 *   - aspect ratios stay close to 1 (squarish)
 *   - the bounding box is filled completely (no gaps)
 *
 * Implementation of Bruls/Huijsen/van Wijk (2000), "Squarified Treemaps."
 *
 * For section iii the inputs are the visible lots and their USDC prices;
 * the output is per-lot { x, y, w, h } in container pixel space, which
 * the renderer slaps on as inline `position: absolute` styles. No fixed
 * grid template; right edge AND bottom edge are flush by construction.
 */

export interface TreemapInput {
  /** opaque key — e.g. jobId. Returned in the layout. */
  id: string | number
  /** weight (area is proportional to this; must be > 0). */
  weight: number
}

export interface TreemapTile {
  id: string | number
  x: number
  y: number
  w: number
  h: number
}

export interface TreemapBox {
  x: number
  y: number
  w: number
  h: number
}

/** worst aspect ratio in a row of rects laid out in `length`. */
function worst(row: number[], length: number): number {
  if (row.length === 0 || length === 0) return Infinity
  const sum = row.reduce((a, b) => a + b, 0)
  let rMin = Infinity
  let rMax = 0
  for (const v of row) {
    if (v < rMin) rMin = v
    if (v > rMax) rMax = v
  }
  // length² · max / sum² vs sum² / (length² · min) — return the larger
  const length2 = length * length
  const sum2 = sum * sum
  return Math.max((length2 * rMax) / sum2, sum2 / (length2 * rMin))
}

/** layout one row of children along the short side of `rect`, return remaining rect. */
function layoutRow(
  row: TreemapInput[],
  rowAreas: number[],
  rect: TreemapBox,
  out: TreemapTile[],
): TreemapBox {
  const sum = rowAreas.reduce((a, b) => a + b, 0)
  if (sum <= 0) return rect

  const horizontal = rect.w >= rect.h
  if (horizontal) {
    // row laid along the LEFT short side, so width = sum / h, tiles stack vertically
    const w = sum / rect.h
    let y = rect.y
    for (let i = 0; i < row.length; i++) {
      const h = rowAreas[i] / w
      out.push({ id: row[i].id, x: rect.x, y, w, h })
      y += h
    }
    return { x: rect.x + w, y: rect.y, w: rect.w - w, h: rect.h }
  } else {
    // row laid along the TOP short side, so height = sum / w, tiles stack horizontally
    const h = sum / rect.w
    let x = rect.x
    for (let i = 0; i < row.length; i++) {
      const w = rowAreas[i] / h
      out.push({ id: row[i].id, x, y: rect.y, w, h })
      x += w
    }
    return { x: rect.x, y: rect.y + h, w: rect.w, h: rect.h - h }
  }
}

/**
 * Squarify items into the box. Items are processed in order; for best
 * visual hierarchy, sort by weight descending before calling.
 *
 * Returns one TreemapTile per input, in the same order.
 */
export function squarify(
  box: TreemapBox,
  items: TreemapInput[],
): TreemapTile[] {
  const out: TreemapTile[] = []
  if (items.length === 0 || box.w <= 0 || box.h <= 0) return out

  // scale weights so total weight = total box area
  const totalWeight = items.reduce((a, b) => a + b.weight, 0)
  if (totalWeight <= 0) return out
  const totalArea = box.w * box.h
  const scaled = items.map(it => ({
    item: it,
    area: (it.weight / totalWeight) * totalArea,
  }))

  let rect: TreemapBox = { ...box }
  let row: TreemapInput[] = []
  let rowAreas: number[] = []
  let i = 0

  while (i < scaled.length) {
    const next = scaled[i]
    const length = Math.min(rect.w, rect.h)

    if (row.length === 0) {
      row = [next.item]
      rowAreas = [next.area]
      i++
      continue
    }

    const wCurr = worst(rowAreas, length)
    const wNext = worst([...rowAreas, next.area], length)

    if (wNext <= wCurr) {
      row.push(next.item)
      rowAreas.push(next.area)
      i++
    } else {
      rect = layoutRow(row, rowAreas, rect, out)
      row = []
      rowAreas = []
    }
  }

  // flush the final row
  if (row.length > 0) {
    layoutRow(row, rowAreas, rect, out)
  }

  // map back to input order so callers can zip directly
  const byId = new Map<string | number, TreemapTile>()
  for (const t of out) byId.set(t.id, t)
  return items.map(it => byId.get(it.id)!).filter(Boolean)
}

/**
 * Convenience wrapper: enforce min area + sort by weight desc. Items
 * whose weight would produce sub-min-area tiles get their weight
 * boosted to the floor; this keeps every tile visually readable while
 * still making bigger-priced lots bigger.
 */
export function squarifyWithFloor(
  box: TreemapBox,
  items: TreemapInput[],
  minArea = 18000,
): TreemapTile[] {
  if (items.length === 0) return []
  const sorted = [...items].sort((a, b) => b.weight - a.weight)
  const totalArea = box.w * box.h
  const totalWeight = sorted.reduce((a, b) => a + b.weight, 0)
  if (totalWeight <= 0 || totalArea <= 0) return []

  // weight floor that produces minArea given current scale
  const minWeight = (minArea / totalArea) * totalWeight
  const floored = sorted.map(it => ({
    id: it.id,
    weight: Math.max(it.weight, minWeight),
  }))

  return squarify(box, floored)
}
