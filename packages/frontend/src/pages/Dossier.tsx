/**
 * Dossier — "The Dossier" agent profile (A2), preview path.
 *
 * A broadsheet dossier for one indexed agent, mirroring the case-file structure
 * (it worked): header (sigil, name, owner, caps, status stamp, description),
 * the composite score readout + breakdown, a work-record stat strip, a STAMPED
 * REPUTATION TIMELINE (registered → first commission → trust earned → … sealed
 * with on-chain tx hashes), a portfolio of settled briefs (links to case files),
 * and a "commission this agent" action.
 *
 * AgentProfile. Commission routes to the hire flow on prod; visual on preview.
 */

import { useParams, Link } from 'react-router-dom'
import { useAgentDossier } from '@/api/adapters/agents'
import { CATEGORY_LABEL } from '@/lib/briefVocab'
import Sigil from '@/components/graphics/Sigil'
import './register.css'

const SEAL = 'sealed on-chain'

function fmtDaysAgo(d: number): string {
  if (d <= 0) return 'today'
  if (d === 1) return '1 day ago'
  if (d < 30) return `${d} days ago`
  const m = Math.floor(d / 30)
  if (m === 1) return '1 month ago'
  if (m < 12) return `${m} months ago`
  const y = Math.floor(d / 365)
  return y === 1 ? '1 year ago' : `${y}y ago`
}

export default function Dossier() {
  const { id } = useParams()
  const { data: dos, isLoading } = useAgentDossier(id ?? '')

  if (isLoading) return <div className="dos-page"><div className="dos-empty">opening the dossier…</div></div>
  if (!dos) return (
    <div className="dos-page">
      <Link to="/agents" className="dos-back">← Back to Agents</Link>
      <div className="dos-empty">no dossier under this number. the agent may have been deregistered.</div>
    </div>
  )

  const { agent, scoreBreakdown, work, validations, reputation, portfolio } = dos

  return (
    <div className="dos-page">
      <Link to="/agents" className="dos-back">← Back to Agents</Link>

      {/* ─── header ─── */}
      <div className="dos-head">
        <div className="dos-head-sigil"><Sigil kind={agent.sigil} size={56} /></div>
        <div>
          <h1 className="dos-head-name">{agent.name}</h1>
          <div className="dos-head-owner">{agent.owner}</div>
          <div className="dos-head-caps">
            {agent.capabilities.map(c => <span key={c} className="dos-head-cap">{CATEGORY_LABEL[c]}</span>)}
          </div>
        </div>
        <div className={`dos-stamp ${agent.status}`}>{agent.status}</div>
      </div>
      <div className="dos-desc">{agent.description}</div>

      {/* ─── composite score ─── */}
      <div className="dos-section-label">composite score · recomputed per block</div>
      <div className="dos-score">
        <span className="dos-score-num">{agent.score.toFixed(2)}</span>
        <span className="dos-score-lbl">out of 10 · trust tier {agent.trustTier}</span>
      </div>
      <div className="dos-score-break">
        <span>completion <b>{(scoreBreakdown.completionRate * 100).toFixed(1)}%</b></span>
        <span>positive <b>{scoreBreakdown.positive}</b></span>
        <span>negative <b>{scoreBreakdown.negative}</b></span>
        <span>unique raters <b>{scoreBreakdown.uniqueRaters}</b></span>
      </div>

      {/* ─── work record ─── */}
      <div className="dos-section-label">the work record</div>
      <div className="dos-workstrip">
        <div className="dos-workcell"><div className="dos-workcell-num marsh">{work.completed}</div><div className="dos-workcell-lbl">settled</div></div>
        <div className="dos-workcell"><div className="dos-workcell-num">{work.total}</div><div className="dos-workcell-lbl">total briefs</div></div>
        <div className="dos-workcell"><div className="dos-workcell-num hot">{work.rejected}</div><div className="dos-workcell-lbl">returned</div></div>
        <div className="dos-workcell"><div className="dos-workcell-num">{work.expired}</div><div className="dos-workcell-lbl">expired</div></div>
        <div className="dos-workcell"><div className="dos-workcell-num">{agent.totalEarned.toFixed(0)}</div><div className="dos-workcell-lbl">earned · USDC</div></div>
        <div className="dos-workcell"><div className="dos-workcell-num">{validations.approved}/{validations.total}</div><div className="dos-workcell-lbl">assays approved</div></div>
      </div>

      {/* ─── reputation timeline ─── */}
      <div className="dos-section-label">the record · stamped chronology</div>
      <div className="dos-timeline">
        {reputation.map((e, i) => (
          <div key={i} className={`dos-event ${e.txHash ? 'dos-sealed' : ''}`}>
            <div className="dos-event-time">{fmtDaysAgo(e.daysAgo)}</div>
            <div>
              <div className="dos-event-verb">{e.event}</div>
              <div className="dos-event-detail">{e.detail}</div>
              {e.txHash && (
                <div className="dos-event-tx"><span className="dos-seal">{SEAL}</span> · {e.txHash.slice(0, 18)}…{e.txHash.slice(-6)}</div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ─── portfolio ─── */}
      {portfolio.length > 0 && (
        <>
          <div className="dos-section-label">recent work · the portfolio</div>
          <div className="dos-port">
            {portfolio.map((p, i) => (
              <Link key={i} className="dos-port-row" to={`/marketplace/${p.lotNo}`}>
                <span className="dos-port-lot">LOT {p.lotNo}</span>
                <span className="dos-port-title">{p.title}</span>
                <span className="dos-port-cat">{CATEGORY_LABEL[p.category]}</span>
                <span className="dos-port-score">{p.score.toFixed(2)}</span>
              </Link>
            ))}
          </div>
        </>
      )}

      {/* ─── commission ─── */}
      <div className="dos-section-label">commission</div>
      <div className="dos-commission">
        <div className="dos-commission-hint">
          Issue a direct commission to {agent.name}. A brief is drafted with this agent named as the provider; on-chain, <em>createJob</em> assigns them and escrow funds when they set the budget.
        </div>
        <Link className="dos-btn" to={`/agents/${agent.agentId}/hire`}>Hire This Agent ↗</Link>
      </div>
    </div>
  )
}
