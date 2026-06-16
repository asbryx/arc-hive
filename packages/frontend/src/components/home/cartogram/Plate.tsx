/**
 * Plate — the cartogram, rebuilt as an actual topographic map.
 *
 * The idea (from _design-archive/CARTOGRAM.md): address space as a
 * TERRITORY. This builds that territory as a real map a stranger reads
 * at a glance:
 *
 *   · contour lines (marching squares over an activity-elevation field)
 *     fill the whole plate — the land has shape, busy clusters are
 *     highlands, idle space is lowland.
 *   · a bold coastline contour separates settled space from the void.
 *   · population stipple, denser on the highlands = the 1,284 agents.
 *   · a west-coast PORT where client briefs enter.
 *   · trade ROUTES from the port to active settlements — both ends are
 *     real, visible places (no dangling lines).
 *   · six named SETTLEMENTS crowning the highlands, each a survey marker
 *     + name + address + score.
 *
 * Fills its 1600×900 box edge-to-edge. Only the routes animate.
 */

import { useMemo } from 'react'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import {
  sampleField, contourAt, segsToPath,
} from '@/lib/contourField'
import {
  VB, PORT, ROUTES, SETTLEMENTS, buildPeaks, buildStipple,
  type Settlement, type Phase,
} from '@/lib/cartogramMap'

const PHASE_COLOR: Record<Phase, string> = {
  executing:  'var(--hot)',
  delivering: 'var(--marsh)',
  settled:    'var(--marsh)',
  idle:       'var(--slate)',
}

/* settlement glyphs — small survey markers */
function Glyph({ kind, capital }: { kind: Settlement['glyph']; capital?: boolean }) {
  const s = capital ? 1.5 : 1
  const sw = 1.6
  switch (kind) {
    case 'star':
      return (
        <g transform={`scale(${s})`}>
          <circle r="9" fill="var(--cream)" stroke="currentColor" strokeWidth={sw} />
          <circle r="3" fill="currentColor" />
          <line x1="0" y1="-13" x2="0" y2="-9" stroke="currentColor" strokeWidth={sw} />
          <line x1="0" y1="9" x2="0" y2="13" stroke="currentColor" strokeWidth={sw} />
          <line x1="-13" y1="0" x2="-9" y2="0" stroke="currentColor" strokeWidth={sw} />
          <line x1="9" y1="0" x2="13" y2="0" stroke="currentColor" strokeWidth={sw} />
        </g>
      )
    case 'cross':
      return (
        <g transform={`scale(${s})`}>
          <rect x="-7" y="-7" width="14" height="14" fill="var(--cream)" stroke="currentColor" strokeWidth={sw} />
          <line x1="-7" y1="-7" x2="7" y2="7" stroke="currentColor" strokeWidth={sw} />
          <line x1="7" y1="-7" x2="-7" y2="7" stroke="currentColor" strokeWidth={sw} />
        </g>
      )
    case 'tri':
      return (
        <g transform={`scale(${s})`}>
          <polygon points="0,-9 8,6 -8,6" fill="var(--cream)" stroke="currentColor" strokeWidth={sw} />
          <circle r="2.4" fill="currentColor" />
        </g>
      )
    case 'lens':
      return (
        <g transform={`scale(${s})`}>
          <path d="M -9 0 Q 0 -8 9 0 Q 0 8 -9 0 Z" fill="var(--cream)" stroke="currentColor" strokeWidth={sw} />
          <circle r="2" fill="currentColor" />
        </g>
      )
    case 'keep':
      return (
        <g transform={`scale(${s})`}>
          <polygon points="-8,-7 8,-7 8,5 0,9 -8,5" fill="var(--cream)" stroke="currentColor" strokeWidth={sw} />
        </g>
      )
    case 'ring':
    default:
      return (
        <g transform={`scale(${s})`}>
          <circle r="8" fill="var(--cream)" stroke="currentColor" strokeWidth={sw} />
          <circle r="3" fill="none" stroke="currentColor" strokeWidth={sw} />
        </g>
      )
  }
}

