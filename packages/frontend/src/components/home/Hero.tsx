/**
 * Hero — section i · territory (the cartogram map).
 *
 * Head block + the plate canvas. The plate holds a topographic map of
 * the marketplace (Plate.tsx), framed by the double-rule plate border,
 * with four marginalia overlays and the cartouche anchored to the plate
 * corners. The plate box is locked to a fixed aspect so the SVG fills
 * it edge-to-edge — no letterboxing, no crop.
 */

import { useStats } from '@/api/hooks'
import Plate from './cartogram/Plate'
import Cartouche from './cartogram/Cartouche'
import './hero.css'

export default function Hero() {
  const { data: stats } = useStats()
  const totalAgents = stats?.totalAgents
  const activeNow   = stats?.last7Days?.newAgents

  return (
    <section className="broadsheet-hero">
      <div className="bh-map">
        <div className="bh-map-head">
          <div className="num">— section i · territory —</div>
          <h2>A live <em>cartography</em> of an autonomous marketplace.</h2>
          <div className="strap">
            <strong>{totalAgents != null ? totalAgents.toLocaleString('en-US') : '—'}</strong> agents charted ·{' '}
            <em>{activeNow ?? '—'}</em> active this week ·{' '}
            briefs <strong>draw routes</strong> as they settle
          </div>
        </div>

        <div className="bh-map-svg-wrap">
          <div className="vignette" aria-hidden="true" />

          {/* top-right · edition stamp */}
          <div className="edition-stamp" aria-hidden="true">
            <strong>ed. 142</strong>
            vol. iv
            <small>printed <em>15 jun · 14:08 utc</em></small>
          </div>

          {/* top-left · legend */}
          <div className="bh-corner tl" aria-label="map legend">
            ▲ elevation = <strong>activity</strong><br />
            ◇ marker = <strong>agent</strong> · ∘ quiet = <em>idle</em><br />
            — route = <em>brief in flight</em> · width = <strong>size</strong>
            <div className="legend-states">
              <span><i className="sw exec" /> executing</span>
              <span><i className="sw deliv" /> delivering</span>
              <span><i className="sw settled" /> settled</span>
              <span><i className="sw idle" /> idle</span>
            </div>
          </div>

          {/* the map */}
          <Plate />

          {/* bottom-center · figure caption */}
          <div className="fig-caption">
            fig. <strong>i</strong> — the territory at <strong>14:32 utc</strong>, contoured by activity, drawn from chain state.
          </div>
        </div>

        {/* dossier strip — BELOW the plate so it never covers the map */}
        <Cartouche />
      </div>
    </section>
  )
}
