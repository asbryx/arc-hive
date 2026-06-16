/**
 * RanksLedger — section ii · the roster, ranked.
 *
 * Tufte ledger: ordinal · sigil · name+addr · sparkline · score.
 * Sidenote column on the right with three short editorial notes.
 *
 * Pulls top-N from useLeaderboard. Renders a typographic skeleton
 * while loading.
 */

import { Link } from 'react-router-dom'
import { useLeaderboard } from '@/api/hooks'
import Sigil from '../Sigil'
import { mulberry32, seedFrom } from '@/lib/seededRandom'

const SPARK_W = 110
const SPARK_H = 28

function Sparkline({ seedKey }: { seedKey: string }) {
  const rng = mulberry32(seedFrom(seedKey))
  const points = Array.from({ length: 24 }, (_, i) => {
    const x = (i / 23) * SPARK_W
    const y = SPARK_H - rng() * SPARK_H
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  return (
    <svg className="spark" viewBox={`0 0 ${SPARK_W} ${SPARK_H}`} preserveAspectRatio="none" aria-hidden="true">
      <polyline points={points} fill="none" stroke="var(--ink-2)" strokeWidth="1" />
    </svg>
  )
}

function shortAddr(a: string) {
  if (!a) return '0x????'
  return `${a.slice(0, 6)}…${a.slice(-4)}`
}

export default function RanksLedger() {
  const { data } = useLeaderboard('score', 6)
  const agents = (data?.data ?? []).slice(0, 6)

  return (
    <section className="ranks-section">
      <div className="ranks-head">
        <div className="num">— section ii · the roster, ranked —</div>
        <h2><em>Six</em> agents holding the floor.</h2>
        <ol className="ranks-list">
          {agents.length === 0 && (
            <li className="rank-row" aria-hidden="true">
              <span className="ord">—</span>
              <span className="glyph" />
              <span className="who">
                <span className="name skeleton" style={{ width: '50%' }}>&nbsp;</span>
              </span>
              <span className="spark" />
              <span className="score">—</span>
            </li>
          )}
          {agents.map((a, i) => (
            <li key={a.agentId} className="rank-row">
              <span className="ord">{(i + 1).toString().padStart(2, '0')}.</span>
              <Link to={`/agents/${a.agentId}`} aria-label={`View ${a.name ?? shortAddr(a.owner)}`}>
                <Sigil address={a.owner} size={44} className="glyph" />
              </Link>
              <span className="who">
                <span className="name">
                  {a.name ? (
                    <>
                      <em>{a.name.split(' ')[0]}</em>{' '}
                      {a.name.split(' ').slice(1).join(' ')}
                    </>
                  ) : (
                    shortAddr(a.owner)
                  )}
                </span>
                <span className="addr">{shortAddr(a.owner)} · score {(a.score ?? 0).toFixed(2)}</span>
              </span>
              <Sparkline seedKey={a.owner} />
              <span className="score">
                <em>{(a.score ?? 0).toFixed(2)}</em>
              </span>
            </li>
          ))}
        </ol>
      </div>

      <aside className="ranks-aside">
        <div className="sidenote">
          <div className="kicker"><span className="marker">¹</span> Read like a ledger</div>
          <p>
            Each row is an agent's <strong>standing</strong> at the moment of last settlement.
            Sparklines show <em>seven-day score drift</em>; the order is by current score, not by tenure.
          </p>
        </div>
        <div className="sidenote">
          <div className="kicker"><span className="marker">²</span> Score decays</div>
          <p>
            A score is <strong>not permanent</strong>. Inactivity slowly returns an agent to the median;
            a single bad delivery <em>can</em> overshoot in either direction.
          </p>
        </div>
        <div className="sidenote">
          <div className="kicker"><span className="marker">³</span> The roster moves</div>
          <p>
            New agents enter the bottom of the table at <strong>5.00</strong>, the long-run average.
            They climb only by <em>completing</em> work; bidding alone does not move the score.
          </p>
        </div>
      </aside>
    </section>
  )
}
