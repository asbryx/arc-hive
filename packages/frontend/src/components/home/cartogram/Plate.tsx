/**
 * Plate — the cartogram SVG itself.
 *
 * 1600×800 viewBox. Cream paper, faint dust bands top + bottom,
 * three client markers far-left, three flight lines, six agent points
 * with labels placed by the corridor algorithm, inline payload labels
 * riding each line, the SETTLED line draws on once then freezes,
 * EXECUTING + DELIVERING lines march continuously.
 *
 * The plate frame, vignette, marginalia, and cartouche live OUTSIDE
 * this SVG (in Hero.tsx) so the SVG stays a pure data surface.
 *
 * Per _design-archive/components/cartogram-spec.md + 06 §A.
 */

import {
  placeAgents,
  DEMO_LINES,
  VIEWBOX,
  type Slot,
  type FlightLine,
} from '../../../lib/cartogramSlots'
import { sigilFor, colorFor } from '../../../lib/sigil'
import { useMemo } from 'react'

interface PlateAgent {
  name: string
  addr: string
  score: number
  /** which flight-line phase, or null if idle */
  phase: 'executing' | 'delivering' | 'settled' | 'idle'
}

interface PayloadLabel {
  /** midpoint x, y of the line */
  x: number
  y: number
  /** rotation in degrees so text rides the line */
  angle: number
  text: string
  color: string
  italic?: boolean
  fontSize?: number
}

const STATE_COLOR: Record<PlateAgent['phase'], string> = {
  executing:  'var(--hot)',
  delivering: 'var(--marsh)',
  settled:    'var(--marsh)',
  idle:       'var(--slate)',
}

const AGENTS: PlateAgent[] = [
  { name: 'Iris Voss',         addr: '0x88BD', score: 7.68, phase: 'delivering' },
  { name: 'Lyra Synthwright',  addr: '0xA8C3', score: 9.42, phase: 'executing' },
  { name: 'Thorne Ledger',     addr: '0x3B17', score: 8.91, phase: 'executing' },
  { name: 'Carter & Vale',     addr: '0x4C91', score: 8.71, phase: 'settled' },
  { name: 'Verity & Bell',     addr: '0x7E02', score: 7.94, phase: 'idle' },
  { name: 'Halden Court',      addr: '0x55AB', score: 7.81, phase: 'idle' },
]

function midpoint(line: FlightLine) {
  return { x: (line.from.x + line.to.x) / 2, y: (line.from.y + line.to.y) / 2 }
}
function angleDeg(line: FlightLine) {
  return (Math.atan2(line.to.y - line.from.y, line.to.x - line.from.x) * 180) / Math.PI
}

export interface PlateProps {
  /** when present, overrides the demo agents with live data */
  agents?: PlateAgent[]
}

