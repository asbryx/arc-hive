/**
 * Plate — the cartogram SVG.
 *
 * Composition (deliberate, not "a bunch of layers"):
 *
 *   1. DENSITY GRADIENT — ambient dust, denser near the focal agent
 *      and along flight-line corridors, sparse in the dead zones.
 *   2. CLIENT HUB — one bigger ink square in the bottom-left; this is
 *      where briefs originate. No more "CLIENT-01..05" captions.
 *   3. FLIGHT LINES — fan out from the hub to seven of the named
 *      agents. SETTLED solid + arrow draws on once. EXECUTING short-
 *      dashed marches. DELIVERING long-dashed marches.
 *   4. PAYLOAD LABELS — small horizontal text NEAR THE AGENT end of
 *      each line. Never rotated. The eye reads: hub → line → agent →
 *      payload, in that order.
 *   5. NAMED CAST — 12 agents scaled by rank: focal #1 = 22px italic
 *      Fraunces with a 18u sigil, ranks 2-4 = 17px / 12u, 5-8 = 14px /
 *      10u, 9-12 = 13px / 9u. Hierarchy from a glance.
 *
 * Per _design-archive/01-style-A-cartogram.md (Minard / USGS / Stamen
 * lineage), but the placement geometry is mine and the prior
 * "everything floats in random space" execution is gone.
 */

