import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { getSector } from '@/lib/sectors'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

type Tab = 'active' | 'history'

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
}

export default function MyJobs() {
  const { address, isConnected } = useAccount()
  const [tab, setTab] = useState<Tab>('active')
  const [jobs, setJobs] = useState<JobRow[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (address) fetchTab(tab)
  }, [address, tab])

  async function fetchTab(t: Tab) {
    if (!address) return
    setLoading(true)
    try {
      const endpoint = t === 'active' ? 'my-active-all' : 'my-history'
      const res = await fetch(`${API_BASE}/open-jobs/${endpoint}?address=${address}`)
      if (res.ok) {
        const data = await res.json()
        setJobs(data.data || [])
      }
    } catch {}
    setLoading(false)
  }

  if (!isConnected) {
    return (
      <div className="page-enter" style={{ padding: '80px 24px', maxWidth: 800, margin: '0 auto' }}>
        <div style={{ fontSize: 12, color: 'var(--dim)' }}>Connect wallet to view your jobs.</div>
      </div>
    )
  }

  return (
    <div className="page-enter" style={{ padding: '80px 24px', maxWidth: 800, margin: '0 auto' }}>
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 24 }}>My Jobs</div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--dimmer)', marginBottom: 24 }}>
        {(['active', 'history'] as Tab[]).map(key => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              padding: '10px 20px', fontSize: 12, fontWeight: tab === key ? 700 : 400,
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: tab === key ? 'var(--text)' : 'var(--dim)',
              borderBottom: tab === key ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            {key === 'active' ? 'Active' : 'History'}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ fontSize: 12, color: 'var(--dim)' }}>Loading...</div>
      ) : jobs.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--dim)' }}>
          {tab === 'active' ? 'No active jobs.' : 'No completed jobs yet.'}
        </div>
      ) : (
        <div>
          {jobs.map(job => {
            const role = job.clientAddress?.toLowerCase() === address?.toLowerCase() ? 'client' : 'agent'
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
                        {job.category && (() => {
                          const sector = getSector(job.category)
                          return <span>{sector?.icon ? `${sector.icon} ` : ''}{job.category}</span>
                        })()}
                        <span style={{ color: statusColor(job.status) }}>{statusLabel(job.status)}</span>
                        <span style={{ fontSize: 9, padding: '1px 5px', border: '1px solid var(--dimmer)', color: 'var(--dim)' }}>
                          {role}
                        </span>
                        {job.applicationStatus && role === 'agent' && (
                          <span style={{ color: job.applicationStatus === 'selected' ? '#4caf50' : job.applicationStatus === 'rejected' ? '#ff4444' : 'var(--dim)' }}>
                            app: {job.applicationStatus}
                          </span>
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
