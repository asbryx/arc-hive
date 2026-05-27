interface Props {
  score: number | null
  size?: number
  strokeWidth?: number
}

export default function ScoreRadial({ score, size = 48, strokeWidth = 4 }: Props) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const progress = score !== null ? (score / 100) * circumference : 0

  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      {/* Background ring */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--dimmer)"
        strokeWidth={strokeWidth}
      />
      {/* Progress ring */}
      {score !== null && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--text)"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.8s ease-out' }}
        />
      )}
    </svg>
  )
}
