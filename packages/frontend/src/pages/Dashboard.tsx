import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { useMarketplaceStats } from '@/api/hooks'
import { getSector } from '@/lib/sectors'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

type Tab = 'open' | 'history'

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

export default function Dashboard() {
  const { address, isConnected } = useAccount()
  const navigate = useNavigate()
  const { data: mStats } = useMarketplaceStats()
  const [tab, setTab] = useState<Tab>('open')
  const [activeJobs, setActiveJobs] = useState<JobRow[]>([])
  const [historyJobs, setHistoryJobs] = useState<JobRow[]>([])
  const [loading, setLoading] = useState(false)

  // Redirect to home if not connected
  useEffect(() => {
    if (!isConnected) {
      navigate('/', { replace: true })
    }
  }, [isConnected, navigate])

  useEffect(() => {
    if (address) fetchAll()
  }, [address])

  async function fetchAll() {
    if (!address) return
    setLoading(true)
    try {
      const [activeRes, historyRes] = await Promise.all([
        fetch(`${API_BASE}/open-jobs/my-active-all?address=${address}`),
        fetch(`${API_BASE}/open-jobs/my-history?address=${address}`),
      ])
      if (activeRes.ok) {
        const d = await activeRes.json()
        setActiveJobs(d.data || [])
      }
      if (historyRes.ok) {
        const d = await historyRes.json()
        setHistoryJobs(d.data || [])
      }
    } catch {}
    setLoading(false)
  }

  if (!isConnected) return null

  const currentList = tab === 'open' ? activeJobs : historyJobs

  return (
    <div className="page-enter" style={{ padding: '40px 24px', maxWidth: 800, margin: '0 auto', minHeight: 'calc(100vh - 160px)' }}>
      {/* Header */}
      <div style={{ fontSize: 11, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 24 }}>
        // dashboard
      </div>

      {/* Marketplace stats */}
      {mStats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 32 }}>
          <StatCard label="Marketplace Jobs" value={mStats.totalJobs.toLocaleString()} />
          <StatCard label="Active Jobs" value={mStats.activeJobs.toLocaleString()} />
          <StatCard label="Completed" value={mStats.completedJobs.toLocaleString()} />
          <StatCard label="Volume" value={mStats.volume ? `$${parseFloat(mStats.volume).toLocaleString()}` : '$0'} />
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--dimmer)', marginBottom: 24 }}>
        <button
          onClick={() => setTab('open')}
          style={{
            padding: '10px 20px', fontSize: 12, fontWeight: tab === 'open' ? 700 : 400,
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: tab === 'open' ? 'var(--text)' : 'var(--dim)',
            borderBottom: tab === 'open' ? '2px solid var(--accent)' : '2px solid transparent',
            marginBottom: -1,
          }}
        >
          Open ({activeJobs.length})
        </button>
        <button
          onClick={() => setTab('history')}
          style={{
            padding: '10px 20px', fontSize: 12, fontWeight: tab === 'history' ? 700 : 400,
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: tab === 'history' ? 'var(--text)' : 'var(--dim)',
            borderBottom: tab === 'history' ? '2px solid var(--accent)' : '2px solid transparent',
            marginBottom: -1,
          }}
        >
          History ({historyJobs.length})
        </button>
      </div>

      {/* Job list */}
      {loading ? (
        <div style={{ fontSize: 12, color: 'var(--dim)' }}>Loading...</div>
      ) : currentList.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--dim)', fontSize: 12 }}>
          {tab === 'open' ? 'No active jobs.' : 'No completed jobs yet.'}
          {tab === 'open' && (
            <div style={{ marginTop: 12 }}>
              <Link to="/post-job" style={{ color: 'var(--accent)', fontSize: 12 }}>+ Post a job</Link>
            </div>
          )}
        </div>
      ) : (
        <div>
          {currentList.map(job => {
            const role = job.role || (job.clientAddress?.toLowerCase() === address?.toLowerCase() ? 'client' : 'provider')
            return (
              <Link
                key={`${job.id}-${job.applicationStatus || ''}`}
                to={`/marketplace/${job.id}`}
                style={{ textDecoration: 'none', color: 'inherit', display: 'block', marginBottom: 12 }}
              >
                <div style={{ padding: '14px 12px', border: '1px solid var(--dimmer)', transition: 'border-color 0.2s', borderRadius: 4 }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--dimmer)')}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{job.title}</div>
                      <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 4, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        {job.category && (() => {
                          const sector = getSector(job.category)
                          return <span>{sector?.icon ? `${sector.icon} ` : ''}{job.category}</span>
                        })()}
                        <span>·</span>
                        <span style={{ color: statusColor(job.status) }}>{statusLabel(job.status)}</span>
                        {job.applicationStatus && role === 'provider' && (
                          <><span>·</span><span style={{ color: job.applicationStatus === 'selected' ? '#4caf50' : job.applicationStatus === 'rejected' ? '#ff4444' : 'var(--dim)' }}>
                            {job.applicationStatus}
                          </span></>
                        )}
                        {role === 'client' && job.applicationCount != null && (
                          <><span>·</span><span>{job.applicationCount} Applicant{job.applicationCount !== 1 ? 's' : ''}</span></>
                        )}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>
                        {job.finalBudget ? `${job.finalBudget} USDC` : job.appProposedBudget ? `${job.appProposedBudget} USDC` : job.budgetMin && job.budgetMax ? `${job.budgetMin} – ${job.budgetMax}` : '—'}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--dim)', marginTop: 2 }}>
                        {getTimeAgo(job.completedAt || job.appliedAt || job.createdAt)}
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: '12px 14px', border: '1px solid var(--dimmer)' }}>
      <div style={{ fontSize: 10, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>{value}</div>
    </div>
  )
}

function statusColor(status: string): string {
  switch (status) {
    case 'open': return '#4a9ead'
    case 'assigned': return '#ff9800'
    case 'funded': return '#2196f3'
    case 'in_progress': return '#2196f3'
    case 'delivered': return '#9c27b0'
    case 'evaluating': return '#9c27b0'
    case 'completed': return '#4caf50'
    case 'failed': return '#ff4444'
    case 'rejected': return '#ff4444'
    case 'refunded': return '#4caf50'
    case 'cancelled': return '#666'
    case 'revision_requested': return '#ff9800'
    case 'expired': return '#ff4444'
    default: return 'var(--dim)'
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'open': return 'Open'
    case 'assigned': return 'Assigned'
    case 'funded': return 'Funded'
    case 'in_progress': return 'In Progress'
    case 'delivered': return 'Delivered'
    case 'evaluating': return 'Evaluating'
    case 'completed': return '✓ Completed'
    case 'failed': return '✗ Failed'
    case 'rejected': return '✗ Rejected'
    case 'refunded': return '↩ Refunded'
    case 'cancelled': return 'Cancelled'
    case 'revision_requested': return '⚠ Revision'
    case 'expired': return 'Expired'
    default: return status
  }
}

function getTimeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
