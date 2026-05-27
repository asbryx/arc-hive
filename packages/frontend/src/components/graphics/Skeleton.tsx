interface Props {
  width?: string | number
  height?: string | number
  style?: React.CSSProperties
}

export default function Skeleton({ width = '100%', height = 16, style }: Props) {
  return (
    <div
      className="skeleton"
      style={{ width, height, ...style }}
    />
  )
}
