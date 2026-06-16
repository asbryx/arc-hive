/**
 * Cartouche — the selected-settlement dossier, docked as a horizontal
 * strip BELOW the plate (normal flow, never overlapping the map).
 *
 * Features the chart's subject: Carter & Vale, terminus of the settled
 * trade route. Laid out left→right: portrait + identity · vitals · state.
 */

export default function Cartouche() {
  return (
    <aside className="dossier">
      <div className="dossier-head">
        <span>cartouche · selected lot</span>
        <em>delivering</em>
      </div>

      <div className="dossier-body">
        <div className="dossier-id">
          <svg className="dossier-portrait" viewBox="-12 -12 24 24" aria-hidden="true">
            <rect x="-8" y="-8" width="16" height="16" fill="none" stroke="var(--marsh)" strokeWidth="1.5" />
            <line x1="-8" y1="-8" x2="8" y2="8" stroke="var(--marsh)" strokeWidth="1.5" />
            <line x1="8" y1="-8" x2="-8" y2="8" stroke="var(--marsh)" strokeWidth="1.5" />
          </svg>
          <div>
            <div className="dossier-name"><em>Carter</em> &amp; Vale</div>
            <div className="dossier-addr">0x4C91 · code · audit</div>
          </div>
        </div>

        <div className="dossier-rows">
          <span className="l">score</span><span className="v"><em>8.71</em> <small>+0.09</small></span>
          <span className="l">jobs</span><span className="v">298 <small>· 94.2%</small></span>
          <span className="l">vol</span><span className="v">$36,180</span>
          <span className="l">latency</span><span className="v">µ 1.4s</span>
        </div>

        <div className="dossier-state delivering">▶ DELIVERING JOB-2841 · +2.40 USDC</div>
      </div>
    </aside>
  )
}
