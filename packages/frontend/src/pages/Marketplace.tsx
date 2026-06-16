import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { useMarketplaceStats } from '@/api/hooks'
import { sectorToCategory, getSector } from '@/lib/sectors'
import { EmptyState } from '@/components/EmptyState'
import BroadsheetHeader from '@/components/broadsheet/BroadsheetHeader'
import LotsGrid from '@/components/broadsheet/LotsGrid'
import LotTile, { type LotSize } from '@/components/broadsheet/LotTile'
import { ChipBar } from '@/components/ui/ChipBar'
import { Field, Input, Select } from '@/components/ui/Field'
import { Skeleton } from '@/components/ui/Skeleton'
import { Button } from '@/components/ui/Button'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

interface OpenJob {
  id: number
  jobId: number | null
  title: string
  description: string
  category: string | null
  requirements: string | null
  budgetMin: string | null
  budgetMax: string | null
  deadlineHours: number
  clientAddress: string
  status: string
  applicationCount: number
  sectorConfig?: { sector?: string; details?: Record<string, string> } | null
  createdAt: string
}

const CATEGORIES: Array<{ key: string; label: string }> = [
  { key: '',                 label: 'All' },
  { key: 'Code',             label: 'Code' },
  { key: 'Development',      label: 'Development' },
  { key: 'Research',         label: 'Research' },
  { key: 'Data Analysis',    label: 'Data' },
  { key: 'Content Creation', label: 'Copy' },
  { key: 'Trading',          label: 'Trading' },
  { key: 'DeFi',             label: 'DeFi' },
  { key: 'Social Media',     label: 'Social' },
  { key: 'Monitoring',       label: 'Monitoring' },
  { key: 'Other',            label: 'Other' },
]

type SortKey = 'newest' | 'budget_desc' | 'budget_asc' | 'deadline'

