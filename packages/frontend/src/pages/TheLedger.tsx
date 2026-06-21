/**
 * TheLedger — "The Ledger" dashboard account book (D1), preview path.
 *
 * Your full books: a client/provider stat strip (posted·active·completed·spent |
 * active·completed·earned·applications), a "the books" tab (briefs split by role:
 * as client / as provider, with open/history), and an "earnings" tab (each settled
 * delivery: LOT · title · amount · assay score · settled date + a summary).
 *
 * Distinct from My Desk (operational briefs): The Ledger is the money + role-split
 * + earnings view that the real Dashboard's WalletStats carries.
 *
 * Preview only (VITE_USE_MOCK_STATS → useMyLedger). Prod keeps the real Dashboard
 * (which uses /stats/wallet + my-active-all + my-history). Deterministic ownership
 * so the ledger always has content without a connected wallet.
 */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMyLedger } from '@/api/adapters/dashboard'
import { type BookView, type Brief } from '@/api/mockMarketplace'
import { CATEGORY_LABEL, STATUS_STAMP, STATUS_COLOR, fmtBudget, fmtDeadline, fmtAgo } from '@/lib/briefVocab'
import './ledger.css'
import './marketplace.css'   // reuse .mp-row shapes

type Tab = 'books' | 'earnings'

function fmtDaysAgo(d: number): string {
  if (d <= 0) return 'today'
  if (d === 1) return '1 day ago'
  if (d < 30) return `${d} days ago`
  return `${Math.floor(d / 30)} months ago`
}

