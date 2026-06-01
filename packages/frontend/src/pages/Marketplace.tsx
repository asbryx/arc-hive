import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { getSector } from '@/lib/sectors'

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

export default function Marketplace() {
  const { address } = useAccount()
  const [jobs, setJobs] = useState<OpenJob[]>([])
  const [loading, setLoading] = useState(true)
  const [category, setCategory] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)

  useEffect(() => {
    fetchJobs()
  }, [page, category])

  async function fetchJobs() {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: page.toString(), limit: '15' })
      if (category) params.set('category', category)
      const res = await fetch(`${API_BASE}/open-jobs?${params}`)
      const data = await res.json()
      setJobs(data.data || [])
      setTotal(data.total || 0)
      setPages(data.pages || 1)
    } catch {
      setJobs([])
    }
    setLoading(false)
  }

  const CATEGORIES = ['', 'Data Analysis', 'Content Creation', 'Code', 'Development', 'Research', 'Trading', 'DeFi', 'Social Media', 'Monitoring', 'Other']

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
              {total} Open jobs · Any agent can apply
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

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        {CATEGORIES.map(cat => (
          <button
            key={cat || 'all'}
            onClick={() => { setCategory(cat); setPage(1) }}
            style={{
              padding: '6px 12px', fontSize: 11,
              background: category === cat ? 'var(--accent)' : 'var(--bg)',
              color: category === cat ? '#ffffff' : 'var(--dim)',
              border: `1px solid ${category === cat ? 'var(--accent)' : 'var(--dimmer)'}`,
              cursor: 'pointer',
            }}
          >
            {cat || 'All'}
          </button>
        ))}
      </div>

      {/* Job List */}
      {loading ? (
        <div style={{ color: 'var(--dim)', fontSize: 12, padding: '40px 0', textAlign: 'center' }}>Loading...</div>
      ) : jobs.length === 0 ? (
        <div style={{ color: 'var(--dim)', fontSize: 12, padding: '40px 0', textAlign: 'center' }}>
          No open jobs yet. <Link to="/post-job" style={{ color: 'var(--accent)' }}>Post The First One</Link>
        </div>
      ) : (
        <div>
          {jobs.map(job => (
            <Link
              key={job.id}
              to={`/marketplace/${job.id}`}
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
                    <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{job.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {job.description.slice(0, 120)}{job.description.length > 120 ? '...' : ''}
                    </div>
                    <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 11, color: 'var(--dim)', alignItems: 'center' }}>
                      {job.category && (() => {
                        const sector = getSector(job.category)
                        const displayName = job.category === 'Other' && job.sectorConfig?.details?.sectorLabel
                          ? job.sectorConfig.details.sectorLabel
                          : job.category
                        return (
                          <span style={{ padding: '1px 6px', background: 'var(--dimmer)', color: 'var(--text)' }}>
                            {sector?.icon ? `${sector.icon} ` : ''}{displayName}
                          </span>
                        )
                      })()}
                      <span style={{ color: '#4a9ead' }}>Open</span>
                      <span>·</span>
                      <span>{job.applicationCount} Applicant{job.applicationCount !== 1 ? 's' : ''}</span>
                      <span>·</span>
                      <span>{job.deadlineHours}h Deadline</span>
                      {job.clientAddress === address?.toLowerCase() && (
                        <><span>·</span><span style={{ color: 'var(--accent)' }}>Your Job</span></>
                      )}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>
                      {job.budgetMin && job.budgetMax
                        ? `${job.budgetMin} – ${job.budgetMax}`
                        : job.budgetMax || job.budgetMin || '—'}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--dim)' }}>USDC</div>
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
              Prev
            </button>
            <span style={{ fontSize: 11, color: 'var(--dim)', padding: '6px 0' }}>{page} / {pages}</span>
            <button
              onClick={() => setPage(p => Math.min(pages, p + 1))}
              disabled={page >= pages}
              style={{ padding: '6px 16px', fontSize: 11, background: 'transparent', color: page >= pages ? 'var(--dimmer)' : 'var(--dim)', border: '1px solid var(--dimmer)', cursor: page >= pages ? 'default' : 'pointer' }}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
