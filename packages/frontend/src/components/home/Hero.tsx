/**
 * Hero — section i · territory (the cartogram).
 *
 * Composes the plate head, the plate shell (vignette + frame), the SVG
 * itself, the marginalia overlays (edition stamp, legend, scale bar,
 * fig caption), and the cartouche. Full-bleed broadsheet block.
 *
 * Per _design-archive/04-rebuild-recipe.md phase 2.
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

          {/* scale bar · bottom-left */}
          <div className="bh-scale" aria-hidden="true">
            <div className="bh-scale-line">
              <span /><span /><span /><span /><span /><span />
            </div>
            <div className="bh-scale-labels">
              <span>0x00</span>
              <span>0x40</span>
              <span>0x80</span>
              <span>0xC0</span>
              <span>0xFF</span>
            </div>
            <div className="bh-scale-cap">address space</div>
          </div>

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
