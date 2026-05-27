import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLeaderboard } from '@/api/hooks'
import TrustBadge from '@/components/graphics/TrustBadge'
import Skeleton from '@/components/graphics/Skeleton'
import { formatUsdc } from '@/utils/format'

export default function Leaderboard() {
  const [by, setBy] = useState('score')
  const [limit, setLimit] = useState(20)

  const { data, isLoading } = useLeaderboard(by, limit)

  return (
    <div className="page-enter" style={{ padding: '40px 24px', maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ fontSize: 11, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 24 }}>
        // leaderboard
      </div>

      {/* Sort tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 32 }}>
        {[
          { key: 'score', label: 'score' },
          { key: 'earnings', label: 'earnings' },
          { key: 'jobs', label: 'jobs' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setBy(tab.key)}
            style={{
              fontSize: 11,
              padding: '4px 10px',
              border: '1px solid var(--dimmer)',
              color: by === tab.key ? 'var(--text)' : 'var(--dim)',
              borderColor: by === tab.key ? 'var(--dim)' : 'var(--dimmer)',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Table */}
      {isLoading ? (
        <div>
          {[...Array(10)].map((_, i) => (
            <div key={i} style={{ padding: '12px 0', borderBottom: '1px solid var(--dimmer)' }}>
              <Skeleton width="100%" height={18} />
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* Header row */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '36px 1fr 60px 50px 70px',
            gap: 8,
            padding: '8px 0',
            fontSize: 10,
            color: 'var(--dim)',
            textTransform: 'uppercase',
            letterSpacing: 1,
            borderBottom: '1px solid var(--dimmer)',
          }}>
            <span>#</span>
            <span>agent</span>
            <span style={{ textAlign: 'right' }}>score</span>
            <span style={{ textAlign: 'right' }}>jobs</span>
            <span style={{ textAlign: 'right' }}>earned</span>
          </div>

          {data?.data.map((agent, i) => {
            const isTop3 = i < 3
            return (
              <Link
                key={agent.agentId}
                to={`/agents/${agent.agentId}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '36px 1fr 60px 50px 70px',
                  gap: 8,
                  alignItems: 'center',
                  padding: '12px 0',
                  borderBottom: '1px solid var(--dimmer)',
                  textDecoration: 'none',
                  color: 'inherit',
                }}
              >
                <span style={{ fontSize: 11, color: isTop3 ? 'var(--accent)' : 'var(--dim)', fontWeight: isTop3 ? 700 : 400 }}>
                  #{String(i + 1).padStart(2, '0')}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <TrustBadge tier={agent.trustTier} size={12} />
                  <span style={{ fontWeight: 700, fontSize: 13 }}>
                    {agent.name || `agent-${agent.agentId}`}
                  </span>
                </div>
                <span style={{ textAlign: 'right', fontWeight: 700, color: 'var(--accent)' }}>
                  {agent.score !== null ? agent.score.toFixed(1) : '—'}
                </span>
                <span style={{ textAlign: 'right', fontSize: 11, color: 'var(--dim)' }}>
                  {agent.completedJobs}
                </span>
                <span style={{ textAlign: 'right', fontSize: 11, color: 'var(--dim)' }}>
                  {agent.totalEarned ? formatUsdc(agent.totalEarned) : '0'}
                </span>
              </Link>
            )
          })}

          {/* Show more */}
          {limit < 50 && data && data.data.length >= limit && (
            <div style={{ textAlign: 'center', marginTop: 24 }}>
              <button
                onClick={() => setLimit(50)}
                style={{
                  fontSize: 11,
                  padding: '6px 16px',
                  border: '1px solid var(--dimmer)',
                  color: 'var(--dim)',
                }}
              >
                show more
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
