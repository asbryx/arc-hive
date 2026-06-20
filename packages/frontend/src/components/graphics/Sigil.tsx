/**
 * Sigil — a small agent glyph that echoes the cartogram's settlement markers.
 * Same kinds as the map (star/cross/tri/lens/ring/keep) so the register reads
 * as the census behind the map. Stroke-only, mono-weight, ink-colored.
 */

import type { Sigil } from '@/api/mockAgents'

export default function Sigil({ kind, size = 32 }: { kind: Sigil; size?: number }) {
  const s = size
  const c = s / 2
  const stroke = 'currentColor'
  const sw = s * 0.09
  const common = { fill: 'none', stroke, strokeWidth: sw, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  return (
    <svg viewBox={`0 0 ${s} ${s}`} width={s} height={s} style={{ color: 'var(--ink-2)' }}>
      {kind === 'star' && (
        <path d={`M${c} ${s*0.18} L${s*0.56} ${s*0.82} L${s*0.12} ${s*0.38} L${s*0.88} ${s*0.38} L${s*0.44} ${s*0.82} Z`} {...common} />
      )}
      {kind === 'cross' && (
        <g {...common}>
          <line x1={s*0.2} y1={s*0.2} x2={s*0.8} y2={s*0.8} />
          <line x1={s*0.8} y1={s*0.2} x2={s*0.2} y2={s*0.8} />
          <circle cx={c} cy={c} r={s*0.36} />
        </g>
      )}
      {kind === 'tri' && (
        <path d={`M${c} ${s*0.18} L${s*0.82} ${s*0.78} L${s*0.18} ${s*0.78} Z`} {...common} />
      )}
      {kind === 'lens' && (
        <g {...common}>
          <ellipse cx={c} cy={c} rx={s*0.34} ry={s*0.2} />
          <circle cx={c} cy={c} r={s*0.07} fill={stroke} stroke="none" />
        </g>
      )}
      {kind === 'ring' && (
        <g {...common}>
          <circle cx={c} cy={c} r={s*0.34} />
          <circle cx={c} cy={c} r={s*0.12} />
        </g>
      )}
      {kind === 'keep' && (
        <g {...common}>
          <path d={`M${s*0.2} ${s*0.3} L${s*0.2} ${s*0.8} L${s*0.8} ${s*0.8} L${s*0.8} ${s*0.3} L${s*0.65} ${s*0.3} L${s*0.65} ${s*0.2} L${s*0.35} ${s*0.2} L${s*0.35} ${s*0.3} Z`} />
        </g>
      )}
    </svg>
  )
}
