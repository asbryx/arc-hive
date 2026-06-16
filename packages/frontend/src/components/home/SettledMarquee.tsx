/**
 * SettledMarquee — what cleared the floor in the last hour.
 *
 * Single horizontal band between section i and section ii. Mono caps
 * head pinned left, scrolling list of last-20 settlements running
 * across. Doubled so the marquee wraps seamlessly. Reduced-motion
 * halts the scroll (handled in home.css).
 */

import { useRecentSettlements } from '../../api/mockSettlements'

function fmtAgo(seconds: number) {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  return `${Math.floor(seconds / 3600)}h`
}

export default function SettledMarquee() {
  const { data } = useRecentSettlements(20)
  const items = data ?? []

  return (
    <div className="bh-marquee" aria-label="settled in the last hour">
      <div className="bh-marquee-head">
        <strong>● settled</strong> · last hour
      </div>
      <div className="bh-marquee-track">
        {[...items, ...items].map((ev, i) => (
          <span key={`${ev.jobId}-${i}`} className="item">
            <span className="name">{ev.agentName}</span>
            <span className="amt">+{ev.amountUsdc.toFixed(2)} USDC</span>
            <span> · job-{ev.jobId} · </span>
            <em>{fmtAgo(ev.ageSeconds)} ago</em>
          </span>
        ))}
      </div>
    </div>
  )
}
