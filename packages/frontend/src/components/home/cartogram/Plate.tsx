/**
 * Plate — the cartogram SVG.
 *
 * Six layers, drawn back-to-front:
 *
 *   1. GRATICULE     — faint orthogonal grid at major hex boundaries.
 *                      Makes the substrate read as a coordinate space.
 *   2. REGIONS       — translucent convex hulls + caption per region
 *                      (BLOCK NW / NE / SE). Reads as territory.
 *   3. DUST          — density gradient biased to regions + line corridors.
 *   4. CLIENT HUB    — single concentric-square marker at SW.
 *   5. FLIGHT FLOW   — curved Bezier paths from hub to 7 agents. SETTLED
 *                      draws on once. EXECUTING/DELIVERING march.
 *   6. NAMED CAST    — 12 agents scaled by rank.
 *
 * Per _design-archive/01-style-A-cartogram.md (Minard / USGS / Stamen
 * lineage), composition mine.
 */

import { useMemo } from 'react'
import {
  buildPlateGeometry,
  CLIENT_HUB,
  DEMO_AGENTS,
  VIEWBOX,
  type DemoAgent,
  type FlightLine,
  type Region,
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

/** Compute the quadratic-Bezier path length numerically (good enough for dash). */
function bezierLength(from: { x: number; y: number }, ctrl: { x: number; y: number }, to: { x: number; y: number }): number {
  let len = 0
  let px = from.x, py = from.y
  for (let i = 1; i <= 24; i++) {
    const t = i / 24
    const mt = 1 - t
    const x = mt * mt * from.x + 2 * mt * t * ctrl.x + t * t * to.x
    const y = mt * mt * from.y + 2 * mt * t * ctrl.y + t * t * to.y
    len += Math.hypot(x - px, y - py)
    px = x; py = y
  }
  return len
}

/** Point along a quadratic Bezier at parameter t. */
function bezierAt(from: { x: number; y: number }, ctrl: { x: number; y: number }, to: { x: number; y: number }, t: number) {
  const mt = 1 - t
  return {
    x: mt * mt * from.x + 2 * mt * t * ctrl.x + t * t * to.x,
    y: mt * mt * from.y + 2 * mt * t * ctrl.y + t * t * to.y,
  }
}

/** Build the graticule path: vertical + horizontal hairlines every 200u. */
function graticulePath(): { v: string; h: string; vLabels: number[]; hLabels: number[] } {
  const xs: number[] = []
  const ys: number[] = []
  for (let x = 200; x <= 1500; x += 200) xs.push(x)
  for (let y = 200; y <= 660; y += 200) ys.push(y)
  const v = xs.map(x => `M ${x} 80 L ${x} 720`).join(' ')
  const h = ys.map(y => `M 80 ${y} L 1520 ${y}`).join(' ')
  return { v, h, vLabels: xs, hLabels: ys }
}

/** Build SVG path d="…" string for a region's convex hull. */
function regionPath(r: Region): string {
  if (r.hull.length === 0) return ''
  return r.hull.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') + ' Z'
}

export interface PlateProps {
  agents?: DemoAgent[]
}

export default function Plate({ agents }: PlateProps) {
  const cast = agents ?? DEMO_AGENTS
  const { slots, lines, regions, dust } = useMemo(
    () => buildPlateGeometry(cast.length),
    [cast.length],
  )
  const grid = useMemo(graticulePath, [])

  return (
    <svg
      viewBox={`0 0 ${VIEWBOX.w} ${VIEWBOX.h}`}
      preserveAspectRatio="xMidYMid meet"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Live cartogram of the marketplace"
      style={{ display: 'block', width: '100%', height: '100%' }}
    >
      <title>Cartogram — three address regions, twelve named agents, seven briefs in flight</title>

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

      {/* ─── 1. GRATICULE ─── */}
      <g style={{ color: 'var(--ink-3)' }} opacity="0.18">
        <path d={grid.v} stroke="currentColor" strokeWidth="0.6" fill="none" strokeDasharray="2 4" />
        <path d={grid.h} stroke="currentColor" strokeWidth="0.6" fill="none" strokeDasharray="2 4" />
      </g>

      {/* graticule ticks + hex labels along the top + left edges */}
      <g style={{ color: 'var(--ink-3)' }}>
        {grid.vLabels.map(x => (
          <text
            key={`vx-${x}`}
            x={x}
            y={114}
            fontFamily="Geist Mono"
            fontSize="9"
            fill="currentColor"
            textAnchor="middle"
            letterSpacing="0.10em"
            opacity="0.65"
          >
            {`0x${Math.floor((x / 1600) * 256).toString(16).padStart(2, '0').toUpperCase()}__`}
          </text>
        ))}
        {grid.hLabels.map(y => (
          <text
            key={`hy-${y}`}
            x={92}
            y={y + 3}
            fontFamily="Geist Mono"
            fontSize="9"
            fill="currentColor"
            textAnchor="start"
            letterSpacing="0.10em"
            opacity="0.65"
          >
            {`y${Math.floor((y / 800) * 256).toString(16).padStart(2, '0').toUpperCase()}`}
          </text>
        ))}
      </g>

      {/* ─── 2. REGIONS ─── */}
      <g>
        {regions.map((r, i) => {
          const d = regionPath(r)
          if (!d) return null
          return (
            <g key={i}>
              <path
                d={d}
                fill="var(--ink)"
                opacity="0.04"
                stroke="var(--ink-3)"
                strokeWidth="0.8"
                strokeDasharray="4 5"
              />
              <text
                x={r.centroid.x}
                y={r.centroid.y - 100}
                fontFamily="Geist Mono"
                fontSize="11"
                fill="var(--ink-2)"
                textAnchor="middle"
                letterSpacing="0.18em"
                fontWeight="500"
                opacity="0.65"
              >
                {r.label}
              </text>
              <text
                x={r.centroid.x}
                y={r.centroid.y - 86}
                fontFamily="Geist Mono"
                fontSize="9"
                fill="var(--ink-3)"
                textAnchor="middle"
                letterSpacing="0.10em"
                opacity="0.65"
              >
                {r.subLabel}
              </text>
            </g>
          )
        })}
      </g>

      {/* ─── 3. DUST ─── */}
      <g style={{ color: 'var(--ink-3)' }}>
        {dust.map((d, i) => (
          <circle key={i} cx={d.x} cy={d.y} r={d.r} fill="currentColor" opacity={d.opacity} />
        ))}
      </g>

      {/* ─── 4. CLIENT HUB ─── */}
      <g transform={`translate(${CLIENT_HUB.x}, ${CLIENT_HUB.y})`} style={{ color: 'var(--ink-2)' }}>
        <rect x="-9"  y="-9"  width="18" height="18" fill="var(--cream)" stroke="currentColor" strokeWidth="1.4" />
        <rect x="-15" y="-15" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="0.7" opacity="0.55" strokeDasharray="2 3" />
        <text
          x="0"
          y="44"
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
          y="58"
          fontFamily="Fraunces"
          fontSize="11"
          fill="var(--ink-3)"
          textAnchor="middle"
          fontStyle="italic"
        >
          briefs originate here
        </text>
      </g>

      {/* ─── 5. FLIGHT FLOW (curved Bezier paths) ─── */}
      <g>
        {lines.map((l, i) => {
          const stroke = PHASE_STROKE[l.phase]
          const len = bezierLength(l.from, l.ctrl, l.to)
          const isSettled    = l.phase === 'settled'
          const isExecuting  = l.phase === 'executing'
          const isDelivering = l.phase === 'delivering'
          const d = `M ${l.from.x} ${l.from.y} Q ${l.ctrl.x.toFixed(1)} ${l.ctrl.y.toFixed(1)} ${l.to.x} ${l.to.y}`
          return (
            <path
              key={i}
              d={d}
              fill="none"
              stroke={stroke.color}
              strokeWidth={isSettled ? 1.8 : 1.4}
              strokeLinecap="round"
              strokeDasharray={isSettled ? `${len}` : stroke.dash}
              strokeDashoffset={isSettled ? len : 0}
              markerEnd={isSettled ? 'url(#arr-marsh)' : undefined}
              opacity={isSettled ? 0.95 : 0.85}
            >
              {isSettled && (
                <animate attributeName="stroke-dashoffset" from={len} to={0} dur="1.6s" fill="freeze" />
              )}
              {isExecuting && (
                <animate attributeName="stroke-dashoffset" from="0" to="-20" dur="0.9s" repeatCount="indefinite" />
              )}
              {isDelivering && (
                <animate attributeName="stroke-dashoffset" from="0" to="-20" dur="1.4s" repeatCount="indefinite" />
              )}
            </path>
          )
        })}
      </g>

      {/* payload labels — horizontal, on the line near the agent end */}
      <g>
        {lines.map((l, i) => {
          const p = bezierAt(l.from, l.ctrl, l.to, 0.62)
          const stroke = PHASE_STROKE[l.phase]
          const w = l.payload.length * 6.4
          return (
            <g key={i} transform={`translate(${p.x}, ${p.y - 10})`}>
              <rect x={-w/2 - 4} y={-7} width={w + 8} height={14} fill="var(--cream)" opacity="0.95" />
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

      {/* ─── 6. NAMED CAST ─── */}
      <g>
        {cast.map((a, i) => {
          const slot = slots[i]
          if (!slot) return null
          const seed = sigilFor(a.addr)
          const accent = STATE_COLOR[a.phase]
          const isFlip = slot.anchor === 'end'
          const labelX = isFlip ? -22 : 22
          const isFocal = slot.rank === 1
          const haloR = slot.sigilRadius + 6
          return (
            <g key={a.addr} transform={`translate(${slot.x}, ${slot.y})`} style={{ color: accent }}>
              <circle cx="0" cy="0" r={haloR} fill="var(--cream)" opacity="0.9" />
              <g transform={`scale(${slot.sigilRadius / 12})`}>
                <use
                  href={`#sigil-base-${String(seed.shape).padStart(2, '0')}`}
                  transform={`rotate(${seed.orientation})`}
                />
              </g>
              <text
                x={labelX}
                y={isFocal ? 4 : 2}
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
                y={isFocal ? 24 : 18}
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
