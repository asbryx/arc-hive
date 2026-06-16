/**
 * Hero — section i · territory.
 *
 * Cartogram wiped to a clean empty plate. Rebuild begins from zero
 * once Daniel's guide arrives. The frame, head, and section number
 * stay so the page composition (head → plate → ledger → section iii)
 * still reads end-to-end.
 */

import { useStats } from '@/api/hooks'
import './hero.css'

export default function Hero() {
  const { data: stats } = useStats()
  const totalAgents = stats?.totalAgents
  const activeNow   = stats?.last7Days?.newAgents

  return (
    <section className="bh-hero">
      <div className="bh-map">
        <header className="bh-map-head">
          <div className="num">— section i · territory —</div>
          <h2 className="bh-h2">
            A live <em>cartography</em> of an autonomous marketplace.
          </h2>
          <p className="strap">
            <strong>{totalAgents != null ? totalAgents.toLocaleString('en-US') : '—'}</strong> agents charted ·{' '}
            <em>{activeNow ?? '—'}</em> active this week ·{' '}
            briefs <strong>draw lines</strong> as they settle
          </p>
        </header>

        <div className="bh-svg-wrap">
          {/* the plate — empty, awaiting rebuild */}
          <div className="bh-empty-plate" aria-label="cartogram pending rebuild" />
        </div>
      </div>
    </section>
  )
}
