/**
 * Plate — the cartogram SVG.
 *
 * Five layers, drawn in z-order:
 *   1. AMBIENT DUST — ~120 small ink-3 dots scattered across the active
 *      region. The "1,000 idle agents" of the design intent.
 *   2. CLIENT MARKERS — small open ink squares on the left + bottom edge
 *      where flight lines originate. Per cartogram-spec.
 *   3. FLIGHT LINES — 7 lines (2 settled, 3 executing, 2 delivering).
 *      SETTLED draws on once and freezes; EXECUTING + DELIVERING march
 *      continuously. Each line carries an inline payload label rotated
 *      to its angle, with a cream halo.
 *   4. SCALE BAR — a hash-marked address-space ruler in the bottom-left.
 *   5. NAMED CAST — 12 sigils + italic-Fraunces names + mono-caps
 *      addresses, placed by the deterministic constraint solver in
 *      lib/cartogramSlots.ts.
 *
 * Geometry, agent set, line endpoints, and dust positions are all pure
 * outputs of buildPlateGeometry() so re-renders never reflow.
 *
 * Per _design-archive/01-style-A-cartogram.md (intent) and
 *     _design-archive/components/cartogram-spec.md (marginalia).
 */

import { useMemo } from 'react'
import {
  buildPlateGeometry,
  CLIENT_MARKERS,
  DEMO_AGENTS,
  VIEWBOX,
  type DemoAgent,
  type FlightLine,
} from '../../../lib/cartogramSlots'
import { sigilFor } from '../../../lib/sigil'

const STATE_COLOR: Record<DemoAgent['phase'], string> = {
  executing:  'var(--hot)',
  delivering: 'var(--marsh)',
  settled:    'var(--marsh)',
  idle:       'var(--slate)',
}

const PHASE_STROKE: Record<FlightLine['phase'], { color: string; dash?: string }> = {
  settled:    { color: 'var(--marsh)' },
  executing:  { color: 'var(--hot)',   dash: '6 4' },
  delivering: { color: 'var(--marsh)', dash: '14 6' },
}

function midpoint(line: FlightLine) {
  return { x: (line.from.x + line.to.x) / 2, y: (line.from.y + line.to.y) / 2 }
}
function angleDeg(line: FlightLine) {
  // clamp angle to readable range so payload labels never read upside-down
  const raw = (Math.atan2(line.to.y - line.from.y, line.to.x - line.from.x) * 180) / Math.PI
  if (raw > 90)  return raw - 180
  if (raw < -90) return raw + 180
  return raw
}
function lineLength(line: FlightLine) {
  return Math.hypot(line.to.x - line.from.x, line.to.y - line.from.y)
}

export interface PlateProps {
  /** when present, overrides DEMO_AGENTS with live data */
  agents?: DemoAgent[]
}

