interface Props {
  data: number[]
  phase?: 'hot' | 'ochre' | 'marsh' | 'slate' | 'ink'
  width?: number
  height?: number
  filled?: boolean
}

const STROKE: Record<NonNullable<Props['phase']>, string> = {
  hot: 'var(--hot)',
  ochre: 'var(--ochre)',
  marsh: 'var(--marsh)',
  slate: 'var(--slate)',
  ink: 'var(--ink-2)',
}

/**
 * Tiny inline sparkline. Decorative — value should be conveyed in adjacent text.
 */
export default function Sparkline({ data, phase = 'ink', width = 84, height = 18, filled = false }: Props) {
  if (!data || data.length === 0) {
    return <svg width={width} height={height} aria-hidden="true" />
  }
  const max = Math.max(...data, 1)
  const min = Math.min(...data, 0)
  const range = max - min || 1
  const step = data.length > 1 ? width / (data.length - 1) : width

  const points = data.map((v, i) => {
    const x = i * step
    const y = height - ((v - min) / range) * (height - 2) - 1
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')

  const fillPath = filled
    ? `M0,${height} L${points.split(' ').join(' L')} L${width},${height} Z`
    : null

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" style={{ overflow: 'visible' }}>
      {fillPath && <path d={fillPath} fill={STROKE[phase]} opacity="0.12" />}
      <polyline points={points} fill="none" stroke={STROKE[phase]} strokeWidth="1.25" />
    </svg>
  )
}
