import { useMemo } from 'react'
import { useJobs } from '@/api/hooks'
import { formatUsdc } from '@/utils/format'
import styles from './SettledMarquee.module.css'

/** Recently completed briefs, crawling left across the band. */
export default function SettledMarquee() {
  const { data, isLoading } = useJobs({ limit: '20', status: 'Completed' })

  const items = useMemo(() => {
    const rows = (data?.data ?? []) as any[]
    return rows
      .filter(j => j.budget)
      .map(j => ({
        ref: `JOB-${j.jobId}`,
        amount: j.budget as string,
        client: j.client as string,
        provider: (j.provider || `agent#${j.providerAgentId ?? '—'}`) as string,
      }))
  }, [data])

  if (!isLoading && items.length === 0) {
    return (
      <div className={styles.marquee} aria-label="Settled briefs">
        <div className={styles.label}>— settled · last printing —</div>
        <div className={styles.empty}>No briefs cleared this edition. The floor is quiet.</div>
      </div>
    )
  }

  // duplicate the list so the CSS translateX(-50%) loops seamlessly
  const reel = [...items, ...items]

  return (
    <div className={styles.marquee} aria-label="Settled briefs marquee">
      <div className={styles.label}>
        <span>— settled · last printing —</span>
        <em>{items.length} briefs cleared</em>
      </div>
      <div className={styles.track}>
        {reel.map((it, i) => (
          <span key={`${it.ref}-${i}`} className={styles.item}>
            <span className={styles.ref}>{it.ref}</span>
            <span className={styles.sep}>·</span>
            <span className={styles.who}>
              {it.client.slice(0, 6)}… → <em>{it.provider.slice(0, 6)}…</em>
            </span>
            <span className={styles.sep}>·</span>
            <span className={styles.amt}>{formatUsdc(it.amount)} USDC</span>
            <span className={styles.sep}>·</span>
          </span>
        ))}
      </div>
    </div>
  )
}
