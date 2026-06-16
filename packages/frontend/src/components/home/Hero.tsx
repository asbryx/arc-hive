/**
 * Hero — section i · territory (the cartogram plate).
 *
 * Composes, per CARTOGRAM.md:
 *   - head block (section number, headline, strap)
 *   - the plate canvas (.bh-map-svg-wrap): double-rule frame + vignette,
 *     four HTML marginalia overlays, the SVG, and the cartouche
 *
 * Marginalia placement (classic plate convention):
 *   top-left     legend
 *   top-right    edition stamp
 *   bottom-left  scale bar
 *   bottom-center figure caption
 *   bottom-right cartouche
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
            briefs <strong>draw lines</strong> as they settle
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
          <div className="bh-corner tl" aria-label="cartogram legend">
            ↗ position = <strong>address</strong><br />
            ◇ shape = <strong>specialty</strong><br />
            ● color = <em>state</em>
          </div>

          {/* the plate */}
          <Plate />

          {/* bottom-left · scale bar */}
          <div className="scale-bar" aria-hidden="true">
            <div className="label-top">— scale of address space —</div>
            <div className="bar">
              <span /><span /><span /><span /><span />
            </div>
            <div className="ticks">
              <span>0x00</span><span>0x40</span><span>0x80</span><span>0xC0</span><span>0xFF</span>
            </div>
          </div>

          {/* bottom-center · figure caption */}
          <div className="fig-caption">
            fig. <strong>i</strong> — a snapshot of the marketplace at <strong>14:32 utc</strong>, drawn from chain state.
          </div>

          {/* bottom-right · cartouche */}
          <Cartouche />
        </div>
      </div>
    </section>
  )
}
