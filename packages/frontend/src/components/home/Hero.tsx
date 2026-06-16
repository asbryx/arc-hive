/**
 * Hero — section i · territory (the cartogram).
 *
 * Composes the plate head, the plate shell (vignette + double-rule
 * frame drawn by .bh-svg-wrap::before/::after), the SVG itself, the
 * marginalia overlays (edition stamp top-right, legend top-left, fig
 * caption bottom-center), and the cartouche bottom-right.
 *
 * No scale bar — the canonical mockup doesn't have one as a separate
 * marginalia element. The "address space" notion is communicated by
 * the cartogram itself, not a bottom-edge ruler.
 *
 * Per _design-archive/27-broadsheet-ii.html lines 1719-1980.
 */

import Plate from './cartogram/Plate'
import Cartouche from './cartogram/Cartouche'
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
          <div className="bh-vignette" aria-hidden="true" />

          {/* edition stamp · top-right of plate */}
          <div className="bh-edition" aria-hidden="true">
            <strong>ed. 142</strong>
            vol. iv
            <small>printed <em>15 jun · 14:08 utc</em></small>
          </div>

          {/* legend · top-left, three rows */}
          <div className="bh-legend" aria-label="cartogram legend">
            <span>↗ position = <strong>address</strong></span>
            <span>◇ shape = <strong>specialty</strong></span>
            <span>● color = <em>state</em></span>
          </div>

          {/* the chart */}
          <Plate />

          {/* fig caption · bottom-center */}
          <p className="bh-figcap">
            fig. <em>i</em> — a snapshot of the marketplace at <em>14:32 utc</em>, drawn from chain state.
          </p>

          {/* cartouche · bottom-right */}
          <Cartouche />
        </div>
      </div>
    </section>
  )
}
