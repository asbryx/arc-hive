import { useMemo } from 'react'

export interface AgentPoint {
  id: string
  name?: string
  /** 0..1600 */
  x: number
  /** 0..800 */
  y: number
  phase?: 'hot' | 'ochre' | 'marsh' | 'slate' | 'idle'
  /** optional address sub-label */
  address?: string
}

export interface FlightLine {
  from: { x: number; y: number }
  to: { x: number; y: number }
  phase: 'settled' | 'executing' | 'delivering'
  label?: string
}

interface Props {
  agents?: AgentPoint[]
  flights?: FlightLine[]
  height?: number | string
  /** when true, dust field is rendered with fewer points (mobile) */
  dense?: boolean
  ariaLabel?: string
  ariaDesc?: string
}

const DEFAULT_AGENTS: AgentPoint[] = [
  { id: 'iris',   name: 'Iris',       x: 180,  y: 230, phase: 'hot',   address: '0x4C91…7d5a' },
  { id: 'lyra',   name: 'Lyra',       x: 1320, y: 250, phase: 'marsh', address: '0xA2F8…0e44' },
  { id: 'thorne', name: 'Thorne',     x: 980,  y: 360, phase: 'ochre', address: '0x71D2…f3c9' },
  { id: 'carter', name: 'Carter & Vale', x: 1180, y: 480, phase: 'marsh', address: '0xD4B7…8a01' },
  { id: 'verity', name: 'Verity',     x: 200,  y: 580, phase: 'slate', address: '0x09EC…b6f7' },
  { id: 'halden', name: 'Halden',     x: 760,  y: 540, phase: 'marsh', address: '0xF330…2192' },
]

const DEFAULT_FLIGHTS: FlightLine[] = [
  { from: { x: 180, y: 620 }, to: { x: 1080, y: 420 }, phase: 'settled',    label: 'settled' },
  { from: { x: 120, y: 280 }, to: { x: 700,  y: 340 }, phase: 'executing',  label: 'executing' },
  { from: { x: 100, y: 500 }, to: { x: 380,  y: 220 }, phase: 'delivering', label: 'delivering' },
]

const PHASE_COLOR: Record<NonNullable<AgentPoint['phase']>, string> = {
  hot:   'var(--hot)',
  ochre: 'var(--ochre)',
  marsh: 'var(--marsh)',
  slate: 'var(--slate)',
  idle:  'var(--ink-3)',
}

const FLIGHT_COLOR: Record<FlightLine['phase'], string> = {
  settled:    'var(--marsh)',
  executing:  'var(--hot)',
  delivering: 'var(--marsh)',
}

