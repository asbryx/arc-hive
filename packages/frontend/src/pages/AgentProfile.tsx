import { useParams } from 'react-router-dom'
import { useAgent, useAgentReputation, useAgentJobs } from '@/api/hooks'
import ScoreRadial from '@/components/graphics/ScoreRadial'
import TrustBadge from '@/components/graphics/TrustBadge'
import StatusPill from '@/components/graphics/StatusPill'
import AsciiBar from '@/components/graphics/AsciiBar'
import Skeleton from '@/components/graphics/Skeleton'
import { truncateAddress, timeAgo, formatUsdc } from '@/utils/format'
import { TRUST_TIERS } from '@/utils/constants'
import { explorerAddress, explorerTx } from '@/utils/explorer'

export default function AgentProfile() {
  const { id } = useParams<{ id: string }>()
  const { data: agent, isLoading } = useAgent(id!)
  const { data: reputation } = useAgentReputation(id!)
  const { data: jobs } = useAgentJobs(id!)

  if (isLoading || !agent) {
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
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 24, marginBottom: 40 }}>
        <ScoreRadial score={agent.score.average} size={72} strokeWidth={5} />
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>
            {agent.name || `agent-${agent.agentId}`}
          </h1>
          <div style={{ fontSize: 12, color: 'var(--dim)', marginBottom: 8 }}>
            <a href={explorerAddress(agent.owner)} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--dim)', textDecoration: 'underline' }}>
              {truncateAddress(agent.owner, 6)}
            </a> · registered {timeAgo(agent.registeredAt)}
          </div>
          {agent.description && (
            <p style={{ fontSize: 13, color: 'var(--dim)', marginBottom: 12 }}>{agent.description}</p>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <TrustBadge tier={agent.trustTier} size={14} />
            <span style={{ fontSize: 11, color: 'var(--dim)' }}>{TRUST_TIERS[agent.trustTier]}</span>
          </div>
        </div>
      </div>

      {/* Score Breakdown */}
      <section style={{ marginBottom: 40 }}>
        <div style={{ fontSize: 11, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 16, borderBottom: '1px solid var(--dimmer)', paddingBottom: 8 }}>
          // score
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 1, background: 'var(--dimmer)' }}>
          <div style={{ padding: 16, background: 'var(--bg)' }}>
            <div style={{ fontSize: 10, color: 'var(--dim)', textTransform: 'uppercase', marginBottom: 4 }}>Average</div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{agent.score.average?.toFixed(1) ?? '—'}</div>
          </div>
          <div style={{ padding: 16, background: 'var(--bg)' }}>
            <div style={{ fontSize: 10, color: 'var(--dim)', textTransform: 'uppercase', marginBottom: 4 }}>Feedback</div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{agent.score.totalFeedback}</div>
          </div>
          <div style={{ padding: 16, background: 'var(--bg)' }}>
            <div style={{ fontSize: 10, color: 'var(--dim)', textTransform: 'uppercase', marginBottom: 4 }}>Raters</div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{agent.score.uniqueRaters}</div>
          </div>
          <div style={{ padding: 16, background: 'var(--bg)' }}>
            <div style={{ fontSize: 10, color: 'var(--dim)', textTransform: 'uppercase', marginBottom: 4 }}>Completion</div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>
              {agent.score.completionRate !== null ? `${(agent.score.completionRate * 100).toFixed(0)}%` : '—'}
            </div>
          </div>
        </div>
      </section>

      {/* Capabilities */}
      {agent.capabilities.length > 0 && (
        <section style={{ marginBottom: 40 }}>
          <div style={{ fontSize: 11, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 16, borderBottom: '1px solid var(--dimmer)', paddingBottom: 8 }}>
            // capabilities
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {agent.capabilities.map((cap) => (
              <span key={cap} style={{
                fontSize: 11,
                padding: '4px 10px',
                border: '1px solid var(--dimmer)',
                color: 'var(--dim)',
              }}>
                {cap}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Jobs */}
      <section style={{ marginBottom: 40 }}>
        <div style={{ fontSize: 11, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 16, borderBottom: '1px solid var(--dimmer)', paddingBottom: 8 }}>
          // jobs ({agent.jobs.total})
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 1, background: 'var(--dimmer)', marginBottom: 16 }}>
          <div style={{ padding: 12, background: 'var(--bg)', fontSize: 11 }}>
            <span style={{ color: 'var(--dim)' }}>completed </span>{agent.jobs.completed}
          </div>
          <div style={{ padding: 12, background: 'var(--bg)', fontSize: 11 }}>
            <span style={{ color: 'var(--dim)' }}>rejected </span>{agent.jobs.rejected}
          </div>
          <div style={{ padding: 12, background: 'var(--bg)', fontSize: 11 }}>
            <span style={{ color: 'var(--dim)' }}>earned </span>{agent.jobs.totalEarned || '0'} USDC
          </div>
        </div>

        {jobs?.data && jobs.data.length > 0 && (
          <div>
            {jobs.data.slice(0, 10).map((job) => (
              <div key={job.jobId} style={{
                display: 'grid',
                gridTemplateColumns: '90px 1fr 80px',
                gap: 12,
                alignItems: 'center',
                padding: '8px 0',
                fontSize: 12,
                borderBottom: '1px solid var(--dimmer)',
              }}>
                <StatusPill status={job.status} />
                <span>Job #{job.jobId}</span>
                <span style={{ textAlign: 'right', color: 'var(--dim)' }}>
                  {job.budget ? `${formatUsdc(job.budget)} USDC` : '—'}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Reputation Timeline */}
      <section style={{ marginBottom: 40 }}>
        <div style={{ fontSize: 11, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 16, borderBottom: '1px solid var(--dimmer)', paddingBottom: 8 }}>
          // reputation events
        </div>
        {reputation?.data && reputation.data.length > 0 ? (
          <div>
            {reputation.data.map((event, i) => (
              <div key={i} style={{
                padding: '10px 0',
                borderBottom: '1px solid var(--dimmer)',
                fontSize: 12,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <div>
                  <a href={explorerAddress(event.clientAddress)} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--dim)', textDecoration: 'underline' }}>
                    {truncateAddress(event.clientAddress)}
                  </a>
                  <span style={{ margin: '0 8px' }}>→</span>
                  <span style={{ fontWeight: 700 }}>{event.value > 0 ? '+' : ''}{event.value}</span>
                  {event.tag1 && <span style={{ color: 'var(--dim)', marginLeft: 8 }}>[{event.tag1}]</span>}
                </div>
                <a href={explorerTx(event.txHash)} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--dim)', fontSize: 11, textDecoration: 'underline' }}>
                  {timeAgo(event.timestamp)}
                </a>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ color: 'var(--dim)', fontSize: 12 }}>No reputation events yet</div>
        )}
      </section>
    </div>
  )
}
