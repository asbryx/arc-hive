import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { useStats } from '@/api/hooks'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

type Tab = 'posted' | 'applications' | 'history'

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
  applicationStatus?: string
  appProposedBudget?: string | null
  appliedAt?: string
  applicationCount?: number
}

export default function Dashboard() {
  const { address, isConnected } = useAccount()
  const { data: stats } = useStats()
  const [tab, setTab] = useState<Tab>('posted')
  const [activeJobs, setActiveJobs] = useState<JobRow[]>([])
  const [historyJobs, setHistoryJobs] = useState<JobRow[]>([])
  const [loading, setLoading] = useState(false)

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

  if (!isConnected) {
    return (
      <div className="page-enter" style={{ padding: '80px 24px', maxWidth: 800, margin: '0 auto', textAlign: 'center', minHeight: 'calc(100vh - 160px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 13, color: 'var(--dim)' }}>Connect wallet to view your dashboard</div>
      </div>
    )
  }

  const myAddr = address?.toLowerCase()
  const posted = activeJobs.filter(j => j.clientAddress?.toLowerCase() === myAddr)
  const applications = activeJobs.filter(j => j.clientAddress?.toLowerCase() !== myAddr)

  const currentList = tab === 'posted' ? posted : tab === 'applications' ? applications : historyJobs

  return (
    <div className="page-enter" style={{ padding: '40px 24px', maxWidth: 800, margin: '0 auto', minHeight: 'calc(100vh - 160px)' }}>
      {/* Header */}
      <div style={{ fontSize: 11, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 24 }}>
        // dashboard
      </div>

      {/* Quick stats */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 32 }}>
          <StatCard label="Network Agents" value={stats.totalAgents.toLocaleString()} />
          <StatCard label="Network Jobs" value={stats.totalJobs.toLocaleString()} />
          <StatCard label="Completed" value={stats.completedJobs.toLocaleString()} />
          <StatCard label="Volume" value={`$${Math.round(parseInt(stats.totalVolume || '0') / 1_000_000).toLocaleString()}`} />
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--dimmer)', marginBottom: 24 }}>
        {([
          { key: 'posted' as Tab, label: 'Posted', count: posted.length },
          { key: 'applications' as Tab, label: 'Applications', count: applications.length },
          { key: 'history' as Tab, label: 'History', count: historyJobs.length },
        ]).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '10px 20px', fontSize: 12, fontWeight: tab === t.key ? 700 : 400,
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: tab === t.key ? 'var(--text)' : 'var(--dim)',
              borderBottom: tab === t.key ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            {t.label} ({t.count})
          </button>
        ))}
      </div>

      {/* Job list */}
      {loading ? (
        <div style={{ fontSize: 12, color: 'var(--dim)' }}>Loading...</div>
      ) : currentList.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--dim)', fontSize: 12 }}>
          {tab === 'posted' ? 'No posted jobs yet.' : tab === 'applications' ? 'No applications yet.' : 'No history yet.'}
          {tab === 'posted' && (
            <div style={{ marginTop: 12 }}>
              <Link to="/post-job" style={{ color: 'var(--accent)', fontSize: 12 }}>+ Post a job</Link>
            </div>
          )}
        </div>
      ) : (
        <div>
          {currentList.map(job => {
            const role = job.clientAddress?.toLowerCase() === myAddr ? 'client' : 'agent'
            return (
              <Link
                key={`${job.id}-${job.applicationStatus || ''}`}
                to={`/marketplace/${job.id}`}
                style={{ textDecoration: 'none', color: 'inherit', display: 'block', marginBottom: 12 }}
              >
                <div style={{ padding: 16, border: '1px solid var(--dimmer)', transition: 'border-color 0.2s' }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--dimmer)')}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{job.title}</div>
                      <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 4, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        {job.category && <span>{job.category}</span>}
                        <span style={{ color: statusColor(job.status) }}>{statusLabel(job.status)}</span>
                        {job.applicationStatus && role === 'agent' && (
                          <span style={{ color: job.applicationStatus === 'selected' ? '#4caf50' : job.applicationStatus === 'rejected' ? '#ff4444' : 'var(--dim)' }}>
                            app: {job.applicationStatus}
                          </span>
                        )}
                        {role === 'client' && job.applicationCount != null && (
                          <span>{job.applicationCount} applicant{job.applicationCount !== 1 ? 's' : ''}</span>
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
    case 'open': return 'var(--dim)'
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
    case 'expired': return '#666'
    default: return 'var(--dim)'
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'open': return 'open'
    case 'assigned': return 'assigned'
    case 'funded': return 'funded'
    case 'in_progress': return 'in progress'
    case 'delivered': return 'delivered'
    case 'evaluating': return 'evaluating'
    case 'completed': return '✓ completed'
    case 'failed': return '✗ failed'
    case 'rejected': return '✗ rejected'
    case 'refunded': return '↩ refunded'
    case 'cancelled': return 'cancelled'
    case 'revision_requested': return '⚠ revision'
    case 'expired': return 'expired'
    default: return status
  }
}

function getTimeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const hours = Math.floor(diff / 3600000)
  if (hours < 1) return 'just now'
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
