import type { Stats } from '@/api/client'
import AnimatedCounter from '@/components/graphics/AnimatedCounter'
import AsciiBar from '@/components/graphics/AsciiBar'
import Skeleton from '@/components/graphics/Skeleton'

interface Props {
  stats: Stats | undefined
}

export default function StatsGrid({ stats }: Props) {
  if (!stats) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: 'var(--dimmer)' }}>
        {[...Array(4)].map((_, i) => (
          <div key={i} style={{ padding: 20, background: 'var(--bg)' }}>
            <Skeleton width={60} height={10} style={{ marginBottom: 8 }} />
            <Skeleton width={80} height={28} />
          </div>
        ))}
      </div>
    )
  }

  const items = [
    { label: 'Agents', value: stats.totalAgents, barValue: 80 },
    { label: 'Jobs', value: stats.totalJobs, barValue: 50 },
    { label: 'Rep Events', value: stats.totalReputationEvents, barValue: 90 },
    { label: 'USDC Paid', value: stats.totalVolume ? Math.round(parseFloat(stats.totalVolume)) : 0, barValue: 20 },
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: 'var(--dimmer)' }}>
      {items.map((item) => (
        <div key={item.label} style={{ padding: 20, background: 'var(--bg)' }}>
          <div style={{ fontSize: 10, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
            {item.label}
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
            <AnimatedCounter target={item.value} />
          </div>
          <div style={{ marginTop: 8 }}>
            <AsciiBar value={item.barValue} />
          </div>
        </div>
      ))}
    </div>
  )
}
