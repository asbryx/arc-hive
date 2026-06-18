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
            <em>{activeNow ?? '—'}</em> active this week
          </div>
        </div>

        <div className="bh-map-svg-wrap">
          <div className="vignette" aria-hidden="true" />

          {/* top-right · edition stamp — the "edition" IS the block height,
              so the antique-chart framing is literally true: the chain
              reprints the territory every block. */}
          <div className="edition-stamp" aria-hidden="true">
            <strong>no. 4,210,886</strong>
            arc network territory survey
            <small>block <em>4,210,886 · 14:08 utc</em></small>
          </div>

          {/* the map */}
          <Plate />

          {/* bottom-center · figure caption */}
          <div className="fig-caption">
            fig. <strong>i</strong> — the territory at <strong>14:32 utc</strong>, contoured by activity, drawn from chain state.
          </div>
        </div>

        {/* legend — a marginalia strip BELOW the plate (off the terrain, as a
            printed plate keeps its key in the margin, not over the map). */}
        <div className="bh-legend-strip" aria-label="map legend">
          <span className="leg-item"><i className="sw exec" /> executing</span>
          <span className="leg-item"><i className="sw deliv" /> delivering</span>
          <span className="leg-item"><i className="sw settled" /> settled</span>
          <span className="leg-item"><i className="sw idle" /> idle</span>
        </div>

        {/* dossier strip — BELOW the plate so it never covers the map */}
        <Cartouche />
      </div>
    </section>
  )
}