export default function Cartogram({
  agents = DEFAULT_AGENTS,
  flights = DEFAULT_FLIGHTS,
  height = 'min(70vh, 720px)',
  dense = true,
  ariaLabel = 'A cartographic plate of the live ArcHive marketplace',
  ariaDesc,
}: Props) {
  const dust = useMemo(() => buildDust(dense), [dense])

  const desc = ariaDesc ??
    `Showing ${agents.length} named agents and ${flights.length} active flight lines on a 1600×800 plate. ` +
    agents.map(a => `${a.name ?? a.id} ${a.phase ?? 'idle'}`).join('; ')

  return (
    <svg
      viewBox="0 0 1600 800"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={ariaLabel}
      style={{
        width: '100%',
        height,
        display: 'block',
        background: 'var(--cream)',
      }}
    >
      <title>{ariaLabel}</title>
      <desc>{desc}</desc>

      <defs>
        <marker id="arr-marsh" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0,0 L8,4 L0,8 z" fill="var(--marsh)" />
        </marker>
        <marker id="arr-hot" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0,0 L8,4 L0,8 z" fill="var(--hot)" />
        </marker>
        <symbol id="g-dust" viewBox="-2 -2 4 4" overflow="visible">
          <circle r="1" fill="currentColor" />
        </symbol>
      </defs>

      {/* dust field (top + bottom bands) */}
      <g style={{ color: 'var(--dust)' } as React.CSSProperties} opacity="0.5" aria-hidden="true">
        {dust.map((d, i) => (
          <use key={i} href="#g-dust" x={d.x} y={d.y} />
        ))}
      </g>

      {/* flight lines */}
      <g aria-hidden="true">
        {flights.map((fl, i) => {
          const len = Math.hypot(fl.to.x - fl.from.x, fl.to.y - fl.from.y)
          const color = FLIGHT_COLOR[fl.phase]
          const marker = fl.phase === 'executing' ? 'url(#arr-hot)' : 'url(#arr-marsh)'

          if (fl.phase === 'settled') {
            // draw-on once, then static
            return (
              <line
                key={i}
                x1={fl.from.x} y1={fl.from.y} x2={fl.to.x} y2={fl.to.y}
                stroke={color} strokeWidth="1.5"
                markerEnd={marker}
                strokeDasharray={`${len.toFixed(0)}`}
                strokeDashoffset={`${len.toFixed(0)}`}
              >
                <animate attributeName="stroke-dashoffset" from={len.toFixed(0)} to="0" dur="1.6s" fill="freeze" />
              </line>
            )
          }
          if (fl.phase === 'executing') {
            return (
              <line
                key={i}
                x1={fl.from.x} y1={fl.from.y} x2={fl.to.x} y2={fl.to.y}
                stroke={color} strokeWidth="1.5"
                markerEnd={marker}
                strokeDasharray="3 5"
              >
                <animate attributeName="stroke-dashoffset" from="0" to="-16" dur="1.5s" repeatCount="indefinite" />
              </line>
            )
          }
          // delivering
          return (
            <line
              key={i}
              x1={fl.from.x} y1={fl.from.y} x2={fl.to.x} y2={fl.to.y}
              stroke={color} strokeWidth="1.5"
              markerEnd={marker}
              strokeDasharray="8 5"
              opacity="0.85"
            >
              <animate attributeName="stroke-dashoffset" from="0" to="-26" dur="2.4s" repeatCount="indefinite" />
            </line>
          )
        })}
      </g>

      {/* flight labels */}
      <g fontFamily="var(--mono)" fontSize="11" letterSpacing="0.10em" textAnchor="middle" aria-hidden="true">
        {flights.map((fl, i) => {
          const mx = (fl.from.x + fl.to.x) / 2
          const my = (fl.from.y + fl.to.y) / 2 - 8
          return (
            <text key={i} x={mx} y={my} fill={FLIGHT_COLOR[fl.phase]} style={{ textTransform: 'uppercase', fontWeight: 500 }}>
              {fl.label ?? fl.phase}
            </text>
          )
        })}
      </g>

      {/* agent points */}
      <g>
        {agents.map(a => (
          <g key={a.id}>
            <circle cx={a.x} cy={a.y} r="4.5" fill={PHASE_COLOR[a.phase ?? 'idle']} />
            <circle cx={a.x} cy={a.y} r="9" fill="none" stroke={PHASE_COLOR[a.phase ?? 'idle']} strokeWidth="0.75" opacity="0.45" />
            {a.name && (
              <text
                x={a.x + 14} y={a.y + 4}
                fontFamily="var(--serif)"
                fontStyle="italic"
                fontSize="16"
                fill="var(--ink)"
                style={{ fontVariationSettings: "'wght' 350, 'opsz' 24, 'slnt' -10" }}
              >
                {a.name}
              </text>
            )}
            {a.address && (
              <text
                x={a.x + 14} y={a.y + 22}
                fontFamily="var(--mono)" fontSize="10"
                fill="var(--ink-3)"
                letterSpacing="0.06em"
              >
                {a.address}
              </text>
            )}
          </g>
        ))}
      </g>

      {/* edition stamp top-right (in-SVG so it scales with viewBox) */}
      <text x="1560" y="48" fontFamily="var(--mono)" fontSize="10" fill="var(--ink-3)" textAnchor="end" letterSpacing="0.16em" style={{ textTransform: 'uppercase' }}>
        plate i · ed. ii · cream substrate
      </text>
    </svg>
  )
}

function buildDust(dense: boolean): Array<{ x: number; y: number }> {
  const top: Array<{ x: number; y: number }> = []
  const bottom: Array<{ x: number; y: number }> = []
  const step = dense ? 80 : 140
  for (let x = 80; x <= 1560; x += step) {
    const yJitter = ((x * 13) % 50) - 24
    top.push({ x, y: 110 + yJitter })
    bottom.push({ x, y: 706 - yJitter })
  }
  return [...top, ...bottom]
}
