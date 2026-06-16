import { useState, useEffect } from 'react'
import { useAccount } from 'wagmi'
import { useConnectModal } from '@rainbow-me/rainbowkit'
import { authFetch } from '@/api/client'
import BroadsheetHeader from '@/components/broadsheet/BroadsheetHeader'
import LotsGrid from '@/components/broadsheet/LotsGrid'
import LotTile, { type LotSize } from '@/components/broadsheet/LotTile'
import SettledLedger, { type SettledRow } from '@/components/broadsheet/SettledLedger'
import { Button } from '@/components/ui/Button'
import { ChipBar } from '@/components/ui/ChipBar'
import { Skeleton } from '@/components/ui/Skeleton'
import { CopyableAddress } from '@/components/ui/CopyableAddress'
import { sectorToCategory } from '@/lib/sectors'

interface WalletStats {
  posted: number
  activeAsClient: number
  completedAsClient: number
  spent: string | null
  activeAsProvider: number
  completedAsProvider: number
  earned: string | null
  applications: number
}

interface JobRow {
  id: number
  jobId: number | null
  title: string
  status: string
  category: string | null
  budgetMin: string | null
  budgetMax: string | null
  finalBudget: string | null
  clientAddress: string
  selectedApplicant: string | null
  createdAt: string
  completedAt: string | null
  sectorConfig?: { sector?: string; details?: Record<string, string> } | null
  applicationStatus?: string
  appProposedBudget?: string | null
  appliedAt?: string
  applicationCount?: number
  role?: string
}

type Filter = 'all' | 'active' | 'completed' | 'as_client' | 'as_agent'

