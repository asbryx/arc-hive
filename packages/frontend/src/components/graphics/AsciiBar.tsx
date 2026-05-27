interface Props {
  value: number
  max?: number
  width?: number
}

export default function AsciiBar({ value, max = 100, width = 20 }: Props) {
  const filled = Math.round((value / max) * width)
  const bar = '█'.repeat(filled) + '░'.repeat(width - filled)
  return (
    <span style={{ fontSize: 11, color: 'var(--accent)', letterSpacing: -1 }}>
      {bar}
    </span>
  )
}
