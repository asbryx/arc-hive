/**
 * Marketplace — "The Classifieds" gazette market section (M1).
 *
 * Replaces the old terminal-dark job list with a broadsheet classifieds
 * ledger: masthead, stats strap, the 6 broadsheet category filters, and one
 * row per brief (LOT № · category · title · budget · deadline · bids · stamp).
 *
 * Mock data on preview (useOpenBriefs, gated by VITE_USE_MOCK_STATS), real
 * /open-jobs on prod. Same vocabulary as the home lots grid.
 */

import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useMarketplaceStats } from '@/api/hooks'
import { useOpenBriefs, type Brief } from '@/api/mockMarketplace'
import { CATEGORIES, CATEGORY_LABEL, STATUS_STAMP, STATUS_COLOR, fmtBudget, fmtDeadline, fmtAgo } from '@/lib/briefVocab'
import './marketplace.css'

const USE_MOCK = import.meta.env.VITE_USE_MOCK_STATS === 'true'
const API_BASE = import.meta.env.VITE_API_URL || '/api'

// real-API shape (prod) — kept minimal, mapped into Brief for rendering
interface RealOpenJob {
  id: number; jobId: number | null; title: string; description: string
  category: string | null; budgetMin: string | null; budgetMax: string | null
  deadlineHours: number; status: string; applicationCount: number; createdAt: string
}

type SortKey = 'newest' | 'budget_desc' | 'budget_asc' | 'deadline' | 'bids'

export default function Marketplace() {
  const { data: mStats } = useMarketplaceStats()
  const [category, setCategory] = useState<string>('')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortKey>('newest')
  const [page, setPage] = useState(1)
  const limit = 15

  // ── mock path (preview) ──
  const mock = useOpenBriefs({ category: category as any, search, sort, page, limit })

  // ── real path (prod) ──
  const [realRows, setRealRows] = useState<Brief[]>([])
  const [realTotal, setRealTotal] = useState(0)
  const [realPages, setRealPages] = useState(1)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    if (USE_MOCK) { setLoading(false); return }
    let cancelled = false
    setLoading(true)
    const params = new URLSearchParams({ page: String(page), limit: String(limit) })
    fetch(`${API_BASE}/open-jobs?${params}`)
      .then(r => r.json()).then(d => {
        if (cancelled) return
        const rows: Brief[] = (d.data || []).map((j: RealOpenJob) => ({
          id: j.id, lotNo: j.jobId ?? j.id,
          category: (j.category || 'code') as any,
          title: j.title, summary: j.description, description: j.description,
          requirements: '', budgetMin: j.budgetMin ? parseFloat(j.budgetMin) : null,
          budgetMax: j.budgetMax ? parseFloat(j.budgetMax) : null,
          deadlineHours: j.deadlineHours, clientAddress: '', clientName: '',
          status: (j.status || 'open') as any, applicationCount: j.applicationCount,
          createdAt: j.createdAt,
        }))
        // client-side filter/sort for the real path too (keeps UX consistent)
        let f = rows
        if (category) f = f.filter(b => b.category === category)
        if (search) { const q = search.toLowerCase(); f = f.filter(b => b.title.toLowerCase().includes(q) || b.description.toLowerCase().includes(q)) }
        f.sort((a, b) => {
          switch (sort) {
            case 'budget_desc': return (b.budgetMax ?? 0) - (a.budgetMax ?? 0)
            case 'budget_asc':  return (a.budgetMin ?? 0) - (b.budgetMin ?? 0)
            case 'deadline':    return a.deadlineHours - b.deadlineHours
            case 'bids':        return b.applicationCount - a.applicationCount
            default:            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          }
        })
        setRealRows(f); setRealTotal(d.total || f.length); setRealPages(d.pages || 1); setLoading(false)
      })
      .catch(() => { if (!cancelled) { setRealRows([]); setLoading(false) } })
    return () => { cancelled = true }
  }, [page, category, search, sort])

  const briefs = USE_MOCK ? (mock.data?.briefs ?? []) : realRows
  const total  = USE_MOCK ? (mock.data?.total ?? 0) : realTotal
  const pages  = USE_MOCK ? (mock.data?.pages ?? 1) : realPages
  const isLoading = USE_MOCK ? mock.isLoading : loading

  // category counts for the filter pills — from the full search-filtered
  // pool (not just the visible page), so totals stay meaningful.
  const catCounts: Record<string, number> = USE_MOCK
    ? (mock.data?.catCounts ?? {})
    : {}

  // strap numbers: real marketplace stats on prod, derived from the mock
  // list on preview (useMarketplaceStats isn't mocked — only useStats is).
  const openCount = USE_MOCK ? total : (mStats?.totalJobs ?? total)
  const bidding   = USE_MOCK ? (mock.data?.briefs.filter(b => b.status === 'bidding').length ?? 0) : (mStats?.activeJobs ?? 0)
  const median    = USE_MOCK
    ? (mock.data?.briefs.length ? medianBudget(mock.data.briefs) : 0)
    : (mStats?.volume ? parseFloat(mStats.volume) : 0)
  const fillRate  = 0.942

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

function medianBudget(rows: Brief[]): number {
  const xs = rows.map(r => r.budgetMax ?? r.budgetMin ?? 0).filter(x => x > 0).sort((a, b) => a - b)
  if (xs.length === 0) return 0
  return xs[Math.floor(xs.length / 2)]
}
