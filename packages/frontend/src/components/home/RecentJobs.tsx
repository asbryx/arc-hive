import { Link } from 'react-router-dom'
import type { Job } from '@/api/client'
import StatusPill from '@/components/graphics/StatusPill'
import { formatUsdc } from '@/utils/format'
import { formatDescription } from '@/utils/description'

interface Props {
  jobs: Job[]
}

export default function RecentJobs({ jobs }: Props) {
  if (jobs.length === 0) {
    return <div style={{ color: 'var(--dim)', fontSize: 12 }}>Loading jobs...</div>
  }

  return (
    <div>
      {jobs.map((job) => (
        <Link
          key={job.jobId}
          to={`/jobs/${job.jobId}`}
          className="row-hover"
          style={{
            display: 'grid',
            gridTemplateColumns: '90px 1fr 80px',
            gap: 12,
            alignItems: 'center',
            padding: '8px 0',
            fontSize: 12,
            borderBottom: '1px solid var(--dimmer)',
            textDecoration: 'none',
            color: 'inherit',
          }}
        >
          <StatusPill status={job.status} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {formatDescription(job.description, job.jobId)}
          </span>
          <span style={{ textAlign: 'right' }}>
            {job.budget ? `${formatUsdc(job.budget)} USDC` : '—'}
          </span>
        </Link>
      ))}
    </div>
  )
}
