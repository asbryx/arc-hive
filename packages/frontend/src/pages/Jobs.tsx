import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useJobs } from '@/api/hooks'
import StatusPill from '@/components/graphics/StatusPill'
import Skeleton from '@/components/graphics/Skeleton'
import { truncateAddress, formatUsdc } from '@/utils/format'
import { JOB_STATUSES } from '@/utils/constants'
import { explorerAddress } from '@/utils/explorer'

export default function Jobs() {
  const [status, setStatus] = useState('')
  const [sort, setSort] = useState('newest')
  const [page, setPage] = useState(1)

  const params: Record<string, string> = { sort, page: String(page), limit: '20' }
  if (status) params.status = status

  const { data, isLoading } = useJobs(params)

  return (
    <div className="page-enter" style={{ padding: '40px 24px', maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ fontSize: 11, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 24 }}>
        // jobs
      </div>

      {/* Status tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        <button
          onClick={() => { setStatus(''); setPage(1) }}
          style={{
            fontSize: 11,
            padding: '4px 10px',
            border: '1px solid var(--dimmer)',
            color: status === '' ? 'var(--text)' : 'var(--dim)',
            borderColor: status === '' ? 'var(--dim)' : 'var(--dimmer)',
          }}
        >
          all
        </button>
        {JOB_STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => { setStatus(s.toLowerCase()); setPage(1) }}
            style={{
              fontSize: 11,
              padding: '4px 10px',
              border: '1px solid var(--dimmer)',
              color: status === s.toLowerCase() ? 'var(--text)' : 'var(--dim)',
              borderColor: status === s.toLowerCase() ? 'var(--dim)' : 'var(--dimmer)',
            }}
          >
            {s.toLowerCase()}
          </button>
        ))}
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          style={{
            marginLeft: 'auto',
            background: 'var(--bg)',
            border: '1px solid var(--dimmer)',
            color: 'var(--dim)',
            padding: '4px 8px',
            fontSize: 11,
          }}
        >
          <option value="newest">newest</option>
          <option value="oldest">oldest</option>
          <option value="budget_desc">budget ↓</option>
          <option value="budget_asc">budget ↑</option>
        </select>
      </div>

      {/* Job list */}
      {isLoading ? (
        <div>
          {[...Array(8)].map((_, i) => (
            <div key={i} style={{ padding: '12px 0', borderBottom: '1px solid var(--dimmer)' }}>
              <Skeleton width="100%" height={16} />
            </div>
          ))}
        </div>
      ) : (
        <>
          {data && data.data.length === 0 && (
            <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--dim)', fontSize: 12 }}>
              No jobs found
            </div>
          )}

          {/* Table header */}
          {data && data.data.length > 0 && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: '70px 50px 1fr 80px',
              gap: 8,
              padding: '8px 0',
              fontSize: 10,
              color: 'var(--dim)',
              textTransform: 'uppercase',
              letterSpacing: 1,
              borderBottom: '1px solid var(--dimmer)',
            }}>
              <span>status</span>
              <span>id</span>
              <span>client → provider</span>
              <span style={{ textAlign: 'right' }}>budget</span>
            </div>
          )}

          {data?.data.map((job) => (
            <Link
              key={job.jobId}
              to={`/jobs/${job.jobId}`}
              style={{
                display: 'grid',
                gridTemplateColumns: '70px 50px 1fr 80px',
                gap: 8,
                alignItems: 'center',
                padding: '10px 0',
                fontSize: 12,
                borderBottom: '1px solid var(--dimmer)',
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              <StatusPill status={job.status} />
              <span style={{ color: 'var(--dim)' }}>#{job.jobId}</span>
              <div style={{ overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                <a href={explorerAddress(job.client)} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text)', textDecoration: 'underline' }}>
                  {truncateAddress(job.client)}
                </a>
                {job.provider && (
                  <>
                    <span style={{ color: 'var(--dim)', margin: '0 4px' }}>→</span>
                    <a href={explorerAddress(job.provider)} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--dim)', textDecoration: 'underline' }}>
                      {truncateAddress(job.provider)}
                    </a>
                  </>
                )}
              </div>
              <span style={{ textAlign: 'right' }}>
                {job.budget ? `${formatUsdc(job.budget)}` : '—'}
              </span>
            </Link>
          ))}

          {/* Pagination */}
          {data && data.pages && data.pages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 32 }}>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                style={{ fontSize: 11, color: page === 1 ? 'var(--dimmer)' : 'var(--dim)', padding: '4px 8px', border: '1px solid var(--dimmer)' }}
              >
                prev
              </button>
              <span style={{ fontSize: 11, color: 'var(--dim)', padding: '4px 8px' }}>
                {page} / {data.pages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(data.pages!, p + 1))}
                disabled={page === data.pages}
                style={{ fontSize: 11, color: page === data.pages ? 'var(--dimmer)' : 'var(--dim)', padding: '4px 8px', border: '1px solid var(--dimmer)' }}
              >
                next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
