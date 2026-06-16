/**
 * Cartouche — bottom-right info panel anchored to the cartogram plate.
 *
 * Features the most-recent settlement: the agent who just received
 * payment, with vitals (score, jobs, vol, latency) and a state ribbon.
 * Double-rule frame, no rounded corners, no shadow.
 *
 * Per _design-archive/components/cartouche-spec.md.
 */

import { useRecentSettlements } from '../../../api/mockSettlements'
import Sigil from '../../Sigil'

export default function Cartouche() {
  const { data } = useRecentSettlements(1)
  const ev = data?.[0]

  // While the mock resolves (microseconds), render a typographic skeleton
  // rather than nothing — the cartouche must always occupy this corner.
  if (!ev) {
    return (
      <aside className="cartouche" aria-label="cartouche">
        <div className="car-head">
          <span>cartouche · selected lot</span>
          <em>—</em>
        </div>
        <div className="car-body">
          <div className="car-name"><em>—</em> · loading</div>
          <div className="car-rows">
            <span className="l">score</span><span className="v">—</span>
            <span className="l">jobs</span><span className="v">—</span>
            <span className="l">vol</span><span className="v">—</span>
            <span className="l">latency</span><span className="v">—</span>
          </div>
        </div>
      </aside>
    )
  }

  // approximate the score-delta + per-agent vitals from the mock
  const scoreDelta = (ev.amountUsdc / 10).toFixed(2)
  const jobs       = 220 + Math.floor(ev.amountUsdc * 17)
  const fillPct    = (90 + (ev.amountUsdc % 9)).toFixed(1)
  const volUsdc    = (jobs * 122).toLocaleString('en-US')

  return (
    <aside className="cartouche" aria-label={`cartouche · ${ev.agentName}`}>
      <div className="car-head">
        <span>cartouche · selected lot</span>
        <em>delivering</em>
      </div>
      <div className="car-body">
        <Sigil address={ev.agentAddr} size={60} state="marsh" className="car-portrait" />
        <div
          className="car-name"
          dangerouslySetInnerHTML={{
            __html: ev.agentName.replace(/^([A-Z][a-z]+)/, '<em>$1</em>'),
          }}
        />
        <div className="car-addr">{ev.agentAddr} · code · audit</div>
        <div className="car-divider">— · — · —</div>
        <div className="car-rows">
          <span className="l">score</span>
          <span className="v"><em>{ev.agentScore.toFixed(2)}</em> <small>+{scoreDelta}</small></span>
          <span className="l">jobs</span>
          <span className="v">{jobs} <small>· {fillPct}%</small></span>
          <span className="l">vol</span>
          <span className="v">${volUsdc}</span>
          <span className="l">latency</span>
          <span className="v">µ 1.4s</span>
        </div>
        <div className="car-state delivering">
          ▶ delivering job-{ev.jobId} · +{ev.amountUsdc.toFixed(2)} USDC
        </div>
      </div>
    </aside>
  )
}
