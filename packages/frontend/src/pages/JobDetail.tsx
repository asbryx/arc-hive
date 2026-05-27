import { useParams, Link } from 'react-router-dom'
import { useJob } from '@/api/hooks'
import StatusPill from '@/components/graphics/StatusPill'
import Skeleton from '@/components/graphics/Skeleton'
import { truncateAddress, timeAgo, formatUsdc } from '@/utils/format'
import { explorerAddress, explorerTx } from '@/utils/explorer'

export default function JobDetail() {
  const { id } = useParams<{ id: string }>()
  const { data: job, isLoading } = useJob(id!)

  if (isLoading || !job) {
    return (
      <div className="page-enter" style={{ padding: '40px 24px', maxWidth: 900, margin: '0 auto' }}>
        <Skeleton width={200} height={24} style={{ marginBottom: 16 }} />
        <Skeleton width={300} height={14} style={{ marginBottom: 32 }} />
        <Skeleton width="100%" height={120} />
      </div>
    )
  }

  return (
    <div className="page-enter" style={{ padding: '40px 24px', maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <StatusPill status={job.status} />
        <h1 style={{ fontSize: 20, fontWeight: 800 }}>Job #{job.jobId}</h1>
      </div>

      {/* Description */}
      {job.description && (
        <div style={{
          padding: '16px 20px',
          background: 'var(--dimmer)',
          borderLeft: '3px solid var(--accent)',
          marginBottom: 32,
          fontSize: 13,
          lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}>
          {job.description}
        </div>
      )}

      {/* Info grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 1, background: 'var(--dimmer)', marginBottom: 32 }}>
        <div style={{ padding: 16, background: 'var(--bg)' }}>
          <div style={{ fontSize: 10, color: 'var(--dim)', textTransform: 'uppercase', marginBottom: 4 }}>Budget</div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{job.budget ? `${formatUsdc(job.budget)} USDC` : '—'}</div>
        </div>
        <div style={{ padding: 16, background: 'var(--bg)' }}>
          <div style={{ fontSize: 10, color: 'var(--dim)', textTransform: 'uppercase', marginBottom: 4 }}>Status</div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{job.status}</div>
        </div>
        <div style={{ padding: 16, background: 'var(--bg)' }}>
          <div style={{ fontSize: 10, color: 'var(--dim)', textTransform: 'uppercase', marginBottom: 4 }}>Created</div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{timeAgo(job.createdAt)}</div>
        </div>
        {job.completedAt && (
          <div style={{ padding: 16, background: 'var(--bg)' }}>
            <div style={{ fontSize: 10, color: 'var(--dim)', textTransform: 'uppercase', marginBottom: 4 }}>Completed</div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{timeAgo(job.completedAt)}</div>
          </div>
        )}
      </div>

      {/* Parties */}
      <section style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 11, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 16 }}>
          // parties
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--dimmer)' }}>
            <span style={{ fontSize: 11, color: 'var(--dim)' }}>Client</span>
            <a href={explorerAddress(job.client)} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text)', textDecoration: 'underline', fontSize: 13 }}>
              {truncateAddress(job.client, 6)}
            </a>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--dimmer)' }}>
            <span style={{ fontSize: 11, color: 'var(--dim)' }}>Provider</span>
            {job.provider ? (
              <a href={explorerAddress(job.provider)} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text)', textDecoration: 'underline', fontSize: 13 }}>
                {truncateAddress(job.provider, 6)}
              </a>
            ) : (
              <span style={{ color: 'var(--dim)', fontSize: 13 }}>unassigned</span>
            )}
          </div>
          {job.providerAgentId && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--dimmer)' }}>
              <span style={{ fontSize: 11, color: 'var(--dim)' }}>Agent</span>
              <Link to={`/agents/${job.providerAgentId}`} style={{ color: 'var(--text)', textDecoration: 'underline', fontSize: 13 }}>
                agent-{job.providerAgentId}
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* On-chain */}
      <section style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 11, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 16 }}>
          // on-chain
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(() => {
            // Show status-relevant tx prominently
            const statusTxMap: Record<string, string> = {
              Completed: 'JobCompleted',
              Submitted: 'JobSubmitted',
              Rejected: 'JobRejected',
              Funded: 'JobFunded',
            }
            const targetEvent = statusTxMap[job.status]
            const relevantTx = job.timeline?.find((e: any) => e.event === targetEvent)?.txHash
            if (relevantTx && relevantTx !== job.createdTx) {
              return (
                <a href={explorerTx(relevantTx)} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: 'var(--text)', textDecoration: 'underline' }}>
                  → view {job.status.toLowerCase()} tx on arcscan
                </a>
              )
            }
            return null
          })()}
          {job.createdTx && (
            <a href={explorerTx(job.createdTx)} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: 'var(--dim)', textDecoration: 'underline' }}>
              → view creation tx on arcscan
            </a>
          )}
          <a href={explorerAddress('0x0747EEf0706327138c69792bF28Cd525089e4583')} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: 'var(--dim)', textDecoration: 'underline' }}>
            → view contract on arcscan
          </a>
          {job.deliverableHash && (
            <span style={{ fontSize: 12, color: 'var(--dim)' }}>
              deliverable: {job.deliverableHash.slice(0, 16)}...
            </span>
          )}
        </div>
      </section>

      {/* Timeline */}
      {job.timeline && job.timeline.length > 0 && (
        <section style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 11, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 16 }}>
            // timeline
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {job.timeline.map((event: any, i: number) => (
              <div key={i} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--dimmer)', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--accent)', minWidth: 100 }}>{event.event}</span>
                <span style={{ fontSize: 11, color: 'var(--dim)', flex: 1 }}>{timeAgo(event.timestamp)}</span>
                {event.txHash && (
                  <a href={explorerTx(event.txHash)} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: 'var(--dim)', textDecoration: 'underline' }}>
                    tx ↗
                  </a>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
