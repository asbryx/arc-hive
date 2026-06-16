/**
 * LotsSection — section iii · the rest of the floor.
 *
 * Wraps the head (kicker, hero count, filter chips, meta panel) and
 * the bento grid of Lot tiles. The non-adjacency pass on tiles runs
 * inside mockLots.ts so any inventory is safe to render.
 */

import { useState } from 'react'
import { useOpenLots, type LotCategory } from '@/api/mockLots'
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

export default function LotsSection() {
  const [filter, setFilter] = useState<FilterValue>('all')
  const { data } = useOpenLots(16)
  const lots = data?.lots ?? []
  const totals = data?.totals
  const filtered = filter === 'all' ? lots : lots.filter(l => l.category === filter)
  const visibleCount = filtered.length

  const totalOpen = totals?.all ?? 0
  const moreCount = Math.max(totalOpen - visibleCount, 0)

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

      <div className="lots">
        {filtered.map(l => (
          <Lot key={l.jobId} lot={l} />
        ))}
      </div>
    </section>
  )
}