import { useMemo } from 'react'
import {
  buildPlateGeometry,
  CLIENT_HUB,
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

function lineLength(l: FlightLine) {
  return Math.hypot(l.to.x - l.from.x, l.to.y - l.from.y)
}

/** label position for a payload — sits on the agent end of the line,
 *  pulled back ~30u toward the hub so it doesn't sit on the sigil. */
function payloadAnchor(l: FlightLine): { x: number; y: number; align: 'start' | 'end' } {
  const len = lineLength(l)
  const t = Math.max(0, (len - 60) / len) // 60u back from the agent end
  const x = l.from.x + (l.to.x - l.from.x) * t
  const y = l.from.y + (l.to.y - l.from.y) * t - 8 // slight lift above the line
  // align labels so they sit "into" the open field, not into the focal
  const align: 'start' | 'end' = l.to.x > 1000 ? 'end' : 'start'
  return { x, y, align }
}

export interface PlateProps {
  agents?: DemoAgent[]
}

export default function Plate({ agents }: PlateProps) {
  const cast = agents ?? DEMO_AGENTS
  const { slots, lines, dust } = useMemo(
    () => buildPlateGeometry(cast.length),
    [cast.length],
  )

  return (
    <svg
      viewBox={`0 0 ${VIEWBOX.w} ${VIEWBOX.h}`}
      preserveAspectRatio="xMidYMid meet"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Live cartogram of the marketplace"
      style={{ display: 'block', width: '100%', height: '100%' }}
    >
      <title>Live cartogram — twelve named agents, seven briefs in flight from one client hub</title>

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
      </defs>

      {/* ─── 1. DENSITY GRADIENT (dust) ─── */}
      <g style={{ color: 'var(--ink-3)' }}>
        {dust.map((d, i) => (
          <circle
            key={i}
            cx={d.x}
            cy={d.y}
            r={d.r}
            fill="currentColor"
            opacity={d.opacity}
          />
        ))}
      </g>

      {/* ─── 2. CLIENT HUB ─── */}
      <g transform={`translate(${CLIENT_HUB.x}, ${CLIENT_HUB.y})`} style={{ color: 'var(--ink-2)' }}>
        {/* concentric squares — reads as a real hub, not a single tick */}
        <rect x="-9"  y="-9"  width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <rect x="-14" y="-14" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="0.8" opacity="0.55" />
        <text
          x="0"
          y="42"
          fontFamily="Geist Mono"
          fontSize="10"
          fill="currentColor"
          textAnchor="middle"
          letterSpacing="0.16em"
          fontWeight="500"
        >
          CLIENT HUB
        </text>
        <text
          x="0"
          y="56"
          fontFamily="Fraunces"
          fontSize="11"
          fill="var(--ink-3)"
          textAnchor="middle"
          fontStyle="italic"
          letterSpacing="0.01em"
        >
          briefs originate here
        </text>
      </g>

      {/* ─── 3. FLIGHT LINES ─── */}
      <g>
        {lines.map((l, i) => {
          const stroke = PHASE_STROKE[l.phase]
          const len = lineLength(l)
          const isSettled    = l.phase === 'settled'
          const isExecuting  = l.phase === 'executing'
          const isDelivering = l.phase === 'delivering'
          return (
            <line
              key={i}
              x1={l.from.x}
              y1={l.from.y}
              x2={l.to.x}
              y2={l.to.y}
              stroke={stroke.color}
              strokeWidth={isSettled ? 1.8 : 1.4}
              strokeLinecap="round"
              strokeDasharray={isSettled ? `${len}` : stroke.dash}
              strokeDashoffset={isSettled ? len : 0}
              markerEnd={isSettled ? 'url(#arr-marsh)' : undefined}
              opacity={isSettled ? 0.95 : 0.85}
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
          )
        })}
      </g>

      {/* ─── 4. PAYLOAD LABELS — horizontal, near agent end, with cream halo ─── */}
      <g>
        {lines.map((l, i) => {
          const a = payloadAnchor(l)
          const stroke = PHASE_STROKE[l.phase]
          const w = l.payload.length * 6.4
          const halfW = w / 2
          const halfH = 8
          const offX = a.align === 'end' ? -halfW - 6 : halfW + 6
          return (
            <g key={i} transform={`translate(${a.x + offX - (a.align === 'end' ? -halfW : halfW)}, ${a.y})`}>
              <rect
                x={-halfW - 4}
                y={-halfH}
                width={w + 8}
                height={halfH * 2}
                fill="var(--cream)"
                opacity="0.94"
              />
              <text
                x="0"
                y="3"
                fontFamily="Geist Mono"
                fontSize={10}
                fill={stroke.color}
                textAnchor="middle"
                letterSpacing="0.10em"
                fontWeight="500"
              >
                {l.payload}
              </text>
            </g>
          )
        })}
      </g>

      {/* ─── 5. NAMED CAST — rank-driven scale ─── */}
      <g>
        {cast.map((a, i) => {
          const slot = slots[i]
          if (!slot) return null
          const seed = sigilFor(a.addr)
          const accent = STATE_COLOR[a.phase]
          const isFlip = slot.anchor === 'end'
          const labelX = isFlip ? -22 : 22
          const isFocal = slot.rank === 1
          // halo radius scales with sigil
          const haloR = slot.sigilRadius + 6
          return (
            <g key={a.addr} transform={`translate(${slot.x}, ${slot.y})`} style={{ color: accent }}>
              {/* cream halo so dust never muddies the read */}
              <circle cx="0" cy="0" r={haloR} fill="var(--cream)" opacity="0.88" />
              {/* sigil — for the focal, scaled up via a transform on the <use> */}
              <g transform={`scale(${slot.sigilRadius / 12})`}>
                <use
                  href={`#sigil-base-${String(seed.shape).padStart(2, '0')}`}
                  transform={`rotate(${seed.orientation})`}
                />
              </g>
              {/* focal gets a small score badge above the name */}
              {isFocal && (
                <text
                  x={labelX}
                  y={-14}
                  fontFamily="Geist Mono"
                  fontSize="10"
                  fill="var(--hot)"
                  fontWeight="500"
                  letterSpacing="0.16em"
                  textAnchor={slot.anchor}
                >
                  RANK 01 · TOP OF FIELD
                </text>
              )}
              <text
                x={labelX}
                y={isFocal ? 6 : 2}
                fontFamily="Fraunces"
                fontSize={slot.nameSize}
                fontWeight={isFocal ? '400' : '350'}
                fill="var(--ink)"
                fontStyle="italic"
                letterSpacing="-0.01em"
                textAnchor={slot.anchor}
              >
                {a.name}
              </text>
              <text
                x={labelX}
                y={isFocal ? 26 : 18}
                fontFamily="Geist Mono"
                fontSize={isFocal ? 11 : 10}
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
