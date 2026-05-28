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


  return (
    <div className="stats-grid">
      {items.map((item, i) => (
        <div key={item.label} className="card-glow stagger-in stat-card" style={{ animationDelay: `${i * 100}ms` }}>
          <div className="stat-label">
            {item.label}
          </div>
          <div className="stat-value">
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
