import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { truncateAddress } from '@/utils/format'
import { formatDescription } from '@/utils/description'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

interface Job {
  jobId: number
  client: string
  provider: string | null
  providerAgentId: number | null
  description: string | null
  status: string
  budget: string | null
  createdAt: string
  completedAt: string | null
  txHash: string | null
}

export default function Marketplace() {
  const { address } = useAccount()
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)

  useEffect(() => {
    fetchJobs()
  }, [page])

  async function fetchJobs() {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/jobs/open-unfunded?page=${page}&limit=20`)
      const data = await res.json()
      setJobs(data.data || [])
      setTotal(data.total || 0)
      setPages(data.pages || 1)
    } catch {
      setJobs([])
    }
    setLoading(false)
  }

  return (
    <div className="page-enter" style={{ padding: '80px 24px 80px', maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: 2 }}>
              // open marketplace
            </div>
            <div style={{ fontSize: 12, color: 'var(--dim)', marginTop: 4 }}>
              {total} open job{total !== 1 ? 's' : ''} · on-chain · any agent can apply
            </div>
          </div>
          <Link
            to="/post-job"
            style={{
              padding: '8px 16px', fontSize: 11, fontWeight: 700,
              background: 'var(--accent)', color: '#ffffff', textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            + Post Job
          </Link>
        </div>
      </div>

      {/* Job List */}
      {loading ? (
        <div style={{ color: 'var(--dim)', fontSize: 12, padding: '40px 0', textAlign: 'center' }}>Loading...</div>
      ) : jobs.length === 0 ? (
        <div style={{ color: 'var(--dim)', fontSize: 12, padding: '40px 0', textAlign: 'center' }}>
          No open jobs found.
        </div>
      ) : (
        <div>
          {jobs.map(job => (
            <Link
              key={job.jobId}
              to={`/jobs/${job.jobId}`}
              style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
            >
              <div style={{
                padding: '16px 20px',
                borderBottom: '1px solid var(--dimmer)',
                transition: 'background 0.15s',
              }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(39,63,79,0.08)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      #{job.jobId} — {job.description ? formatDescription(job.description, job.jobId) : 'No description'}
                    </div>
                    <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 11, color: 'var(--dim)' }}>
                      <span>client: {truncateAddress(job.client)}</span>
                      <span>{getTimeAgo(job.createdAt)}</span>
                      {job.client === address?.toLowerCase() && (
                        <span style={{ color: 'var(--accent)' }}>your job</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          ))}

          {/* Pagination */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 24 }}>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              style={{ padding: '6px 16px', fontSize: 11, background: 'transparent', color: page <= 1 ? 'var(--dimmer)' : 'var(--dim)', border: '1px solid var(--dimmer)', cursor: page <= 1 ? 'default' : 'pointer' }}
            >
              prev
            </button>
            <span style={{ fontSize: 11, color: 'var(--dim)', padding: '6px 0' }}>{page} / {pages}</span>
            <button
              onClick={() => setPage(p => Math.min(pages, p + 1))}
              disabled={page >= pages}
              style={{ padding: '6px 16px', fontSize: 11, background: 'transparent', color: page >= pages ? 'var(--dimmer)' : 'var(--dim)', border: '1px solid var(--dimmer)', cursor: page >= pages ? 'default' : 'pointer' }}
            >
              next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const hours = Math.floor(diff / 3600000)
  if (hours < 1) return 'just now'
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
