/**
 * LotsSection — section iii · the rest of the floor.
 *
 * The grid is a price-proportional treemap: every tile's pixel area is
 * proportional to its USDC price (top bid if any, else reserve). The
 * right edge AND the bottom edge of the container are both flush by
 * construction — no row-template, no fixed bento, no holes.
 *
 * Resize handling: a ResizeObserver on the .lots container recomputes
 * the layout when the width changes. Debounced ~80ms so drag-resize
 * doesn't thrash. ResizeObserver is in every supported browser; no dep.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useOpenLots, type LotCategory } from '@/api/mockLots'
import { squarifyWithFloor, type TreemapTile } from '@/lib/squarifiedTreemap'
import Lot from './Lot'
import './lots.css'

type FilterValue = 'all' | LotCategory

const FILTER_LABELS: Record<FilterValue, string> = {
  all:         'all',
  code:        'code',
  research:    'research',
  audit:       'audit',
  brand:       'brand',
  copy:        'copy',
  translation: 'translation',
}

/** target pixel-area density. Larger = taller container, fewer tiles per pixel. */
const AREA_PER_LOT = 36000   // ≈ 220 × 165 average tile

export default function LotsSection() {
  const [filter, setFilter] = useState<FilterValue>('all')
  const { data } = useOpenLots(22)
  const lots = data?.lots ?? []
  const totals = data?.totals
  const filtered = filter === 'all' ? lots : lots.filter(l => l.category === filter)

  const totalOpen = totals?.all ?? 0
  const moreCount = Math.max(totalOpen - filtered.length, 0)

  // ─── treemap layout ───
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [containerW, setContainerW] = useState(0)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const update = () => {
      const w = el.getBoundingClientRect().width
      setContainerW(w)
    }
    update()
    const ro = new ResizeObserver(() => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(update, 80)
    })
    ro.observe(el)
    return () => {
      ro.disconnect()
      if (timer) clearTimeout(timer)
    }
  }, [])

  const layout = useMemo(() => {
    if (containerW <= 0 || filtered.length === 0) {
      return { tiles: [] as TreemapTile[], height: 0 }
    }
    // pick a height so the box has roughly AREA_PER_LOT × N total area,
    // then floor at 600 and ceiling at 1400 so very small / very large
    // counts don't produce silly tall boxes.
    const target = filtered.length * AREA_PER_LOT
    const heightRaw = target / containerW
    const height = Math.min(1400, Math.max(600, Math.round(heightRaw)))

    const tiles = squarifyWithFloor(
      { x: 0, y: 0, w: containerW, h: height },
      filtered.map(l => ({ id: l.jobId, weight: l.price })),
      18000, // min area
    )
    return { tiles, height }
  }, [containerW, filtered])

  return (
    <section className="lots-section" id="floor">
      <div className="lots-head">
        <div>
          <div className="num">— section iii · the rest of the floor —</div>
          <h2><em>{moreCount.toLocaleString('en-US')}</em> more lots, open.</h2>
          <div className="filter" role="tablist" aria-label="lot categories">
            {(Object.keys(FILTER_LABELS) as FilterValue[]).map(v => {
              const count = v === 'all'
                ? (totals?.all ?? 0)
                : (totals ? totals[v] : 0)
              const on = filter === v
              return (
                <span
                  key={v}
                  role="tab"
                  aria-selected={on}
                  tabIndex={0}
                  className={on ? 'on' : ''}
                  onClick={() => setFilter(v)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setFilter(v) } }}
                >
                  {FILTER_LABELS[v]} ({count})
                </span>
              )
            })}
          </div>
        </div>
        <div className="meta">
          <strong>{totalOpen}</strong> open ·{' '}
          <em>+{data?.postedLastHour ?? 0} in last hour</em><br />
          median ticket <strong>{data?.medianUsdc.toFixed(2) ?? '—'} USDC</strong> ·{' '}
          fill rate {((data?.fillRate ?? 0) * 100).toFixed(1)}%<br />
          accepting bids · <em>refreshed every block</em>
        </div>
      </div>

      <div
        className="lots"
        ref={containerRef}
        style={{ height: layout.height ? `${layout.height}px` : undefined }}
      >
        {filtered.map((l, i) => {
          const tile = layout.tiles[i]
          if (!tile) return null
          return <Lot key={l.jobId} lot={l} tile={tile} />
        })}
      </div>
    </section>
  )
}
