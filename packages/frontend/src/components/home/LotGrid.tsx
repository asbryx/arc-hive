import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useJobs } from '@/api/hooks'
import { formatUsdc, timeAgo } from '@/utils/format'
import styles from './LotGrid.module.css'

const CATS = [
  { id: 'all',       label: 'all' },
  { id: 'code',      label: 'code',      cls: styles.catCode },
  { id: 'research',  label: 'research',  cls: styles.catResearch },
  { id: 'audit',     label: 'audit',     cls: styles.catAudit },
  { id: 'brand',     label: 'brand',     cls: styles.catBrand },
  { id: 'copy',      label: 'copy',      cls: styles.catCopy },
  { id: 'translation', label: 'translation', cls: styles.catTrans },
]

function catClass(cat: string | null | undefined): string {
  if (!cat) return styles.catOther
  const m = cat.toLowerCase()
  if (m.includes('code'))     return styles.catCode
  if (m.includes('research')) return styles.catResearch
  if (m.includes('audit'))    return styles.catAudit
  if (m.includes('brand'))    return styles.catBrand
  if (m.includes('copy'))     return styles.catCopy
  if (m.includes('translat')) return styles.catTrans
  return styles.catOther
}

/** Pick a tile size from index — the broadsheet rhythm: one feature, then mixed. */
function sizeClass(idx: number): string {
  if (idx === 0) return styles.feature
  if (idx % 7 === 1) return styles.standard
  if (idx % 3 === 0) return styles.compact
  return styles.thin
}

interface LotJob {
  jobId: number
  description: string | null
  budget: string | null
  createdAt: string
  status: string
  category?: string | null
  sectorConfig?: { sector?: string; details?: Record<string, string> } | null
}

export default function LotGrid() {
  const [activeCat, setActiveCat] = useState('all')
  const { data, isLoading, isError } = useJobs({ limit: '20', status: 'Open' })

  const all = useMemo(() => (data?.data ?? []) as LotJob[], [data])

  const filtered = useMemo(() => {
    if (activeCat === 'all') return all
    return all.filter(j => {
      const cat = (j.category || j.sectorConfig?.sector || '').toLowerCase()
      return cat.includes(activeCat)
    })
  }, [all, activeCat])

  const totalOpen = all.length

  return (
    <section className={styles.section} aria-labelledby="lots-heading">
      <div className={styles.head}>
        <div>
          <div className={styles.kicker}>— section iii · the floor —</div>
          <h2 id="lots-heading" className={styles.title}>
            <em>{totalOpen}</em> {totalOpen === 1 ? 'lot' : 'lots'}, open for bidding.
          </h2>
          <div className={styles.filter}>
            {CATS.map(c => (
              <button
                key={c.id}
                className={activeCat === c.id ? styles.on : ''}
                onClick={() => setActiveCat(c.id)}
                aria-pressed={activeCat === c.id}
              >
                {c.label}{c.id === 'all' ? ` (${totalOpen})` : ''}
              </button>
            ))}
          </div>
        </div>
        <div className={styles.metaRight}>
          <strong>{totalOpen}</strong> open · <em>refreshed every 30s</em><br/>
          accepting bids · arc-testnet<br/>
          settlement on completion · usdc
        </div>
      </div>

      <div className={styles.grid}>
        {isLoading && (
          <>
            <div className={styles.skeleton} />
            <div className={styles.skeleton} />
            <div className={styles.skeleton} />
          </>
        )}

        {isError && (
          <div className={`${styles.state} ${styles.err}`}>
            Lot register unreadable — re-trying automatically.
          </div>
        )}

        {!isLoading && !isError && filtered.length === 0 && (
          <div className={styles.state}>
            {activeCat === 'all' ? 'No open briefs. The floor is quiet.' : `No open briefs in "${activeCat}".`}
          </div>
        )}

        {filtered.map((j, i) => {
          const cat = j.category || j.sectorConfig?.sector || 'other'
          const cls = `${styles.lot} ${sizeClass(i)} ${catClass(cat)}`
          const title = j.description?.split('\n')[0]?.slice(0, 220) || `Brief #${j.jobId}`
          const summary = j.description?.split('\n').slice(1).join(' ').trim().slice(0, 240)
          return (
            <Link key={j.jobId} to={`/marketplace/${j.jobId}`} className={cls}>
              <div className={styles.lotMeta}>
                <span className={styles.ref}>LOT {j.jobId}</span>
                <span>{cat.toUpperCase()}</span>
                <span>{timeAgo(j.createdAt)}</span>
              </div>
              {i === 0 && <div className={styles.activity}>live · open</div>}
              <div className={styles.lotTitle}>{title}</div>
              {summary && i < 3 && <div className={styles.summary}>{summary}</div>}
              <div className={styles.foot}>
                <div className={styles.bidInfo}>
                  budget<br/>
                  <strong>{formatUsdc(j.budget)} USDC</strong>
                </div>
                <div className={styles.price}>
                  {formatUsdc(j.budget)}<small>USDC</small>
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
