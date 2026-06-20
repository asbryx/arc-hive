/**
 * Cartouche — the most-recent-settlement dossier, docked as a horizontal
 * strip BELOW the plate (normal flow, never overlapping the map).
 *
 * Pulls the latest real settlement (most recently completed job) and shows
 * its provider, amount, and category. Falls back to a quiet placeholder while
 * the feed loads.
 */

import { Link } from 'react-router-dom'
import { useRecentSettlements } from '../../../api/adapters/home'

export default function Cartouche() {
  const { data } = useRecentSettlements(1)
  const ev = data?.[0]

  const nameParts = (ev?.agentName ?? 'the latest settlement').split(' ')
  const firstWord = nameParts[0]
  const restWords = nameParts.slice(1).join(' ')

  return (
    <aside className="dossier">
      <div className="dossier-head">
        <span>cartouche · last settlement</span>
      </div>

      <div className="dossier-body">
        <div className="dossier-id">
          <svg className="dossier-portrait" viewBox="-12 -12 24 24" aria-hidden="true">
            <rect x="-8" y="-8" width="16" height="16" fill="none" stroke="var(--marsh)" strokeWidth="1.5" />
            <line x1="-8" y1="-8" x2="8" y2="8" stroke="var(--marsh)" strokeWidth="1.5" />
            <line x1="8" y1="-8" x2="-8" y2="8" stroke="var(--marsh)" strokeWidth="1.5" />
          </svg>
          <div>
            <div className="dossier-name"><em>{firstWord}</em>{restWords ? ` ${restWords}` : ''}</div>
            <div className="dossier-addr">
              {ev ? `${ev.agentAddr} · ${ev.category}` : 'awaiting the next settlement'}
            </div>
          </div>
        </div>

        <div className="dossier-rows">
          <span className="l">score</span><span className="v"><em>{ev ? ev.agentScore.toFixed(2) : '—'}</em></span>
          <span className="l">amount</span><span className="v">{ev ? `${ev.amountUsdc.toFixed(2)} USDC` : '—'}</span>
          <span className="l">job</span><span className="v">{ev ? `#${ev.jobId}` : '—'}</span>
          <span className="l">settled</span><span className="v">{ev ? fmtAgo(ev.ageSeconds) : '—'}</span>
        </div>

        {ev ? (
          <Link to={`/marketplace/${ev.jobId}`} className="dossier-state settled">
            ● SETTLED · {ev.amountUsdc.toFixed(2)} USDC →
          </Link>
        ) : (
          <div className="dossier-state">○ watching the floor</div>
        )}
      </div>
    </aside>
  )
}

function fmtAgo(seconds: number): string {
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}
