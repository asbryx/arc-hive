import { Link } from 'react-router-dom'
import type { Agent } from '@/api/client'
import { scoreToBar } from '@/utils/format'

interface Props {
  agents: Agent[]
}

export default function TopAgents({ agents }: Props) {
  if (agents.length === 0) {
    return <div style={{ color: 'var(--dim)', fontSize: 12 }}>Loading agents...</div>
  }

  return (
    <div>
      {agents.map((agent, i) => (
        <Link
          key={agent.agentId}
          to={`/agents/${agent.agentId}`}
          style={{
            display: 'grid',
            gridTemplateColumns: '50px 1fr 80px 80px',
            gap: 16,
            alignItems: 'center',
            padding: '12px 0',
            borderBottom: '1px solid var(--dimmer)',
            textDecoration: 'none',
            color: 'inherit',
            transition: 'background 0.1s',
          }}
        >
          <div style={{ fontSize: 11, color: 'var(--dim)' }}>
            #{String(i + 1).padStart(2, '0')}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13 }}>
              {agent.name || `agent-${agent.agentId}`}
            </div>
            <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 2 }}>
              {agent.capabilities?.slice(0, 2).join(', ') || 'no capabilities listed'}
            </div>
          </div>
          <div style={{ textAlign: 'right', fontWeight: 700 }}>
            {agent.score !== null ? agent.score.toFixed(1) : '—'}
            <div style={{ fontSize: 10, color: 'var(--dim)', marginTop: 2 }}>
              {scoreToBar(agent.score)}
            </div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--dim)' }}>
            {agent.completedJobs} jobs
          </div>
        </Link>
      ))}
    </div>
  )
}
