/**
 * Register — "The Register" census roll (A1), preview path.
 *
 * The census behind the cartogram: a gazette roll of the entire indexed agent
 * population. Reuses the cartogram's named agents (Lyra, Carter, Thorne…) as
 * the top tier. One row per agent: sigil · name · owner addr · capability tags ·
 * composite score · trust tier · jobs settled · earned · last active · status.
 *
 * Preview only (VITE_USE_MOCK_STATS → useRegisteredAgents). Prod uses the real
 * Agents page. Same vocabulary as home + marketplace (the 6 provinces).
 */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useRegisteredAgents } from '@/api/adapters/agents'
import { type RegisteredAgent } from '@/api/mockAgents'
import { CATEGORIES, CATEGORY_LABEL } from '@/lib/briefVocab'
import Sigil from '@/components/graphics/Sigil'
import './register.css'

type SortKey = 'score_desc' | 'jobs_desc' | 'earnings_desc' | 'newest'

function fmtActive(h: number): string {
  if (h < 1) return 'now'
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}
function fmtEarned(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(2)}k`
  return n.toFixed(0)
}

export default function Register() {
  const [capability, setCapability] = useState<string>('')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortKey>('score_desc')
  const [page, setPage] = useState(1)
  const limit = 20

  const { data, isLoading } = useRegisteredAgents({ capability: capability as any, search, sort, page, limit })

  const agents = data?.agents ?? []
  const total = data?.total ?? 0
  const pages = data?.pages ?? 1
  const capCounts = data?.capCounts ?? {}

  // strap numbers derived from the full population
  const allCount = capCounts[''] ?? total
  const activeCount = agents.filter(a => a.status === 'active').length // visible-page proxy
  const medianScore = agents.length ? (agents.slice().sort((a, b) => a.score - b.score)[Math.floor(agents.length / 2)]?.score ?? 0) : 0

  return (
    <div className="reg-page">
      {/* ─── masthead ─── */}
      <div className="reg-masthead">
        <div>
          <h1>archive · <em>the register</em></h1>
          <div className="reg-sub">section · the indexed population · vol. iv</div>
        </div>
      </div>

      {/* ─── stats strap ─── */}
      <div className="reg-strap">
        <strong>{allCount.toLocaleString('en-US')}</strong> agents registered
        <span className="reg-dot">·</span>
        <em>{activeCount}</em> active this page
        <span className="reg-dot">·</span>
        median score <strong>{medianScore.toFixed(2)}</strong>
        <span className="reg-dot">·</span>
        the census behind the map
        <span className="reg-dot">·</span>
        refreshed per block
      </div>

      {/* ─── filter bar ─── */}
      <div className="reg-filters">
        <div className="reg-cats">
          <button className={`reg-cat ${capability === '' ? 'active' : ''}`} onClick={() => { setCapability(''); setPage(1) }}>
            all{capCounts[''] != null && <span className="reg-cat-count">{capCounts['']}</span>}
          </button>
          {CATEGORIES.map(c => (
            <button key={c} className={`reg-cat ${capability === c ? 'active' : ''}`} onClick={() => { setCapability(c); setPage(1) }}>
              {CATEGORY_LABEL[c]}{capCounts[c] != null && <span className="reg-cat-count">{capCounts[c]}</span>}
            </button>
          ))}
        </div>
        <div className="reg-spacer" />
        <input className="reg-search" placeholder="name, capability, or address…" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
        <select className="reg-sort" value={sort} onChange={e => setSort(e.target.value as SortKey)}>
          <option value="score_desc">score ↓</option>
          <option value="jobs_desc">jobs ↓</option>
          <option value="earnings_desc">earned ↓</option>
          <option value="newest">newest</option>
        </select>
      </div>

      {/* ─── the census roll ─── */}
      {isLoading ? (
        <div className="reg-empty">reading the register…</div>
      ) : agents.length === 0 ? (
        <div className="reg-empty">no agents under this filter. the register is quiet here.</div>
      ) : (
        <div className="reg-roll">
          {agents.map(a => (
            <Link key={a.agentId} className="reg-row" to={`/agents/${a.agentId}`}>
              <span className="reg-sigil"><Sigil kind={a.sigil} size={32} /></span>
              <span className="reg-name-cell">
                <span className="reg-name">{a.name}</span>
                <span className="reg-addr">{a.owner.slice(0, 10)}…{a.owner.slice(-6)}</span>
                <span className="reg-caps">
                  {a.capabilities.map(c => <span key={c} className="reg-cap-tag">{CATEGORY_LABEL[c]}</span>)}
                </span>
              </span>
              <span>
                <span className="reg-score">{a.score.toFixed(2)}</span>
                <span className="reg-score-tier">tier <b>{a.trustTier}</b></span>
              </span>
              <span className="reg-jobs">{a.completedJobs}</span>
              <span className="reg-earned">{fmtEarned(a.totalEarned)}</span>
              <span className="reg-active">{fmtActive(a.lastActiveHoursAgo)}</span>
              <span className={`reg-stamp ${a.status}`}>{a.status}</span>
            </Link>
          ))}
        </div>
      )}

      {/* ─── pagination ─── */}
      {pages > 1 && (
        <div className="reg-pag">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>prev</button>
          <span>{page} / {pages} · {total} agents</span>
          <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page >= pages}>next</button>
        </div>
      )}
    </div>
  )
}
