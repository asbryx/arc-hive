/**
 * DashboardGlimpse — four-cell summary at the bottom of Home.
 *
 * Briefs posted today · briefs settled today · USDC moved today ·
 * score events. Reads useStats + useDailyStats(14) and derives the
 * today bucket from the most recent daily slice.
 */

import { Link } from 'react-router-dom'
import { useStats, useDailyStats } from '@/api/hooks'

function lastDay(arr?: { day: string; count: number }[]) {
  if (!arr || arr.length === 0) return null
  return arr[arr.length - 1]
}

function pctVs(arr?: { day: string; count: number }[]) {
  if (!arr || arr.length < 2) return null
  const today = arr[arr.length - 1].count
  const yest  = arr[arr.length - 2].count
  if (yest === 0) return null
  const pct = ((today - yest) / yest) * 100
  const s = pct >= 0 ? '+' : ''
  return `${s}${pct.toFixed(1)}%`
}

export default function DashboardGlimpse() {
  const { data: stats } = useStats()
  const { data: daily } = useDailyStats(14)

  const briefsToday    = lastDay(daily?.jobs)?.count ?? null
  const completedToday = lastDay(daily?.completed)?.count ?? null
  const volumeToday    = lastDay(daily?.volume)?.count ?? null
  const repEvents      = stats?.totalReputationEvents ?? null

  const briefsDelta    = pctVs(daily?.jobs)
  const settledRate    = briefsToday && completedToday != null
    ? `${((completedToday / Math.max(briefsToday, 1)) * 100).toFixed(1)}%`
    : null
  const volumeDelta    = pctVs(daily?.volume)

  return (
    <section className="glimpse" id="glimpse">
      <div className="num">— end of sheet · the day so far —</div>
      <h2>
        Today, <em>so far</em>.{' '}
        <Link
          to="/dashboard"
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 11,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--ink-3)',
            marginLeft: 16,
            verticalAlign: 'middle',
          }}
        >
          open dashboard →
        </Link>
      </h2>
      <div className="glimpse-grid">
        <div className="glimpse-cell">
          <div className="l">briefs posted, today</div>
          <div className="v">
            {briefsToday ?? '—'}
            {briefsDelta && <em>{briefsDelta}</em>}
          </div>
        </div>
        <div className="glimpse-cell">
          <div className="l">briefs settled, today</div>
          <div className="v">
            {completedToday ?? '—'}
            {settledRate && <em>{settledRate}</em>}
          </div>
        </div>
        <div className="glimpse-cell">
          <div className="l">USDC moved, today</div>
          <div className="v">
            ${(volumeToday ?? 0).toLocaleString('en-US')}
            {volumeDelta && <em>{volumeDelta}</em>}
          </div>
        </div>
        <div className="glimpse-cell">
          <div className="l">reputation events</div>
          <div className="v">
            {repEvents != null ? repEvents.toLocaleString('en-US') : '—'}
            <em>cumulative</em>
          </div>
        </div>
      </div>
    </section>
  )
}
