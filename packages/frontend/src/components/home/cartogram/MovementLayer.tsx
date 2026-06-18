/**
 * MovementLayer — the living "Keep and the Field" overlay.
 *
 * Renders, on top of the static terrain:
 *   · THE KEEP (east stronghold) + its garrison cluster (the resting population)
 *   · CLIENT PORT (west) — re-rendered here so it sits above terrain
 *   · ACTIVE agents on journeys: each travels muster→station→return, a trail
 *     line drawing behind it, labelled only while it's out.
 *
 * Only ~7 agents are labelled/moving at once and the set churns through motion,
 * so the plate stays calm. All travel is GPU <animateMotion>; React only
 * re-renders at stage boundaries. Reduced-motion → agents parked at sites.
 */

import { useAgentJourneys, STAGE_PHASE, type Journey } from './useAgentJourneys'
import { KEEP, GARRISON, arcControl, type AgentDef } from '@/lib/cartogramAgents'
import { PORT } from '@/lib/cartogramMap'

// concrete hex (SMIL/attributes don't reliably take CSS vars)
const COLOR = {
  hot: '#A52A1F',      // executing  (muster — out to work)
  marsh: '#5C7A3F',    // delivering/settled (station + return)
  slate: '#4A6068',    // idle
  dust: '#A89880',
  cream: '#FAF6E8',
  ink: '#1A1817',
  ink2: '#4A4642',
}

const STAGE_COLOR: Record<string, string> = {
  executing: COLOR.hot,
  delivering: COLOR.marsh,
  settled: COLOR.marsh,
}

/** the two endpoints + arc control for a journey leg. */
function legPath(j: Journey): { d: string; from: { x: number; y: number }; to: { x: number; y: number } } {
  const site = j.agent.site
  let from: { x: number; y: number }, to: { x: number; y: number }
  if (j.stage === 'muster') { from = KEEP; to = site }
  else if (j.stage === 'return') { from = site; to = KEEP }
  else { from = site; to = site } // station: parked at site
  const bend = j.stage === 'return' ? -0.14 : 0.14
  const { cx, cy } = arcControl(from, to, bend)
  const d = j.stage === 'station'
    ? `M${site.x} ${site.y}`
    : `M${from.x} ${from.y} Q${cx} ${cy} ${to.x} ${to.y}`
  return { d, from, to }
}

function Glyph({ kind }: { kind: AgentDef['glyph'] }) {
  const sw = 1.5
  switch (kind) {
    case 'star':
      return <><circle r="7" fill={COLOR.cream} stroke="currentColor" strokeWidth={sw} /><circle r="2.4" fill="currentColor" /></>
    case 'cross':
      return <rect x="-5.5" y="-5.5" width="11" height="11" fill={COLOR.cream} stroke="currentColor" strokeWidth={sw} transform="rotate(45)" />
    case 'tri':
      return <path d="M0 -7 L6 5 L-6 5 Z" fill={COLOR.cream} stroke="currentColor" strokeWidth={sw} strokeLinejoin="round" />
    case 'lens':
      return <><ellipse rx="7" ry="4.2" fill={COLOR.cream} stroke="currentColor" strokeWidth={sw} /><circle r="1.8" fill="currentColor" /></>
    case 'keep':
      return <rect x="-5" y="-5" width="10" height="10" fill={COLOR.cream} stroke="currentColor" strokeWidth={sw} />
    default:
      return <circle r="5.5" fill={COLOR.cream} stroke="currentColor" strokeWidth={sw} />
  }
}