export default function Plate({ agents }: PlateProps) {
  const all = agents ?? AGENTS

  // pair agents to slots via the corridor algorithm
  const slots = useMemo<Slot[]>(
    () => placeAgents(all.length, DEMO_LINES),
    [all.length],
  )

  // payload labels riding each flight line
  const payloads: PayloadLabel[] = DEMO_LINES.map((line, i) => {
    const m = midpoint(line)
    const a = angleDeg(line)
    if (i === 0) return { x: m.x, y: m.y, angle: a, text: 'JOB-2841 · +2.40 USDC', color: 'var(--marsh)', fontSize: 11 }
    if (i === 1) return { x: m.x, y: m.y, angle: a, text: 'JOB-2840 · 9/12 STEPS', color: 'var(--hot)',   fontSize: 11 }
    return { x: m.x, y: m.y, angle: a, text: 'JOB-2838 · DELIV.', color: 'var(--marsh)', italic: true, fontSize: 10 }
  })

  return (
    <svg
      viewBox={`0 0 ${VIEWBOX.w} ${VIEWBOX.h}`}
      preserveAspectRatio="xMidYMid meet"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Live cartogram of the marketplace"
      style={{ display: 'block', width: '100%', height: '100%' }}
    >
      <title>Live cartogram — six named agents, three briefs in flight</title>

      <defs>
        {/* arrowheads */}
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
        {/* tiny dust mark — a single ink-light dot */}
        <symbol id="cg-dust" viewBox="-3 -3 6 6">
          <circle cx="0" cy="0" r="1.2" fill="currentColor" />
        </symbol>
        {/* client tick — small open square */}
        <symbol id="cg-client" viewBox="-6 -6 12 12">
          <rect x="-4" y="-4" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="1" />
        </symbol>
      </defs>

      {/* dust bands — top */}
      <g style={{ color: 'var(--dust)' }} opacity="0.55">
        {[80, 160, 240, 320, 400, 490, 580, 680, 780, 880, 980, 1080, 1180, 1280, 1380, 1480, 1560].map((x, i) => (
          <use key={`dt-${x}`} href="#cg-dust" x={x} y={i % 2 === 0 ? 100 : 130} />
        ))}
      </g>
      {/* dust bands — bottom */}
      <g style={{ color: 'var(--dust)' }} opacity="0.55">
        {[80, 160, 240, 320, 400, 490, 580, 680, 780, 880, 980, 1080, 1180, 1280, 1380, 1480, 1560].map((x, i) => (
          <use key={`db-${x}`} href="#cg-dust" x={x} y={i % 2 === 0 ? 720 : 690} />
        ))}
      </g>

      {/* client markers */}
      <g style={{ color: 'var(--ink-3)' }} opacity="0.7">
        {DEMO_LINES.map((l, i) => (
          <use key={`client-${i}`} href="#cg-client" x={l.from.x} y={l.from.y} />
        ))}
      </g>

      {/* flight lines */}
      <g fill="none" strokeLinecap="square">
        {/* SETTLED · draws-on once, then freezes */}
        <line
          x1={DEMO_LINES[0].from.x}
          y1={DEMO_LINES[0].from.y}
          x2={DEMO_LINES[0].to.x}
          y2={DEMO_LINES[0].to.y}
          stroke="var(--marsh)"
          strokeWidth="1.5"
          markerEnd="url(#arr-marsh)"
          strokeDasharray="950"
          strokeDashoffset="0"
        >
          <animate attributeName="stroke-dashoffset" from="950" to="0" dur="1.6s" fill="freeze" />
        </line>
        {/* EXECUTING · marching ants */}
        <line
          x1={DEMO_LINES[1].from.x}
          y1={DEMO_LINES[1].from.y}
          x2={DEMO_LINES[1].to.x}
          y2={DEMO_LINES[1].to.y}
          stroke="var(--hot)"
          strokeWidth="1.5"
          strokeDasharray="3 5"
        >
          <animate attributeName="stroke-dashoffset" from="0" to="-16" dur="1.5s" repeatCount="indefinite" />
        </line>
        {/* DELIVERING · longer dashes, slower march */}
        <line
          x1={DEMO_LINES[2].from.x}
          y1={DEMO_LINES[2].from.y}
          x2={DEMO_LINES[2].to.x}
          y2={DEMO_LINES[2].to.y}
          stroke="var(--marsh)"
          strokeWidth="1.5"
          strokeDasharray="8 5"
          opacity="0.85"
        >
          <animate attributeName="stroke-dashoffset" from="0" to="-26" dur="2.2s" repeatCount="indefinite" />
        </line>
      </g>

      {/* inline payload labels, riding each line */}
      <g>
        {payloads.map((p, i) => (
          <g key={`pl-${i}`} transform={`translate(${p.x},${p.y}) rotate(${p.angle.toFixed(1)})`}>
            <rect x="-72" y="-9" width="144" height="14" fill="var(--cream)" opacity="0.92" />
            <text
              x="0"
              y="2"
              fontFamily="Geist Mono"
              fontSize={p.fontSize ?? 11}
              fill={p.color}
              textAnchor="middle"
              letterSpacing="0.10em"
              fontWeight="500"
              fontStyle={p.italic ? 'italic' : 'normal'}
            >
              {p.text}
            </text>
          </g>
        ))}
      </g>

      {/* agent points */}
      <g>
        {all.map((a, i) => {
          const slot = slots[i]
          const seed = sigilFor(a.addr)
          const accent = STATE_COLOR[a.phase]
          const isFlip = slot.anchor === 'end'
          const labelX = isFlip ? -18 : 18
          return (
            <g key={a.addr} transform={`translate(${slot.x}, ${slot.y})`} style={{ color: accent }}>
              <use href={`#sigil-base-${String(seed.shape).padStart(2, '0')}`} transform={`rotate(${seed.orientation})`} />
              <text
                x={labelX}
                y="4"
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
                y="22"
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
