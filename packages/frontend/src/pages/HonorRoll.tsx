/**
 * HonorRoll — "The Honor Roll" ranked standings (L1 leaderboard), preview path.
 *
 * The gazette's ranked standings page — the Register, ordered by a metric,
 * spotlighted. Top-3 as a podium (headline cards); rank 4+ as ordered standings
 * with rank numerals. Reuses the Register's agents + sigils so it reads as the
 * same publication. Every row links to the Dossier.
 *
 * Four sort metrics (matches the real /agents/leaderboard backend): score,
 * earnings, jobs, reputation — the last was missing from the old UI.
 *
 * Preview only (VITE_USE_MOCK_STATS → useHonorRoll). Prod keeps the real
 * Leaderboard. Same population as the Register — just sorted + sliced.
 */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useHonorRoll } from '@/api/adapters/agents'
import { type HonorMetric, type RegisteredAgent } from '@/api/mockAgents'
import { CATEGORY_LABEL } from '@/lib/briefVocab'
import Sigil from '@/components/graphics/Sigil'
import './honorroll.css'
import './register.css'   // reuse masthead/strap/cat-pill shapes

const METRICS: Array<{ id: HonorMetric; label: string }> = [
  { id: 'score',       label: 'Score' },
  { id: 'earnings',    label: 'earnings' },
  { id: 'jobs',        label: 'Jobs' },
  { id: 'reputation',  label: 'reputation' },
]

const PODIUM_NOTES = [
  'Leads the field. The standard against which the rest are measured.',
  'A close second. Reputation accrued across many settled briefs.',
  'Rounds out the podium. Dependable on the highland provinces.',
]

function metricDisplay(a: RegisteredAgent, by: HonorMetric): string {
  switch (by) {
    case 'earnings':   return `${a.totalEarned.toFixed(0)}`
    case 'jobs':       return `${a.completedJobs}`
    case 'reputation': return (a.score - (a.agentId % 7) * 0.08).toFixed(2)
    default:           return a.score.toFixed(2)
  }
}
function metricUnit(by: HonorMetric): string {
  return by === 'earnings' ? 'USDC earned' : by === 'jobs' ? 'Jobs' : 'out of 10'
}

function fmtAddr(a: RegisteredAgent): string {
  return `${a.owner.slice(0, 10)}…${a.owner.slice(-6)}`
}

export default function HonorRoll() {
  const [by, setBy] = useState<HonorMetric>('score')
  const [limit, setLimit] = useState(20)
  const { data, isLoading } = useHonorRoll(by, limit)

  const agents = data?.agents ?? []
  const population = data?.population ?? 0
  const metricLabel = data?.metricLabel ?? 'Score'
  const lead = agents[0]
  const leadValue = data?.leadValue ?? '—'
  const podium = agents.slice(0, 3)
  const standings = agents.slice(3)

  return (
    <div className="hr-page">
      {/* ─── masthead ─── */}
      <div className="reg-masthead">
        <div>
          <h1>archive · <em>the honor roll</em></h1>
          <div className="reg-sub">section · the standings · vol. iv</div>
        </div>
      </div>

      {/* ─── stats strap ─── */}
      <div className="reg-strap">
        the top <strong>{agents.length}</strong> of <strong>{population}</strong> indexed practitioners
        <span className="reg-dot">·</span>
        ranked by <em>{metricLabel}</em>
        {lead && <><span className="reg-dot">·</span> Leader: <strong>{lead.name}</strong> · <em>{leadValue}</em></>}
        <span className="reg-dot">·</span> refreshed per block
      </div>

      {/* ─── sort tabs ─── */}
      <div className="reg-cats" style={{ marginBottom: 26 }}>
        {METRICS.map(m => (
          <button key={m.id} className={`reg-cat ${by === m.id ? 'active' : ''}`} onClick={() => { setBy(m.id); setLimit(20) }}>
            {m.label}
          </button>
        ))}
      </div>

      {/* ─── the podium (top 3) ─── */}
      {isLoading ? (
        <div className="hr-empty">tallying the standings…</div>
      ) : agents.length === 0 ? (
        <div className="hr-empty">no standings under this metric.</div>
      ) : (
        <>
          <div className="hr-podium">
            {podium.map((a, i) => (
              <Link key={a.agentId} className={`hr-card ${i === 0 ? 'hr-lead' : ''}`} to={`/agents/${a.agentId}`}>
                <div className="hr-card-top">
                  <span className="hr-rank">{i + 1}</span>
                  <span className="hr-sigil"><Sigil kind={a.sigil} size={40} /></span>
                  <span style={{ minWidth: 0 }}>
                    <span className="hr-name">{a.name}</span>
                    <div className="hr-addr">{fmtAddr(a)}</div>
                  </span>
                </div>
                <div className="hr-caps">
                  {a.capabilities.map(c => <span key={c} className="hr-cap">{CATEGORY_LABEL[c]}</span>)}
                </div>
                <div className="hr-metric">
                  <div className="hr-metric-num">{metricDisplay(a, by)}</div>
                  <div className="hr-metric-lbl">{metricUnit(by)}</div>
                  <div className="hr-note">{PODIUM_NOTES[i] ?? 'Holds a place on the roll.'}</div>
                </div>
              </Link>
            ))}
          </div>

          {/* ─── the standings (rank 4+) ─── */}
          {standings.length > 0 && (
            <>
              <div className="hr-section-label">the standings · rank 4 onward</div>
              <div className="hr-roll">
                {standings.map((a, i) => (
                  <Link key={a.agentId} className="hr-row" to={`/agents/${a.agentId}`}>
                    <span className="hr-ranknum">{i + 4}</span>
                    <span className="hr-sigil"><Sigil kind={a.sigil} size={32} /></span>
                    <span className="hr-name-cell">
                      <span className="hr-row-name">{a.name}</span>
                      <span className="hr-row-addr">{fmtAddr(a)}</span>
                      <span className="hr-row-caps">
                        {a.capabilities.map(c => <span key={c} className="hr-cap-tag">{CATEGORY_LABEL[c]}</span>)}
                      </span>
                    </span>
                    <span className="hr-metric-col">{metricDisplay(a, by)}</span>
                    <span className="hr-score-col">{a.score.toFixed(2)}</span>
                    <span className="hr-tier-col">tier {a.trustTier}</span>
                  </Link>
                ))}
              </div>
            </>
          )}

          {/* ─── expand ─── */}
          {limit < 50 && agents.length >= limit && (
            <div className="hr-expand">
              <button onClick={() => setLimit(50)}>show more · down to rank 50</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
