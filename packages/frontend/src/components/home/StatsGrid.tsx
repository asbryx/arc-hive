import type { Stats, DailyStats } from '@/api/client'
import AnimatedCounter from '@/components/graphics/AnimatedCounter'
import MiniBarChart from '@/components/graphics/MiniBarChart'
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
    {
      label: 'Agents',
      value: stats.totalAgents,
      delta: stats.last7Days?.newAgents || 0,
      spark: daily?.agents?.map(d => d.count),
    },
    {
      label: 'Jobs',
      value: stats.totalJobs,
      delta: stats.last7Days?.newJobs || 0,
      spark: daily?.jobs?.map(d => d.count),
    },
    {
      label: 'Completed',
      value: stats.completedJobs || 0,
      delta: stats.last7Days?.completedJobs || 0,
      spark: daily?.completed?.map(d => d.count),
    },
    {
      label: 'USDC Volume',
      value: stats.totalVolume ? Math.round(parseFloat(stats.totalVolume)) : 0,
      delta: stats.last7Days?.volume || 0,
      spark: daily?.volume?.map(d => d.count),
    },
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: 'var(--dimmer)' }}>
      {items.map((item, i) => (
        <div
          key={item.label}
          className="card-glow stagger-in"
          style={{
            padding: '20px 16px',
            background: 'var(--bg)',
            animationDelay: `${i * 100}ms`,
          }}
        >
          <div style={{ fontSize: 10, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
            {item.label}
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, fontFamily: 'var(--font)', lineHeight: 1 }}>
            <AnimatedCounter target={item.value} />
          </div>
          {item.delta > 0 && (
            <div style={{ fontSize: 11, color: '#4caf50', marginTop: 6, fontFamily: 'var(--font)' }}>
              +{item.delta.toLocaleString()} this week
            </div>
          )}
          {item.spark && item.spark.length > 1 && (
            <div style={{ marginTop: 10 }}>
              <MiniBarChart data={item.spark} width={120} height={28} />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