function formatAgo(iso?: string) {
  if (!iso) return '—'
  const ts = new Date(iso).getTime()
  if (Number.isNaN(ts)) return '—'
  const diff = (Date.now() - ts) / 1000
  if (diff < 60)    return `${Math.round(diff)}s ago`
  if (diff < 3600)  return `${Math.round(diff / 60)}m ago`
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`
  return `${Math.round(diff / 86400)}d ago`
}

function statusToPhase(s: string): SettledRow['phase'] {
  if (s === 'open' || s === 'assigned')                  return 'bidding'
  if (s === 'funded' || s === 'in_progress')             return 'executing'
  if (s === 'submitted' || s === 'evaluating')           return 'delivering'
  if (s === 'completed' || s === 'paid')                 return 'settled'
  if (s === 'rejected' || s === 'expired' || s === 'refunded') return 'cancelled'
  return 'idle'
}

export default function Dashboard() {
  const { address, isConnected } = useAccount()
  const { openConnectModal } = useConnectModal()
  const [walletStats, setWalletStats] = useState<WalletStats | null>(null)
  const [activeJobs, setActiveJobs] = useState<JobRow[]>([])
  const [historyJobs, setHistoryJobs] = useState<JobRow[]>([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')

  useEffect(() => {
    if (address) fetchAll()
  }, [address])

  async function fetchAll() {
    if (!address) return
    setLoading(true)
    try {
      const [activeRes, historyRes, statsRes] = await Promise.all([
        authFetch(`/open-jobs/my-active-all?address=${address}`),
        authFetch(`/open-jobs/my-history?address=${address}`),
        authFetch(`/stats/wallet?address=${address}`),
      ])
      if (activeRes.ok)  setActiveJobs((await activeRes.json()).data || [])
      if (historyRes.ok) setHistoryJobs((await historyRes.json()).data || [])
      if (statsRes.ok)   setWalletStats(await statsRes.json())
    } catch {}
    setLoading(false)
  }

  if (!isConnected) {
    return (
      <div className="page-enter" style={{ padding: 'var(--s-14) var(--gutter)', maxWidth: 'var(--max-prose)', margin: '0 auto', textAlign: 'center' }}>
        <div className="caps" style={{ marginBottom: 'var(--s-7)' }}>— dashboard —</div>
        <h1 style={{ fontFamily: 'var(--serif)', fontWeight: 200, fontSize: 'var(--t-h1)', lineHeight: 1, letterSpacing: '-0.025em', marginBottom: 'var(--s-5)' }}>
          Connect your wallet to see <em>your briefs.</em>
        </h1>
        <p style={{ color: 'var(--ink-2)', marginBottom: 'var(--s-8)' }}>
          Your dashboard shows briefs you've posted and applied to, in chronological order.
        </p>
        <Button variant="primary" size="lg" onClick={() => openConnectModal?.()}>
          connect wallet ↗
        </Button>
      </div>
    )
  }

  const myAddr = address!.toLowerCase()
  const allJobs = [...activeJobs, ...historyJobs]
  const seen = new Set<number>()
  const deduped = allJobs.filter(j => { if (seen.has(j.id)) return false; seen.add(j.id); return true })
  deduped.sort((a, b) =>
    new Date(b.completedAt || b.createdAt || 0).getTime() -
    new Date(a.completedAt || a.createdAt || 0).getTime()
  )

  const filtered = deduped.filter(j => {
    const isClient = j.clientAddress.toLowerCase() === myAddr
    const isAgent  = j.selectedApplicant?.toLowerCase() === myAddr
    const phase = statusToPhase(j.status)
    if (filter === 'all') return true
    if (filter === 'active')    return phase !== 'settled' && phase !== 'cancelled'
    if (filter === 'completed') return phase === 'settled'
    if (filter === 'as_client') return isClient
    if (filter === 'as_agent')  return isAgent
    return true
  })

  // Top section: open / in-progress as visual tiles for quick scanning
  const topActive = filtered.filter(j => {
    const p = statusToPhase(j.status)
    return p === 'bidding' || p === 'executing' || p === 'delivering'
  }).slice(0, 6)

  const tileSizes: LotSize[] =
    topActive.length >= 4 ? ['feature', 'standard', 'standard', 'compact', 'compact', 'compact'] :
    topActive.length === 3 ? ['feature', 'standard', 'compact'] :
    topActive.length === 2 ? ['standard', 'standard'] :
    topActive.length === 1 ? ['feature'] : []

  const ledgerRows: SettledRow[] = filtered.map(j => ({
    id: j.id,
    ts: formatAgo(j.completedAt || j.createdAt),
    brief: j.title,
    phase: statusToPhase(j.status),
    amount: j.finalBudget
      ? `${j.finalBudget} USDC`
      : j.budgetMax
        ? `${j.budgetMax} USDC`
        : '—',
  }))

  return (
    <div className="page-enter">
      <BroadsheetHeader
        eyebrow="dashboard"
        title={<>Your briefs, in <em>chronological precedence.</em></>}
        strap={
          <>
            connected as <CopyableAddress addr={address!} truncate />
            {walletStats && (
              <>
                {' · posted '}<span style={{ color: 'var(--ink)' }}>{walletStats.posted}</span>
                {' · spent '}<span style={{ color: 'var(--ink)' }}>{walletStats.spent ?? '0'} USDC</span>
                {' · earned '}<span style={{ color: 'var(--marsh)' }}>{walletStats.earned ?? '0'} USDC</span>
              </>
            )}
          </>
        }
      />

      {/* Stat row */}
      {walletStats && (
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderTop: '1px solid var(--rule)', borderBottom: '1px solid var(--rule)' }}>
          <DashStat label="posted" value={walletStats.posted} note="briefs you've created" />
          <DashStat label="active client"  value={walletStats.activeAsClient}  note="open / executing" />
          <DashStat label="active agent"   value={walletStats.activeAsProvider} note="executing for clients" />
          <DashStat label="applications"   value={walletStats.applications}    note="bids you've submitted" />
        </section>
      )}

      {/* Filter chips */}
      <section style={{ padding: 'var(--s-5) var(--gutter) var(--s-3)' }}>
        <div style={{ display: 'flex', gap: 'var(--s-3)', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <ChipBar
            chips={[
              { key: 'all',       label: 'All' },
              { key: 'active',    label: 'Active' },
              { key: 'completed', label: 'Completed' },
              { key: 'as_client', label: 'As Client' },
              { key: 'as_agent',  label: 'As Agent' },
            ]}
            value={filter}
            onChange={v => setFilter(v as Filter)}
            ariaLabel="Filter briefs"
          />
          <Button as="a" href="/post-job" variant="primary" size="md">+ post brief</Button>
        </div>
      </section>

      {loading ? (
        <section style={{ padding: '0 var(--gutter) var(--s-14)' }}>
          <Skeleton lines={6} height={20} />
        </section>
      ) : filtered.length === 0 ? (
        <section style={{ padding: 'var(--s-10) var(--gutter)', textAlign: 'center' }}>
          <div className="caps" style={{ color: 'var(--ink-3)' }}>— no briefs match this filter —</div>
        </section>
      ) : (
        <>
          {/* Active briefs as tiles */}
          {topActive.length > 0 && filter !== 'completed' && (
            <section style={{ padding: '0 var(--gutter) var(--s-7)' }}>
              <div className="caps" style={{ marginBottom: 'var(--s-3)' }}>— active briefs —</div>
              <LotsGrid>
                {topActive.map((j, i) => {
                  const isClient = j.clientAddress.toLowerCase() === myAddr
                  return (
                    <LotTile
                      key={j.id}
                      size={tileSizes[i] ?? 'compact'}
                      category={sectorToCategory(j.category)}
                      ownPerspective={isClient}
                      reference={`LOT ${String(j.id).padStart(4, '0')}`}
                      meta={<>{(j.category ?? 'BRIEF').toUpperCase()} · {formatAgo(j.createdAt)}</>}
                      activity={
                        isClient
                          ? `as client · ${j.status.replace(/_/g, ' ')}`
                          : `as agent · ${j.status.replace(/_/g, ' ')}`
                      }
                      title={j.title}
                      summary={undefined}
                      bidLabel={j.applicationCount ? `${j.applicationCount} bids` : 'no bids yet'}
                      price={
                        j.finalBudget
                          ? <>{Number(j.finalBudget).toFixed(2)}<small style={{ marginLeft: 4, fontSize: '0.55em', letterSpacing: '0.16em' }}>USDC</small></>
                          : j.budgetMax
                          ? <>{Number(j.budgetMax).toFixed(2)}<small style={{ marginLeft: 4, fontSize: '0.55em', letterSpacing: '0.16em' }}>USDC</small></>
                          : null
                      }
                      href={`/marketplace/${j.id}`}
                    />
                  )
                })}
              </LotsGrid>
            </section>
          )}

          {/* Full chronological ledger */}
          <section style={{ padding: 'var(--s-3) var(--gutter) var(--s-14)' }}>
            <div className="caps" style={{ marginBottom: 'var(--s-3)' }}>— ledger of {filtered.length} brief{filtered.length === 1 ? '' : 's'} —</div>
            <SettledLedger rows={ledgerRows} />
          </section>
        </>
      )}
    </div>
  )
}

function DashStat({ label, value, note }: { label: string; value: number | string; note: string }) {
  return (
    <div style={{ padding: 'var(--s-5) var(--gutter)', borderRight: '1px solid var(--rule)' }}>
      <div className="caps" style={{ marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 'var(--t-h2)', fontWeight: 500, fontVariantNumeric: 'tabular-nums', color: 'var(--ink)', lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 'var(--t-mono-sm)', color: 'var(--ink-3)', marginTop: 4 }}>
        {note}
      </div>
    </div>
  )
}
