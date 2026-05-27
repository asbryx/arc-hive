import { TRUST_TIERS } from '@/utils/constants'

interface Props {
  tier: number
  size?: number
}

export default function TrustBadge({ tier, size = 16 }: Props) {
  const label = TRUST_TIERS[tier] || 'Unknown'
  const half = size / 2

  const shapes: Record<number, JSX.Element> = {
    0: <circle cx={half} cy={half} r={size * 0.2} fill="var(--dimmer)" />,
    1: (
      <polygon
        points={`${half},${size * 0.2} ${size * 0.8},${size * 0.8} ${size * 0.2},${size * 0.8}`}
        fill="var(--dim)"
      />
    ),
    2: (
      <polygon
        points={`${half},${size * 0.1} ${size * 0.9},${half} ${half},${size * 0.9} ${size * 0.1},${half}`}
        fill="var(--text)"
      />
    ),
    3: (
      <polygon
        points={`${half},${size * 0.05} ${size * 0.62},${size * 0.35} ${size * 0.95},${size * 0.4} ${size * 0.7},${size * 0.65} ${size * 0.8},${size * 0.95} ${half},${size * 0.78} ${size * 0.2},${size * 0.95} ${size * 0.3},${size * 0.65} ${size * 0.05},${size * 0.4} ${size * 0.38},${size * 0.35}`}
        fill="var(--text)"
        style={{ filter: 'drop-shadow(0 0 3px rgba(255,255,255,0.4))' }}
      />
    ),
  }

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label}>
      {shapes[tier] || shapes[0]}
    </svg>
  )
}