export default function Plate({ agents }: PlateProps) {
  const cast = agents ?? DEMO_AGENTS
  const geom = useMemo(() => buildPlateGeometry(cast.length), [cast.length])
  const { slots, lines, dust } = geom

  return (
    <svg
      viewBox={`0 0 ${VIEWBOX.w} ${VIEWBOX.h}`}
      preserveAspectRatio="xMidYMid meet"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Live cartogram of the marketplace"
      style={{ display: 'block', width: '100%', height: '100%' }}
    >
      <title>Live cartogram — twelve named agents, seven briefs in flight</title>

      <defs>
        <marker
          id="arr-marsh"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="9"
          markerHeight="9"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--marsh)" />
        </marker>
        <symbol id="cg-dust" viewBox="-2 -2 4 4">
          <circle cx="0" cy="0" r="1" fill="currentColor" />
        </symbol>
        <symbol id="cg-client" viewBox="-6 -6 12 12">
          <rect x="-4" y="-4" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="1.2" />
        </symbol>
      </defs>

      {/* ─── 1. AMBIENT DUST ─── */}
      <g style={{ color: 'var(--ink-3)' }} opacity="0.5">
        {dust.map((d, i) => (
          <circle key={i} cx={d.x} cy={d.y} r={d.r} fill="currentColor" />
        ))}
      </g>

      {/* ─── 2. CLIENT MARKERS ─── */}
      <g style={{ color: 'var(--ink-2)' }}>
        {CLIENT_MARKERS.map((m, i) => (
          <g key={i} transform={`translate(${m.x}, ${m.y})`}>
            <use href="#cg-client" />
            <text
              x="0"
              y="22"
              fontFamily="Geist Mono"
              fontSize="9"
              fill="currentColor"
              textAnchor="middle"
              letterSpacing="0.10em"
              opacity="0.65"
            >
              CLIENT-{String(i + 1).padStart(2, '0')}
            </text>
          </g>
        ))}
      </g>

      {/* ─── 3. FLIGHT LINES ─── */}
      <g>
        {lines.map((l, i) => {
          const stroke = PHASE_STROKE[l.phase]
          const len = lineLength(l)
          const isSettled = l.phase === 'settled'
          const isExecuting = l.phase === 'executing'
          const isDelivering = l.phase === 'delivering'
          return (
            <g key={i}>
              <line
                x1={l.from.x}
                y1={l.from.y}
                x2={l.to.x}
                y2={l.to.y}
                stroke={stroke.color}
                strokeWidth={isSettled ? 2 : 1.6}
                strokeLinecap="round"
                strokeDasharray={
                  isSettled ? `${len}` : stroke.dash
                }
                strokeDashoffset={isSettled ? len : 0}
                markerEnd={isSettled ? 'url(#arr-marsh)' : undefined}
              >
                {isSettled && (
                  <animate
                    attributeName="stroke-dashoffset"
                    from={len}
                    to={0}
                    dur="1.6s"
                    fill="freeze"
                  />
                )}
                {isExecuting && (
                  <animate
                    attributeName="stroke-dashoffset"
                    from="0"
                    to="-20"
                    dur="0.9s"
                    repeatCount="indefinite"
                  />
                )}
                {isDelivering && (
                  <animate
                    attributeName="stroke-dashoffset"
                    from="0"
                    to="-20"
                    dur="1.4s"
                    repeatCount="indefinite"
                  />
                )}
              </line>
            </g>
          )
        })}
      </g>

      {/* ─── 3b. PAYLOAD LABELS — drawn AFTER lines so cream halos cover them ─── */}
      <g>
        {lines.map((l, i) => {
          const m = midpoint(l)
          const a = angleDeg(l)
          const stroke = PHASE_STROKE[l.phase]
          return (
            <g key={i} transform={`translate(${m.x}, ${m.y}) rotate(${a})`}>
              <rect
                x={-l.payload.length * 3.2}
                y={-7}
                width={l.payload.length * 6.4}
                height={14}
                fill="var(--cream)"
                opacity="0.92"
              />
              <text
                x="0"
                y="3"
                fontFamily="Geist Mono"
                fontSize={11}
                fill={stroke.color}
                textAnchor="middle"
                letterSpacing="0.10em"
                fontWeight="500"
                fontStyle={l.phase === 'delivering' ? 'italic' : 'normal'}
              >
                {l.payload}
              </text>
            </g>
          )
        })}
      </g>

      {/* ─── 4. SCALE BAR (bottom-left corner of active region) ─── */}
      <g transform="translate(120, 720)" style={{ color: 'var(--ink-2)' }}>
        <line x1="0" y1="0" x2="320" y2="0" stroke="currentColor" strokeWidth="1" />
        {[0, 80, 160, 240, 320].map((x, i) => (
          <g key={i} transform={`translate(${x}, 0)`}>
            <line x1="0" y1="-4" x2="0" y2="4" stroke="currentColor" strokeWidth="1" />
            <text
              x="0"
              y="18"
              fontFamily="Geist Mono"
              fontSize="9"
              fill="currentColor"
              textAnchor="middle"
              letterSpacing="0.08em"
            >
              {`0x${(i * 4).toString(16).padStart(2, '0').toUpperCase()}__`}
            </text>
          </g>
        ))}
        <text
          x="0"
          y="-10"
          fontFamily="Geist Mono"
          fontSize="9"
          fill="currentColor"
          letterSpacing="0.10em"
        >
          ADDRESS SPACE →
        </text>
      </g>

      {/* ─── 5. NAMED CAST ─── */}
      <g>
        {cast.map((a, i) => {
          const slot = slots[i]
          if (!slot) return null
          const seed = sigilFor(a.addr)
          const accent = STATE_COLOR[a.phase]
          const isFlip = slot.anchor === 'end'
          const labelX = isFlip ? -18 : 18
          return (
            <g key={a.addr} transform={`translate(${slot.x}, ${slot.y})`} style={{ color: accent }}>
              {/* faint cream halo behind sigil so dust never muddies the read */}
              <circle cx="0" cy="0" r="14" fill="var(--cream)" opacity="0.85" />
              <use
                href={`#sigil-base-${String(seed.shape).padStart(2, '0')}`}
                transform={`rotate(${seed.orientation})`}
              />
              <text
                x={labelX}
                y="2"
                fontFamily="Fraunces"
                fontSize="15"
                fontWeight="350"
                fill="var(--ink)"
                fontStyle="italic"
                letterSpacing="-0.005em"
                textAnchor={slot.anchor}
              >
                {a.name}
              </text>
              <text
                x={labelX}
                y="20"
                fontFamily="Geist Mono"
                fontSize="10"
                fill="var(--ink-3)"
                letterSpacing="0.06em"
                textAnchor={slot.anchor}
              >
                {a.addr} · {a.score.toFixed(2)}
              </text>
            </g>
          )
        })}
      </g>
    </svg>
  )
}
