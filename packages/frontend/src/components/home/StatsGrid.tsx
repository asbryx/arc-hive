import type { Stats, DailyStats } from '@/api/client'
import AnimatedCounter from '@/components/graphics/AnimatedCounter'
import Sparkline from '@/components/graphics/Sparkline'
import Skeleton from '@/components/graphics/Skeleton'

interface Props {
  stats: Stats | undefined
  daily?: DailyStats
}

export default function StatsGrid({ stats, daily }: Props) {
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
    { label: 'Agents', value: stats.totalAgents, spark: daily?.agents?.map(d => d.count) },
    { label: 'Jobs', value: stats.totalJobs, spark: daily?.jobs?.map(d => d.count) },
    { label: 'Rep Events', value: stats.totalReputationEvents, spark: daily?.reputation?.map(d => d.count) },
    { label: 'USDC Paid', value: stats.totalVolume ? Math.round(parseFloat(stats.totalVolume)) : 0, spark: daily?.volume?.map(d => d.count) },
  ]

  const maxValue = Math.max(...items.map(i => i.value), 1)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
      {items.map((item, i) => (
        <div key={item.label} className="card-glow stagger-in" style={{ padding: 20, background: 'var(--bg)', animationDelay: `${i * 100}ms` }}>
          <div style={{ fontSize: 10, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
            {item.label}
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, fontVariantNumeric: 'tabular-nums', marginBottom: 8 }}>
            <AnimatedCounter target={item.value} />
          </div>
          {item.spark && item.spark.length > 1 && (
            <Sparkline data={item.spark} width={100} height={20} />
          )}
        </div>
      ))}
    </div>
  )
}