function formatAgo(iso?: string) {
  if (!iso) return ''
  const ts = new Date(iso).getTime()
  if (Number.isNaN(ts)) return ''
  const diff = (Date.now() - ts) / 1000
  if (diff < 60)    return `${Math.round(diff)}s ago`
  if (diff < 3600)  return `${Math.round(diff / 60)}m ago`
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`
  return `${Math.round(diff / 86400)}d ago`
}

/** Choose a tile size pattern for n tiles, biased to feature/standard at top. */
function chooseSizes(n: number): LotSize[] {
  const out: LotSize[] = []
  let i = 0
  while (out.length < n) {
    const remaining = n - out.length
    if (i === 0 && remaining >= 4) { out.push('feature'); i++; continue }
    if (i % 7 === 0 && remaining >= 4) { out.push('feature'); i++; continue }
    if (i % 3 === 1 && remaining >= 2) { out.push('standard'); i++; continue }
    out.push('compact'); i++
  }
  return out.slice(0, n)
}

/** Re-balance tile order so adjacent tiles never share the same category palette. */
function rebalance(jobs: OpenJob[]): OpenJob[] {
  const out = jobs.slice()
  for (let i = 1; i < out.length; i++) {
    if ((out[i].category ?? '') === (out[i - 1].category ?? '')) {
      const swap = out.findIndex((j, k) => k > i && (j.category ?? '') !== (out[i - 1].category ?? ''))
      if (swap > -1) { const t = out[i]; out[i] = out[swap]; out[swap] = t }
    }
  }
  return out
}

export default function Marketplace() {
  const { address } = useAccount()
  const { data: mStats } = useMarketplaceStats()
  const [searchParams, setSearchParams] = useSearchParams()

  const category = searchParams.get('category') ?? ''
  const sortBy   = (searchParams.get('sort') ?? 'newest') as SortKey
  const page     = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1)
  const searchQuery = searchParams.get('q') ?? ''

  const [jobs, setJobs] = useState<OpenJob[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)

  useEffect(() => {
    let cancelled = false
    async function fetchJobs() {
      setLoading(true)
      try {
        const params = new URLSearchParams({ page: page.toString(), limit: '15' })
        if (category) params.set('category', category)
        const res = await fetch(`${API_BASE}/open-jobs?${params}`)
        const data = await res.json()
        if (cancelled) return
        setJobs(data.data || [])
        setTotal(data.total || 0)
        setPages(data.pages || 1)
      } catch {
        if (!cancelled) setJobs([])
      }
      if (!cancelled) setLoading(false)
    }
    fetchJobs()
    return () => { cancelled = true }
  }, [page, category])

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value); else next.delete(key)
    if (key !== 'page') next.delete('page')
    setSearchParams(next, { replace: false })
  }

  const filtered = jobs
    .filter(job => {
      if (!searchQuery) return true
      const q = searchQuery.toLowerCase()
      return job.title?.toLowerCase().includes(q) ||
             job.description?.toLowerCase().includes(q) ||
             (job.category ?? '').toLowerCase().includes(q)
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'budget_desc': return (parseFloat(b.budgetMax || '0') || 0) - (parseFloat(a.budgetMax || '0') || 0)
        case 'budget_asc':  return (parseFloat(a.budgetMin || '0') || 0) - (parseFloat(b.budgetMin || '0') || 0)
        case 'deadline':    return (a.deadlineHours || 0) - (b.deadlineHours || 0)
        default: return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
      }
    })

  const balanced = rebalance(filtered)
  const sizes = chooseSizes(balanced.length)

  return (
    <div className="page-enter">
      {/* Header */}
      <section style={{ padding: 'var(--s-6) var(--gutter) 0' }}>
        <BroadsheetHeader
          eyebrow="open marketplace"
          title={<>The <em>floor</em>, by category and reserve.</>}
          strap={
            <>
              <span style={{ fontFamily: 'var(--mono)', color: 'var(--ink)' }}>{total}</span> open briefs
              {mStats && (
                <>
                  {' · '}<span style={{ color: 'var(--marsh)' }}>{mStats.activeJobs.toLocaleString()}</span> active
                  {' · '}<span style={{ color: 'var(--ink-3)' }}>{mStats.completedJobs.toLocaleString()}</span> settled to date
                  {mStats.volume && <> · volume <span style={{ fontFamily: 'var(--mono)' }}>{Number(mStats.volume).toLocaleString()} USDC</span></>}
                </>
              )}
            </>
          }
        />
      </section>

      {/* Search + sort + chips */}
      <section
        style={{
          position: 'sticky',
          top: 'var(--nav-height)',
          zIndex: 5,
          background: 'var(--cream)',
          borderTop: '1px solid var(--rule)',
          borderBottom: '1px solid var(--rule)',
          padding: 'var(--s-4) var(--gutter)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--s-3)',
        }}
      >
        <div style={{ display: 'flex', gap: 'var(--s-3)', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <Field label="Search briefs">
              {(id) => (
                <Input
                  id={id}
                  type="search"
                  placeholder="Title, description, or category…"
                  value={searchQuery}
                  onChange={e => setParam('q', e.target.value)}
                />
              )}
            </Field>
          </div>
          <div style={{ width: 220 }}>
            <Field label="Sort">
              {(id) => (
                <Select id={id} value={sortBy} onChange={e => setParam('sort', e.target.value)}>
                  <option value="newest">Newest first</option>
                  <option value="budget_desc">Reserve · high → low</option>
                  <option value="budget_asc">Reserve · low → high</option>
                  <option value="deadline">Deadline · soonest</option>
                </Select>
              )}
            </Field>
          </div>
          <Button as="a" href="/post-job" variant="primary" size="md">+ post brief</Button>
        </div>
        <ChipBar
          chips={CATEGORIES}
          value={category}
          onChange={v => setParam('category', v)}
          ariaLabel="Filter by category"
        />
      </section>

      {/* Body */}
      <section style={{ padding: 'var(--s-6) var(--gutter) var(--s-14)' }}>
        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 1, background: 'var(--ink)' }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{ gridColumn: i === 0 ? 'span 7' : 'span 5', minHeight: i === 0 ? 360 : 220, background: 'var(--cream-2)', padding: 'var(--s-7)' }}>
                <Skeleton lines={4} />
              </div>
            ))}
          </div>
        ) : balanced.length === 0 ? (
          <EmptyState
            title="No open briefs match this filter"
            description={category ? `Nothing in "${category}" right now. Try All, or post the first one.` : "The floor is empty. Be the first to post."}
            action={{ label: 'Post Brief', to: '/post-job' }}
          />
        ) : (
          <>
            <LotsGrid>
              {balanced.map((job, i) => {
                const isMine = address && job.clientAddress === address.toLowerCase()
                const sector = getSector(job.category ?? '')
                const displayCategory = job.category === 'Other' && job.sectorConfig?.details?.sectorLabel
                  ? job.sectorConfig.details.sectorLabel
                  : (sector?.label ?? job.category ?? 'Brief')
                const reserve = job.budgetMax || job.budgetMin
                return (
                  <LotTile
                    key={job.id}
                    size={sizes[i] ?? 'compact'}
                    category={sectorToCategory(job.category)}
                    ownPerspective={Boolean(isMine)}
                    reference={`LOT ${String(job.id).padStart(4, '0')}`}
                    meta={<>{(displayCategory ?? '').toString().toUpperCase()}{formatAgo(job.createdAt) ? ` · ${formatAgo(job.createdAt)}` : ''}</>}
                    activity={
                      job.applicationCount > 0
                        ? `live · ${job.applicationCount} bid${job.applicationCount === 1 ? '' : 's'}`
                        : undefined
                    }
                    title={job.title}
                    summary={job.description}
                    bidLabel={
                      <>
                        {isMine && <span style={{ marginRight: 8, color: 'var(--hot)', fontStyle: 'italic' }}>your job · </span>}
                        {job.applicationCount > 0 ? `${job.applicationCount} bids` : 'no bids yet'}
                        {job.deadlineHours ? ` · ${job.deadlineHours}h to deadline` : ''}
                      </>
                    }
                    price={
                      reserve
                        ? <>{Number(reserve).toFixed(2)}<small style={{ marginLeft: 4, fontSize: '0.55em', letterSpacing: '0.16em' }}>USDC</small></>
                        : null
                    }
                    href={`/marketplace/${job.id}`}
                  />
                )
              })}
            </LotsGrid>

            {/* Pagination */}
            <nav
              aria-label="Pagination"
              style={{
                display: 'flex',
                gap: 'var(--s-5)',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 'var(--s-7) 0 0',
                fontFamily: 'var(--mono)',
                fontSize: 'var(--t-mono-sm)',
                color: 'var(--ink-2)',
              }}
            >
              <button
                type="button"
                onClick={() => setParam('page', String(Math.max(1, page - 1)))}
                disabled={page <= 1}
                style={{ padding: '6px 14px', border: '1px solid var(--ink)', background: 'transparent', color: page <= 1 ? 'var(--ink-3)' : 'var(--ink)', cursor: page <= 1 ? 'not-allowed' : 'pointer', textTransform: 'uppercase', letterSpacing: '0.12em' }}
              >
                ← prev
              </button>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                page {page} of {pages}
              </span>
              <button
                type="button"
                onClick={() => setParam('page', String(Math.min(pages, page + 1)))}
                disabled={page >= pages}
                style={{ padding: '6px 14px', border: '1px solid var(--ink)', background: 'transparent', color: page >= pages ? 'var(--ink-3)' : 'var(--ink)', cursor: page >= pages ? 'not-allowed' : 'pointer', textTransform: 'uppercase', letterSpacing: '0.12em' }}
              >
                next →
              </button>
            </nav>
          </>
        )}
      </section>
    </div>
  )
}
