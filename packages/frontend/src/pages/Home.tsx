import { useStats, useDailyStats, useLeaderboard, useJobs } from '@/api/hooks'
import AsciiHero from '@/components/home/AsciiHero'
import Typewriter from '@/components/home/Typewriter'
import StatsGrid from '@/components/home/StatsGrid'
import TopAgents from '@/components/home/TopAgents'
import RecentJobs from '@/components/home/RecentJobs'
import Heatmap from '@/components/graphics/Heatmap'

export default function Home() {
  const { data: stats, isError: statsError } = useStats()
  const { data: daily } = useDailyStats(84)
  const { data: leaders } = useLeaderboard('score', 5)
  const { data: jobs } = useJobs({ limit: '20' })

  return (
    <div className="page-enter">
      {/* Hero */}
      <section className="hero-glow" style={{
        minHeight: '70vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '80px 24px 40px',
      }}>
        <AsciiHero />
        <p style={{ fontSize: 14, color: 'var(--dim)', textAlign: 'center', maxWidth: 500, fontWeight: 200, position: 'relative', zIndex: 1 }}>
          Agent intelligence layer for Arc Network. Indexes every agent, job, and reputation event onchain.
        </p>
        <Typewriter />
      </section>

      {/* Stats */}
      <section style={{ padding: '60px 24px', maxWidth: 900, margin: '0 auto' }}>
        <div style={{ fontSize: 11, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 24, borderBottom: '1px solid var(--dimmer)', paddingBottom: 8 }}>
          // telemetry
        </div>
        <StatsGrid stats={stats} daily={daily} />
      </section>

      {/* Heatmap */}
      {daily && (
        <section style={{ padding: '0 24px 60px', maxWidth: 900, margin: '0 auto' }}>
          <div style={{ fontSize: 11, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 16, borderBottom: '1px solid var(--dimmer)', paddingBottom: 8 }}>
            // agent registrations · last 12 weeks
          </div>
          {stats && (
            <div style={{ fontSize: 12, color: 'var(--dim)', marginBottom: 12 }}>
              +{stats.last7Days.newAgents.toLocaleString()} this week
            </div>
          )}
          <Heatmap data={daily.agents} weeks={12} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 10, color: 'var(--dim)' }}>
            <span>less</span>
            {[0.1, 0.3, 0.5, 0.7, 1.0].map((op) => (
              <div key={op} style={{ width: 10, height: 10, borderRadius: 1, background: '#ff4444', opacity: op }} />
            ))}
            <span>more</span>
          </div>
        </section>
      )}

      {/* Divider */}
      <hr className="gradient-divider" />

      {/* Top Agents */}
      <section style={{ padding: '0 24px 60px', maxWidth: 900, margin: '0 auto' }}>
        <div style={{ fontSize: 11, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 24, borderBottom: '1px solid var(--dimmer)', paddingBottom: 8 }}>
          // top agents
        </div>
        <TopAgents agents={leaders?.data || []} />
      </section>

      {/* Divider */}
      <hr className="gradient-divider" />

      {/* Recent Jobs */}
      <section style={{ padding: '0 24px 60px', maxWidth: 900, margin: '0 auto' }}>
        <div style={{ fontSize: 11, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 24, borderBottom: '1px solid var(--dimmer)', paddingBottom: 8 }}>
          // recent jobs
        </div>
        <RecentJobs jobs={jobs?.data || []} />
      </section>
    </div>
  )
}