function ActiveAgent({ j }: { j: Journey }) {
  const phase = STAGE_PHASE[j.stage]
  const color = STAGE_COLOR[phase]
  const { d, to } = legPath(j)
  const traveling = j.stage !== 'station'
  const dur = j.stage === 'station' ? 0 : 5.0
  const labelAnchor = to.x > 800 ? 'end' : 'start'
  const lx = labelAnchor === 'end' ? -12 : 12

  // motion: ease-in-out so the agent accelerates out of one anchor and eases
  // into the next. station = parked (no motion).
  const motion = traveling ? {
    dur: `${dur}s`, path: d, fill: 'freeze' as const,
    calcMode: 'spline' as const, keyTimes: '0;1', keySplines: '0.4 0 0.3 1',
  } : null

  return (
    <g key={j.legId}>
      {/* trail — the journey line, drawn BEHIND the agent as it travels
          (dashoffset reveal so the line follows the token, not precedes it). */}
      {traveling && (
        <path d={d} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round"
              opacity="0.55" pathLength={1} strokeDasharray="1 1"
              style={{ willChange: 'stroke-dashoffset' }}>
          <animate attributeName="stroke-dashoffset" from="1" to="0" dur={`${dur}s`}
                   calcMode="spline" keyTimes="0;1" keySplines="0.4 0 0.3 1" fill="freeze" />
        </path>
      )}

      {/* the agent token — travels along the leg (or parked at site) */}
      <g style={{ color }}>
        <g transform={`translate(${to.x}, ${to.y})`}>
          {/* fallback static position = leg end; animateMotion overrides while traveling */}
          {!traveling && (
            <>
              {/* working pulse at the site */}
              <circle r="9" fill="none" stroke={color} strokeWidth="1.2" opacity="0"
                      style={{ willChange: 'transform, opacity' }}>
                <animateTransform attributeName="transform" type="scale" from="0.5" to="2.6"
                                  dur="3.4s" calcMode="spline" keySplines="0.33 0 0.67 1" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0;0.4;0" keyTimes="0;0.25;1" dur="3.4s" repeatCount="indefinite" />
              </circle>
              <Glyph kind={j.agent.glyph} />
              <text x={lx} y="3" fontFamily="Fraunces" fontSize="14" fontStyle="italic"
                    fill={COLOR.ink} textAnchor={labelAnchor} letterSpacing="-0.01em"
                    stroke={COLOR.cream} strokeWidth="3.5" paintOrder="stroke" strokeLinejoin="round">
                {j.agent.name}
              </text>
              <text x={lx} y="18" fontFamily="Geist Mono" fontSize="9.5"
                    fill={COLOR.ink2} textAnchor={labelAnchor} letterSpacing="0.04em"
                    stroke={COLOR.cream} strokeWidth="3" paintOrder="stroke" strokeLinejoin="round">
                {j.agent.cap} · {j.agent.score.toFixed(2)}
              </text>
            </>
          )}
        </g>

        {/* traveling token: a moving group with the glyph + a short trailing
            label that rides along. animateMotion drives it along the leg. */}
        {traveling && motion && (
          <g style={{ willChange: 'transform' }}>
            <Glyph kind={j.agent.glyph} />
            <text x={lx} y="3" fontFamily="Fraunces" fontSize="13" fontStyle="italic"
                  fill={COLOR.ink} textAnchor={labelAnchor} letterSpacing="-0.01em"
                  stroke={COLOR.cream} strokeWidth="3.5" paintOrder="stroke" strokeLinejoin="round">
              {j.agent.name}
            </text>
            <animateMotion {...motion} rotate="0" />
          </g>
        )}
      </g>
    </g>
  )
}

export default function MovementLayer({ reduced }: { reduced: boolean }) {
  const journeys = useAgentJourneys(!reduced)

  return (
    <g>
      {/* ─── garrison cluster around the Keep — the resting population ─── */}
      <g fill={COLOR.dust}>
        {GARRISON.map((g, i) => (
          <circle key={i} cx={g.x} cy={g.y} r={g.r} opacity={0.5 + g.r * 0.1} />
        ))}
      </g>

      {/* ─── THE KEEP — the stronghold the garrison defends ─── */}
      <g transform={`translate(${KEEP.x}, ${KEEP.y})`} style={{ color: COLOR.ink }}>
        <circle r="20" fill="none" stroke="currentColor" strokeWidth="0.8" strokeDasharray="2 4" opacity="0.45" />
        <rect x="-9" y="-9" width="18" height="18" fill={COLOR.cream} stroke="currentColor" strokeWidth="1.6" transform="rotate(45)" />
        <rect x="-3.5" y="-3.5" width="7" height="7" fill="currentColor" transform="rotate(45)" />
        <text x="0" y="38" fontFamily="Geist Mono" fontSize="11" fill={COLOR.ink}
              textAnchor="middle" letterSpacing="0.16em" fontWeight="500">THE KEEP</text>
        <text x="0" y="53" fontFamily="Fraunces" fontSize="12" fill={COLOR.ink2}
              textAnchor="middle" fontStyle="italic">the garrison musters here</text>
      </g>

      {/* ─── active agents on their journeys ─── */}
      {journeys.map(j => <ActiveAgent key={j.slot} j={j} />)}

      {/* ─── CLIENT PORT — where briefs land (above terrain) ─── */}
      <g transform={`translate(${PORT.x}, ${PORT.y})`} style={{ color: COLOR.ink }}>
        <circle r="13" fill={COLOR.cream} stroke="currentColor" strokeWidth="1.6" />
        <circle r="5" fill="currentColor" />
        <circle r="20" fill="none" stroke="currentColor" strokeWidth="0.8" strokeDasharray="2 4" opacity="0.5" />
        <text x="0" y="38" fontFamily="Geist Mono" fontSize="11" fill={COLOR.ink}
              textAnchor="middle" letterSpacing="0.16em" fontWeight="500">CLIENT PORT</text>
        <text x="0" y="53" fontFamily="Fraunces" fontSize="12" fill={COLOR.ink2}
              textAnchor="middle" fontStyle="italic">briefs make landfall here</text>
      </g>
    </g>
  )
}
