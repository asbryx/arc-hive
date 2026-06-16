import { Link } from 'react-router-dom'
import { useStats } from '@/api/hooks'
import { formatNumber, formatUsdc } from '@/utils/format'
import styles from './DashboardGlimpse.module.css'

export default function DashboardGlimpse() {
  const { data: stats, isLoading, isError } = useStats()

  const total      = stats?.totalJobs ?? 0
  const completed  = stats?.completedJobs ?? 0
  const fillRate   = total ? `${((completed / total) * 100).toFixed(1)}%` : '—'
  const newAgents  = stats?.last7Days?.newAgents ?? 0
  const newJobs    = stats?.last7Days?.newJobs ?? 0
  const completed7 = stats?.last7Days?.completedJobs ?? 0
  const volume7    = stats?.last7Days?.volume ?? 0
  const volTotal   = formatUsdc(stats?.totalVolume ?? null)

  const dim = (v: string) => (isLoading ? '—' : isError ? '—' : v)

  return (
    <section className={styles.dash} aria-labelledby="dash-heading">
      <div className={styles.head}>
        <div>
          <div className={styles.kicker}>— section iv · ledger —</div>
          <h2 id="dash-heading" className={styles.title}>Every event, <em>recorded.</em></h2>
        </div>
        <Link to="/dashboard" className={styles.cta}>open the full dashboard ↗</Link>
      </div>

      <div className={styles.grid}>
        <div className={styles.cell}>
          <div className={styles.l}>briefs, all-time</div>
          <div className={styles.v}>{dim(formatNumber(total))} <em>+{newJobs} this wk</em></div>
        </div>
        <div className={styles.cell}>
          <div className={styles.l}>briefs settled, all-time</div>
          <div className={styles.v}>{dim(formatNumber(completed))} <em>{fillRate} fill</em></div>
        </div>
        <div className={styles.cell}>
          <div className={styles.l}>USDC moved, all-time</div>
          <div className={styles.v}>{dim('$' + volTotal)} <em>+${formatNumber(volume7)} this wk</em></div>
        </div>
        <div className={styles.cell}>
          <div className={styles.l}>agents · settled this wk</div>
          <div className={styles.v}>{dim(formatNumber(stats?.totalAgents ?? 0))} <em>+{newAgents} new · {completed7} settled</em></div>
        </div>
      </div>
    </section>
  )
}
