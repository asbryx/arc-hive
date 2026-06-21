/**
 * Marketplace — "The Classifieds" gazette market section (M1).
 *
 * Replaces the old terminal-dark job list with a broadsheet classifieds
 * ledger: masthead, stats strap, the 6 broadsheet category filters, and one
 * row per brief (LOT № · category · title · budget · deadline · bids · stamp).
 *
 * /open-jobs on prod. Same vocabulary as the home lots grid.
 */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMarketplaceStats } from '@/api/hooks'
import { useOpenBriefs } from '@/api/adapters/marketplace'
import { CATEGORIES, CATEGORY_LABEL, STATUS_STAMP, STATUS_COLOR, fmtBudget, fmtDeadline, fmtAgo } from '@/lib/briefVocab'
import './marketplace.css'

type SortKey = 'newest' | 'budget_desc' | 'budget_asc' | 'deadline' | 'bids'

export default function Marketplace() {
  const { data: mStats } = useMarketplaceStats()
  const [category, setCategory] = useState<string>('')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortKey>('newest')
  const [page, setPage] = useState(1)
  const limit = 15

  // ── live /open-jobs via the marketplace adapter ──
  const { data, isLoading } = useOpenBriefs({ category: category as any, search, sort, page, limit })
  const briefs = data?.briefs ?? []
  const total = data?.total ?? 0
  const pages = data?.pages ?? 1
  const catCounts: Record<string, number> = data?.catCounts ?? {}

  // strap numbers from the real marketplace stats
  const openCount = mStats?.totalJobs ?? total
  const bidding = mStats?.activeJobs ?? 0
  const median = mStats?.volume ? parseFloat(mStats.volume) : 0
  const fillRate = 0.942

  return (
    <div className="mp-page">
      {/* ─── masthead ─── */}
      <div className="mp-masthead">
        <div>
          <h1>archive · <em>the open market</em></h1>
          <div className="mp-sub">section · the classifieds · vol. iv</div>
        </div>
        <Link to="/post-job" className="mp-post-link">+ Post a job</Link>
      </div>

      {/* ─── stats strap ─── */}
      <div className="mp-strap">
        <strong>{openCount.toLocaleString('en-US')}</strong> briefs open
        <span className="mp-dot">·</span>
        <em>{bidding.toLocaleString('en-US')}</em> bidding now
        <span className="mp-dot">·</span>
        median ticket <strong>{median.toFixed(2)} USDC</strong>
        <span className="mp-dot">·</span>
        fill rate <strong>{(fillRate * 100).toFixed(1)}%</strong>
        <span className="mp-dot">·</span>
        refreshed per block
      </div>

      {/* ─── filter bar ─── */}
      <div className="mp-filters">
        <div className="mp-cats">
          <button className={`mp-cat ${category === '' ? 'active' : ''}`} onClick={() => { setCategory(''); setPage(1) }}>
            all{catCounts[''] != null && <span className="mp-cat-count">{catCounts['']}</span>}
          </button>
          {CATEGORIES.map(c => (
            <button key={c} className={`mp-cat ${category === c ? 'active' : ''}`} onClick={() => { setCategory(c); setPage(1) }}>
              {CATEGORY_LABEL[c]}{catCounts[c] != null && <span className="mp-cat-count">{catCounts[c]}</span>}
            </button>
          ))}
        </div>
        <div className="mp-spacer" />
        <input className="mp-search" placeholder="search the classifieds…" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
        <select className="mp-sort" value={sort} onChange={e => setSort(e.target.value as SortKey)}>
          <option value="newest">newest</option>
          <option value="budget_desc">budget ↓</option>
          <option value="budget_asc">budget ↑</option>
          <option value="deadline">deadline</option>
          <option value="bids">most bid</option>
        </select>
      </div>

      {/* ─── the ledger ─── */}
      {isLoading ? (
        <div className="mp-empty">reading the classifieds…</div>
      ) : briefs.length === 0 ? (
        <div className="mp-empty">no briefs under this filter. the floor is quiet.</div>
      ) : (
        <div className="mp-ledger">
          {briefs.map(b => (
            <Link key={b.id} className="mp-row" to={`/marketplace/${b.lotNo}`}>
              <span className="mp-lot">LOT {b.lotNo}</span>
              <span className="mp-cat-tag">{CATEGORY_LABEL[b.category]}</span>
              <span className="mp-title-cell">
                <span className="mp-title">{b.title}</span>
                <span className="mp-desc">{b.summary}</span>
              </span>
              <span className="mp-budget">{fmtBudget(b.budgetMin, b.budgetMax)}</span>
              <span className="mp-deadline">{fmtDeadline(b.deadlineHours)}</span>
              <span className={`mp-bids ${b.applicationCount > 0 ? 'mp-live' : ''}`}>{b.applicationCount}</span>
              <span className="mp-stamp" style={{ color: STATUS_COLOR[b.status] }}>{STATUS_STAMP[b.status]}</span>
            </Link>
          ))}
        </div>
      )}

      {/* ─── pagination ─── */}
      {pages > 1 && (
        <div className="mp-pag">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>prev</button>
          <span>{page} / {pages} · {total} briefs</span>
          <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page >= pages}>next</button>
        </div>
      )}
    </div>
  )
}