export default function Plate() {
  const reduced = useReducedMotion()

  const { contours, coastline, stipple } = useMemo(() => {
    const peaks = buildPeaks()
    const field = sampleField({ w: VB.w, h: VB.h, cell: 20, peaks })

    // contour levels as fractions of max elevation. The lowest is the
    // coastline; the rest are interior topo lines.
    const max = field.max
    const levels = [0.10, 0.20, 0.32, 0.46, 0.62, 0.80].map(f => f * max)
    const contours = levels.map(l => segsToPath(contourAt(field, l)))
    const coastline = segsToPath(contourAt(field, 0.10 * max))

    // population stipple, denser on high ground
    const keepClear = SETTLEMENTS.map(s => ({ x: s.x, y: s.y, r: 34 }))
    keepClear.push({ x: PORT.x, y: PORT.y, r: 40 })
    const stipple = buildStipple(300, (x, y) => Math.min(1, field.at(x, y) / max), keepClear)

    return { contours, coastline, stipple }
  }, [])

  return (
    <svg
      className="map-svg"
      viewBox={`0 0 ${VB.w} ${VB.h}`}
      preserveAspectRatio="xMidYMid meet"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Topographic map of the marketplace — elevation is agent activity, settlements are named agents, routes are briefs in flight"
    >
      <defs>
        <marker id="route-arrow" viewBox="-6 -6 12 12" refX="5" refY="0"
                markerWidth="7" markerHeight="7" orient="auto">
          <path d="M -6 -5 L 6 0 L -6 5 Z" fill="var(--marsh)" />
        </marker>
      </defs>

      {/* ─── 1. CONTOUR FIELD — the land itself ─── */}
      <g fill="none" stroke="var(--dust)" strokeWidth="1" opacity="0.55">
        {contours.map((d, i) => (
          <path key={i} d={d} strokeWidth={0.8 + i * 0.18} opacity={0.4 + i * 0.1} />
        ))}
      </g>

      {/* ─── 2. COASTLINE — bold contour, edge of settled space ─── */}
      <path d={coastline} fill="none" stroke="var(--ink-3)" strokeWidth="1.6" opacity="0.7" />

      {/* ─── 3. POPULATION STIPPLE — recessive background texture ───
          Faint dust-tan, small, low opacity. It must read as ambient
          terrain texture, NOT compete with the routes + settlements. */}
      <g fill="var(--dust)" opacity="0.5">
        {stipple.map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r={s.r * 0.8} opacity={0.35 + s.r * 0.12} />
        ))}
      </g>

      {/* ─── 4. TRADE ROUTES — port → every settlement ─── */}
      <g fill="none">
        {ROUTES.map((rt, i) => {
          const dest = SETTLEMENTS[rt.to]
          const color = PHASE_COLOR[rt.phase]
          const d = `M${PORT.x} ${PORT.y} Q${rt.cx} ${rt.cy} ${dest.x} ${dest.y}`
          const settled = rt.phase === 'settled'
          const idle = rt.phase === 'idle'
          const dash = settled ? undefined : idle ? '1 7' : rt.phase === 'executing' ? '3 5' : '9 6'
          return (
            <path
              key={i}
              d={d}
              stroke={color}
              strokeWidth={idle ? 1 : 2.2}
              strokeDasharray={dash}
              opacity={idle ? 0.38 : settled ? 1 : 0.92}
              markerEnd={settled ? 'url(#route-arrow)' : undefined}
            >
              {!reduced && !settled && !idle && (
                <animate attributeName="stroke-dashoffset"
                         from="0" to={rt.phase === 'executing' ? '-16' : '-30'}
                         dur={rt.phase === 'executing' ? '1.5s' : '2.4s'}
                         repeatCount="indefinite" />
              )}
            </path>
          )
        })}
      </g>

      {/* route payload labels — at route midpoint, horizontal, cream halo.
          idle routes carry no payload, so skip them. */}
      <g>
        {ROUTES.filter(rt => rt.payload).map((rt, i) => {
          const dest = SETTLEMENTS[rt.to]
          const mx = 0.25 * PORT.x + 0.5 * rt.cx + 0.25 * dest.x
          const my = 0.25 * PORT.y + 0.5 * rt.cy + 0.25 * dest.y
          const w = rt.payload.length * 6.0
          return (
            <g key={i} transform={`translate(${mx}, ${my})`}>
              <rect x={-w / 2 - 4} y={-8} width={w + 8} height={15} fill="var(--cream)" opacity="0.92" />
              <text x="0" y="3" fontFamily="Geist Mono" fontSize="10.5"
                    fill={PHASE_COLOR[rt.phase]} textAnchor="middle"
                    letterSpacing="0.06em" fontWeight="500">{rt.payload}</text>
            </g>
          )
        })}
      </g>

      {/* ─── 5. PORT — client gateway on the west coast ─── */}
      <g transform={`translate(${PORT.x}, ${PORT.y})`} style={{ color: 'var(--ink)' }}>
        <circle r="13" fill="var(--cream)" stroke="currentColor" strokeWidth="1.6" />
        <circle r="5" fill="currentColor" />
        <circle r="20" fill="none" stroke="currentColor" strokeWidth="0.8" strokeDasharray="2 4" opacity="0.5" />
        <text x="0" y="38" fontFamily="Geist Mono" fontSize="11" fill="var(--ink)"
              textAnchor="middle" letterSpacing="0.16em" fontWeight="500">CLIENT PORT</text>
        <text x="0" y="53" fontFamily="Fraunces" fontSize="12" fill="var(--ink-3)"
              textAnchor="middle" fontStyle="italic">briefs make landfall here</text>
      </g>

      {/* ─── 6. SETTLEMENTS — named agents on the highlands ─── */}
      {SETTLEMENTS.map(s => {
        const color = PHASE_COLOR[s.phase]
        const flip = s.anchor === 'end'
        const lx = flip ? -16 : 16
        const nameSize = s.capital ? 19 : 15
        return (
          <g key={s.addr} transform={`translate(${s.x}, ${s.y})`} style={{ color }}>
            {/* cream clearing so the settlement lifts off the stipple/contours */}
            <circle r={s.capital ? 22 : 15} fill="var(--cream)" opacity="0.78" />
            <Glyph kind={s.glyph} capital={s.capital} />
            {s.capital && (
              <text x={lx} y={-16} fontFamily="Geist Mono" fontSize="9" fill="var(--hot)"
                    textAnchor={s.anchor} letterSpacing="0.16em" fontWeight="500">CAPITAL · TOP OF FIELD</text>
            )}
            <text x={lx} y={s.capital ? 2 : 3} fontFamily="Fraunces" fontSize={nameSize}
                  fontWeight={s.capital ? 400 : 350} fill="var(--ink)" fontStyle="italic"
                  textAnchor={s.anchor} letterSpacing="-0.01em">{s.name}</text>
            <text x={lx} y={s.capital ? 22 : 20} fontFamily="Geist Mono" fontSize="10"
                  fill="var(--ink-3)" textAnchor={s.anchor} letterSpacing="0.06em">
              {s.addr} · {s.score.toFixed(2)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