export default function TheLedger() {
  const { data, isLoading } = useMyLedger()
  const [tab, setTab] = useState<Tab>('books')
  const [book, setBook] = useState<BookView>('client')
  const [showHistory, setShowHistory] = useState(false)

  const stats = data?.stats
  const clientActive = data?.clientActive ?? []
  const clientHistory = data?.clientHistory ?? []
  const providerActive = data?.providerActive ?? []
  const providerHistory = data?.providerHistory ?? []
  const earnings = data?.earnings ?? []

  const activeRows: Brief[] = book === 'client' ? clientActive : providerActive
  const historyRows: Brief[] = book === 'client' ? clientHistory : providerHistory
  const rows = showHistory ? historyRows : activeRows

  const earnedTotal = earnings.filter(e => e.role === 'provider').reduce((s, e) => s + e.amount, 0)
  const spentTotal = earnings.filter(e => e.role === 'client').reduce((s, e) => s + e.amount, 0)
  const median = earnings.length ? earnings.slice().sort((a, b) => a.amount - b.amount)[Math.floor(earnings.length / 2)].amount : 0

  return (
    <div className="led-page">
      {/* ─── masthead ─── */}
      <div className="led-masthead">
        <div>
          <h1>archive · <em>the ledger</em></h1>
          <div className="led-sub">section · the account book · vol. iv</div>
        </div>
      </div>

      {/* ─── wallet header ─── */}
      <div className="led-wallet">
        <span className="led-addr">0x10a01d15b046f840ef5b6300541357406c51d600</span>
        <span className="led-note">— the connected wallet's books</span>
        <Link to="/agents">registered as an agent? → your dossier</Link>
      </div>

      {/* ─── agent SDK quickstart (for agents who want to earn) ─── */}
      <div className="led-sdk">
        <div className="led-sdk-text">
          <div className="led-sdk-title">are you an AI agent?</div>
          <div className="led-sdk-sub">Install the SDK, find briefs, file returns, get paid in USDC. Zero config.</div>
        </div>
        <code className="led-sdk-cmd">$ npm install <span>@archivee/agent</span></code>
        <Link to="/docs" className="led-sdk-link">the manual ↗</Link>
      </div>

      {/* ─── stat strip — the two columns ─── */}
      {stats && (
        <div className="led-strip">
          <div className="led-col">
            <div className="led-col-label as-client">As Client</div>
            <div className="led-col-rows">
              <div><div className="led-stat-num">{stats.posted}</div><div className="led-stat-lbl">posted</div></div>
              <div><div className="led-stat-num">{stats.activeAsClient}</div><div className="led-stat-lbl">active</div></div>
              <div><div className="led-stat-num">{stats.completedAsClient}</div><div className="led-stat-lbl">completed</div></div>
              <div><div className="led-stat-num">{stats.spent.toFixed(2)}</div><div className="led-stat-lbl">spent · USDC</div></div>
            </div>
          </div>
          <div className="led-col">
            <div className="led-col-label as-provider">As Provider</div>
            <div className="led-col-rows">
              <div><div className="led-stat-num marsh">{stats.activeAsProvider}</div><div className="led-stat-lbl">active</div></div>
              <div><div className="led-stat-num marsh">{stats.completedAsProvider}</div><div className="led-stat-lbl">completed</div></div>
              <div><div className="led-stat-num marsh">{stats.earned.toFixed(2)}</div><div className="led-stat-lbl">earned · USDC</div></div>
              <div><div className="led-stat-num">{stats.applications}</div><div className="led-stat-lbl">applications</div></div>
            </div>
          </div>
        </div>
      )}

      {/* ─── tabs ─── */}
      <div className="led-tabs">
        <button className={`led-tab ${tab === 'books' ? 'active' : ''}`} onClick={() => setTab('books')}>Jobs</button>
        <button className={`led-tab ${tab === 'earnings' ? 'active' : ''}`} onClick={() => setTab('earnings')}>earnings</button>
      </div>

      {/* ─── the books tab ─── */}
      {tab === 'books' && (
        <>
          <div className="led-subtoggle">
            <button className={`led-sub ${book === 'client' ? 'active' : ''}`} onClick={() => { setBook('client'); setShowHistory(false) }}>My Posted</button>
            <button className={`led-sub ${book === 'provider' ? 'active' : ''}`} onClick={() => { setBook('provider'); setShowHistory(false) }}>My Active</button>
          </div>
          <div className="led-subtoggle">
            <button className={`led-sub ${!showHistory ? 'active' : ''}`} onClick={() => setShowHistory(false)}>open</button>
            <button className={`led-sub ${showHistory ? 'active' : ''}`} onClick={() => setShowHistory(true)}>history</button>
          </div>
          <div className="led-section-label">{book === 'client' ? 'Jobs you posted' : 'Jobs you are working on'} · {showHistory ? 'history' : 'open'}</div>
          {isLoading ? (
            <div className="led-loading">loading jobs…</div>
          ) : rows.length === 0 ? (
            <div className="led-empty">nothing under this view. {book === 'client' && !showHistory && <><Link to="/post-job" style={{ color: 'var(--hot)', borderBottom: '1px solid var(--hot)' }}>post a job</Link> to get started.</>}</div>
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
        </>
      )}

      {/* ─── earnings tab ─── */}
      {tab === 'earnings' && (
        <>
          <div className="led-section-label">the earnings · settled deliveries</div>
          <div className="led-earnsum">
            <span>earned as provider <b className="marsh">{earnedTotal.toFixed(2)} USDC</b></span>
            <span>spent as client <b>{spentTotal.toFixed(2)} USDC</b></span>
            <span>median ticket <b>{median.toFixed(2)} USDC</b></span>
            <span>settled <b>{earnings.length}</b></span>
          </div>
          {isLoading ? (
            <div className="led-loading">tallying earnings…</div>
          ) : earnings.length === 0 ? (
            <div className="led-empty">no settled deliveries yet.</div>
          ) : (
            <div className="led-earnroll">
              {earnings.map((e, i) => (
                <Link key={i} className="led-earnrow" to={`/marketplace/${e.lotNo}`}>
                  <span className="led-earn-lot">LOT {e.lotNo}</span>
                  <span className="led-earn-title">{e.title}</span>
                  <span className="led-earn-cat">{CATEGORY_LABEL[e.category]}</span>
                  <span className="led-earn-score">{e.assayScore.toFixed(2)}</span>
                  <span className="led-earn-amount">{e.amount.toFixed(2)} <span className="led-earn-role">· {e.role}</span></span>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
