interface Props {
  data: number[]
  width?: number
  height?: number
  color?: string
}

export default function SparklineArea({ data, width = 120, height = 28, color = '#4a9ead' }: Props) {
  if (!data || data.length < 2) return null

  const max = Math.max(...data, 1)
  const min = Math.min(...data)
  const range = max - min || 1
  const padding = 2
  const innerH = height - padding * 2
  const innerW = width - padding * 2

  // build points
  const points = data.map((val, i) => ({
    x: padding + (i / (data.length - 1)) * innerW,
    y: padding + innerH - ((val - min) / range) * innerH,
  }))

  // smooth curve via cardinal spline
  const linePath = points.length === 2
    ? `M${points[0].x},${points[0].y} L${points[1].x},${points[1].y}`
    : cardinalSpline(points, 0.3)

  // area = line + close along bottom
  const areaPath = `${linePath} L${points[points.length - 1].x},${height} L${points[0].x},${height} Z`

  const gradId = `sg-${Math.random().toString(36).slice(2, 8)}`

  return (
    <svg width={width} height={height} style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0.02} />
        </linearGradient>
      </defs>
      {/* area fill */}
      <path d={areaPath} fill={`url(#${gradId})`} />
      {/* line */}
      <path d={linePath} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      {/* end dot */}
      <circle
        cx={points[points.length - 1].x}
        cy={points[points.length - 1].y}
        r={2.5}
        fill={color}
      />
    </svg>
  )
}

function cardinalSpline(pts: { x: number; y: number }[], tension: number): string {
  const n = pts.length
  let d = `M${pts[0].x},${pts[0].y}`

  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[Math.min(n - 1, i + 2)]

    const cp1x = p1.x + (p2.x - p0.x) * tension / 3
    const cp1y = p1.y + (p2.y - p0.y) * tension / 3
    const cp2x = p2.x - (p3.x - p1.x) * tension / 3
    const cp2y = p2.y - (p3.y - p1.y) * tension / 3

    d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`
  }

  return d
}
