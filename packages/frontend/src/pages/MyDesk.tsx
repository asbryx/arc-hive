/**
 * MyDesk — "My Desk" personal ledger (M4), preview path.
 *
 * The connected wallet's own briefs, split into four tabs by role/state:
 *   posted · bidding · in progress · settled
 * Each tab = gazette rows like the classifieds, filtered to "your" briefs.
 * Reuses the marketplace.css row styles so it reads as the same publication.
 *
 * Preview only (VITE_USE_MOCK_STATS → useMyDesk). Prod uses the real Dashboard
 * (filters /open-jobs by wallet). On preview the "ownership" is deterministic
 * so the desk always has content without a connected wallet.
 */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMyDesk, type Brief, type DeskTab } from '@/api/mockMarketplace'
import { CATEGORY_LABEL, STATUS_STAMP, STATUS_COLOR, fmtBudget, fmtDeadline, fmtAgo } from '@/lib/briefVocab'
import './marketplace.css'

const TABS: Array<{ id: DeskTab; label: string; hint: string }> = [
  { id: 'posted',      label: 'posted',       hint: 'briefs you filed' },
  { id: 'bidding',     label: 'bidding',      hint: 'briefs you bid on' },
  { id: 'in_progress', label: 'in progress',  hint: 'work underway' },
  { id: 'settled',     label: 'settled',      hint: 'the closed ledger' },
]

export default function MyDesk() {
  const { data, isLoading } = useMyDesk()
  const [tab, setTab] = useState<DeskTab>('posted')

  const KEY: Record<DeskTab, keyof NonNullable<typeof data>> = {
    posted: 'posted', bidding: 'bidding', in_progress: 'inProgress', settled: 'settled',
  }
  const rows: Brief[] = data ? (data[KEY[tab]] ?? []) : []
  const counts = data ? {
    posted: data.posted.length, bidding: data.bidding.length,
    in_progress: data.inProgress.length, settled: data.settled.length,
  } : { posted: 0, bidding: 0, in_progress: 0, settled: 0 }

  return (
    <div className="mp-page">
      {/* ─── masthead ─── */}
      <div className="mp-masthead">
        <div>
          <h1>archive · <em>my desk</em></h1>
          <div className="mp-sub">section · the personal ledger · vol. iv</div>
        </div>
        <Link to="/post-job" className="mp-post-link">post a brief ↗</Link>
      </div>

      {/* ─── strap ─── */}
      <div className="mp-strap">
        <strong>{counts.posted}</strong> posted
        <span className="mp-dot">·</span>
        <em>{counts.bidding}</em> bidding
        <span className="mp-dot">·</span>
        <strong>{counts.in_progress}</strong> in progress
        <span className="mp-dot">·</span>
        <strong>{counts.settled}</strong> settled
      </div>

      {/* ─── tabs ─── */}
      <div className="mp-cats" style={{ marginBottom: 22 }}>
        {TABS.map(t => (
          <button key={t.id} className={`mp-cat ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}<span className="mp-cat-count">{counts[t.id]}</span>
          </button>
        ))}
      </div>

      {/* ─── the ledger ─── */}
      {isLoading ? (
        <div className="mp-empty">opening your desk…</div>
      ) : rows.length === 0 ? (
        <div className="mp-empty">
          nothing under <em>{tab.replace('_', ' ')}</em> yet.
          {tab === 'posted' && <span> <Link to="/post-job" style={{ color: 'var(--hot)', borderBottom: '1px solid var(--hot)' }}>post a brief</Link> to fill this desk.</span>}
        </div>
      ) : (
        <div className="mp-ledger">
          {rows.map(b => (
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
    </div>
  )
}
