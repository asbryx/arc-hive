interface Props {
  data: number[]
  width?: number
  height?: number
  color?: string
}

export default function MiniBarChart({ data, width = 100, height = 32, color = '#4a9ead' }: Props) {
  if (!data || data.length < 2) return null

  const max = Math.max(...data, 1)
  const barWidth = Math.max(2, (width - data.length) / data.length)
  const gap = 1

  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      {data.map((val, i) => {
        const barHeight = Math.max(1, (val / max) * (height - 2))
        const x = i * (barWidth + gap)
        const y = height - barHeight
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={barWidth}
            height={barHeight}
            fill={color}
            opacity={0.4 + (val / max) * 0.6}
            rx={1}
          />
        )
      })}
    </svg>
  )
}
