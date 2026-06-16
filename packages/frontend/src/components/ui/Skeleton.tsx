interface Props {
  lines?: number
  width?: string | number
  height?: string | number
  block?: boolean
}

export function Skeleton({ lines = 1, width = '100%', height = 14, block = false }: Props) {
  const w = typeof width === 'number' ? `${width}px` : width
  const h = typeof height === 'number' ? `${height}px` : height

  if (block) {
    return (
      <div
        aria-busy="true"
        style={{
          width: w,
          height: h,
          background: 'repeating-linear-gradient(45deg, var(--cream-2) 0 8px, var(--cream) 8px 16px)',
        }}
      />
    )
  }

  return (
    <div aria-busy="true" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          style={{
            width: i === lines - 1 && lines > 1 ? '60%' : w,
            height: h,
            background: 'repeating-linear-gradient(45deg, var(--cream-2) 0 8px, var(--cream) 8px 16px)',
          }}
        />
      ))}
    </div>
  )
}
