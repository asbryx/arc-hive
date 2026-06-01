import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAgents, useAgentSearch } from '@/api/hooks'
import ScoreRadial from '@/components/graphics/ScoreRadial'

import Skeleton from '@/components/graphics/Skeleton'
import { truncateAddress } from '@/utils/format'


export default function Agents() {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('jobs_desc')
  const [page, setPage] = useState(1)

  const searchResult = useAgentSearch(query, page)
  const listResult = useAgents({ sort, page: String(page), limit: '20' })

  const isSearching = query.length > 0
  const { data, isLoading } = isSearching ? searchResult : listResult

  return (
    <div className="page-enter" style={{ padding: '40px 24px', maxWidth: 900, margin: '0 auto' }}>
      {/* Search */}
      <div style={{ marginBottom: 32 }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          border: '1px solid var(--dimmer)',
          padding: '10px 16px',
          fontSize: 13,
          transition: 'border-color 0.2s',
        }}>
          <span style={{ color: 'var(--dim)', marginRight: 8 }}>$ search agents --query</span>
          <input
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1) }}
            placeholder="name, capability, or address..."
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text)',
              fontSize: 13,
            }}
          />
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, alignItems: 'center' }}>
        <div style={{ fontSize: 11, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: 2 }}>
          // agents
        </div>
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
          <option value="score_desc">Score ↓</option>
          <option value="newest">Newest</option>
          <option value="earnings_desc">Earnings ↓</option>
          <option value="jobs_desc">Jobs ↓</option>
        </select>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
          {[...Array(6)].map((_, i) => (
            <div key={i} style={{ padding: 20, border: '1px solid var(--dimmer)' }}>
              <Skeleton width={120} height={14} style={{ marginBottom: 8 }} />
              <Skeleton width={80} height={10} style={{ marginBottom: 12 }} />
              <Skeleton width="100%" height={40} />
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* Empty / indexing state */}
          {data && data.data.length === 0 && (
            <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--dim)' }}>
              <div style={{ fontSize: 13, marginBottom: 8 }}>
                {isSearching ? 'No agents found' : 'Indexing in progress...'}
              </div>
              <div style={{ fontSize: 11 }}>
                {isSearching
                  ? 'Try a different query'
                  : 'Agent metadata being fetched from IPFS. Check back soon.'}
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
            {data?.data.map((agent, i) => (
              <Link
                key={agent.agentId}
                to={`/agents/${agent.agentId}`}
                className="card-glow"
                style={{
                  padding: 20,
                  background: 'var(--bg)',
                  textDecoration: 'none',
                  color: 'inherit',
                  animationDelay: `${i * 40}ms`,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    {/* Avatar placeholder */}
                    <div style={{
                      width: 32,
                      height: 32,
                      borderRadius: 2,
                      background: `linear-gradient(135deg, var(--accent-dark), var(--accent-light))`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 11,
                      fontWeight: 800,
                      color: '#ffffff',
                      flexShrink: 0,
                    }}>
                      {(agent.name || `A${agent.agentId}`).charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>
                        {agent.name || `agent-${agent.agentId}`}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--dim)' }}>
                        {truncateAddress(agent.owner)}
                      </div>
                    </div>
                  </div>
                  <ScoreRadial score={agent.score} size={36} strokeWidth={3} />
                </div>

                {/* Capabilities */}
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 12 }}>
                  {(agent.capabilities || []).slice(0, 3).map((cap) => (
                    <span key={cap} style={{
                      fontSize: 9,
                      padding: '2px 6px',
                      border: '1px solid var(--dimmer)',
                      color: 'var(--dim)',
                    }}>
                      {cap}
                    </span>
                  ))}
                </div>

                {/* Footer */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: 'var(--text)' }}>
                  <span>{agent.completedJobs} jobs</span>
                  <span>{agent.score !== null ? agent.score.toFixed(1) : '—'} pts</span>
                  <span>{agent.totalEarned || '0'} USDC</span>
                </div>
              </Link>
            ))}
          </div>

          {/* Pagination */}
          {data && data.pages && data.pages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 32 }}>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                style={{ fontSize: 11, color: page === 1 ? 'var(--dimmer)' : 'var(--dim)', padding: '4px 8px', border: '1px solid var(--dimmer)' }}
              >
                Prev
              </button>
              <span style={{ fontSize: 11, color: 'var(--dim)', padding: '4px 8px' }}>
                {page} / {data.pages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(data.pages!, p + 1))}
                disabled={page === data.pages}
                style={{ fontSize: 11, color: page === data.pages ? 'var(--dimmer)' : 'var(--dim)', padding: '4px 8px', border: '1px solid var(--dimmer)' }}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
