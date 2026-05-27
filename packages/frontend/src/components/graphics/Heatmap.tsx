interface Props {
  data: { day: string; count: number }[]
  weeks?: number
}

export default function Heatmap({ data, weeks = 12 }: Props) {
  const totalDays = weeks * 7
  const today = new Date()
  const cells: { date: string; count: number }[] = []

  // Build lookup
  const lookup = new Map<string, number>()
  for (const d of data) {
    lookup.set(d.day.split('T')[0], d.count)
  }

  // Fill cells from (totalDays ago) to today
  for (let i = totalDays - 1; i >= 0; i--) {
    const date = new Date(today)
    date.setDate(date.getDate() - i)
    const key = date.toISOString().split('T')[0]
    cells.push({ date: key, count: lookup.get(key) || 0 })
  }

  const maxCount = Math.max(...cells.map(c => c.count), 1)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${weeks}, 1fr)`,
          gridTemplateRows: 'repeat(7, 1fr)',
          gap: 2,
          gridAutoFlow: 'column',
        }}
      >
        {cells.map((cell, i) => {
          const opacity = cell.count === 0 ? 0.05 : 0.15 + (cell.count / maxCount) * 0.85
          return (
            <div
              key={i}
              title={`${cell.date}: ${cell.count}`}
              style={{
                width: 10,
                height: 10,
                borderRadius: 1,
                background: `#ff4444`,
                opacity,
              }}
            />
          )
        })}
      </div>
    </div>
  )
}
