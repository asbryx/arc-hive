import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { useAgent, useAgentReputation, useAgentJobs } from '@/api/hooks'
import { timeAgo, formatUsdc } from '@/utils/format'
import { TRUST_TIERS } from '@/utils/constants'
import { explorerAddress, explorerTx } from '@/utils/explorer'
import { safeHref, safeImageSrc } from '@/utils/safeUrl'
import BroadsheetHeader from '@/components/broadsheet/BroadsheetHeader'
import Cartouche from '@/components/broadsheet/Cartouche'
import Sparkline from '@/components/broadsheet/Sparkline'
import SettledLedger, { type SettledRow } from '@/components/broadsheet/SettledLedger'
import { Button } from '@/components/ui/Button'
import { CopyableAddress } from '@/components/ui/CopyableAddress'
import { Skeleton } from '@/components/ui/Skeleton'
import { StatusPill } from '@/components/ui/StatusPill'

export default function AgentProfile() {
  const { id } = useParams<{ id: string }>()
  const { isConnected } = useAccount()
  const { data: agent, isLoading } = useAgent(id!)
  const { data: reputation } = useAgentReputation(id!)
  const { data: jobs } = useAgentJobs(id!)
  const [portfolio, setPortfolio] = useState<any[]>([])

  useEffect(() => {
    if (id) {
      fetch(`/api/agents/${id}/portfolio`)
        .then(r => r.json())
        .then(data => setPortfolio(data.data || []))
        .catch(() => {})
    }
  }, [id])

  if (isLoading || !agent) {
    return (
      <div className="page-enter" style={{ padding: 'var(--s-7) var(--gutter)' }}>
        <Skeleton lines={1} height={48} />
        <div style={{ height: 16 }} />
        <Skeleton lines={4} height={16} />
      </div>
    )
  }

  const repArr = reputation?.data ?? []
  const sparkData = repArr.slice(0, 28).map(e => Math.max(0, Number(e.value ?? 0))).reverse()

  const ledgerRows: SettledRow[] = (jobs?.data ?? []).slice(0, 12).map(j => ({
    id: j.jobId,
    ts: timeAgo(j.createdAt ?? new Date().toISOString()),
    brief: j.description || `Job #${j.jobId}`,
    amount: j.budget ? `${formatUsdc(j.budget)} USDC` : '—',
    phase: j.status === 'completed' ? 'settled'
         : j.status === 'rejected' || j.status === 'expired' ? 'cancelled'
         : j.status === 'submitted' ? 'delivering'
         : j.status === 'funded' || j.status === 'in_progress' ? 'executing'
         : 'idle',
    href: `/marketplace/${j.jobId}`,
  }))

  return (
    <div className="page-enter">
      <BroadsheetHeader
        eyebrow={`agent · ${TRUST_TIERS[agent.trustTier]}`}
        title={<><em>{agent.name || `agent-${agent.agentId}`}</em></>}
        strap={
          <>
            <CopyableAddress addr={agent.owner} truncate={false} />
            {' · '}registered {timeAgo(agent.registeredAt)}
            {' · '}<a href={explorerAddress(agent.owner)} target="_blank" rel="noopener noreferrer" style={{ borderBottom: '1px dotted var(--ink-3)' }}>arcscan ↗</a>
          </>
        }
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 7fr) minmax(0, 5fr)',
          gap: 'var(--s-6)',
          padding: 'var(--s-6) var(--gutter) var(--s-14)',
          alignItems: 'flex-start',
        }}
        data-agent-grid
      >
        {/* Left column: prose + ledger */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-7)' }}>
          {agent.description && (
            <p
              style={{
                fontFamily: 'var(--serif)',
                fontSize: 'var(--t-h4)',
                lineHeight: 1.4,
                color: 'var(--ink)',
                fontWeight: 300,
                fontVariationSettings: "'wght' 300, 'opsz' 36",
                maxWidth: 'var(--max-prose)',
              }}
            >
              {agent.description}
            </p>
          )}

          {/* Activity sparkline */}
          {sparkData.length > 0 && (
            <section>
              <div className="caps" style={{ marginBottom: 'var(--s-3)' }}>— activity (recent reputation events) —</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--s-5)' }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 'var(--t-h2)', fontWeight: 500, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>
                  {agent.score.average?.toFixed(1) ?? '—'}
                </div>
                <Sparkline data={sparkData} phase="marsh" width={220} height={36} filled />
              </div>
            </section>
          )}

          {/* Score breakdown table */}
          <section>
            <div className="caps" style={{ marginBottom: 'var(--s-3)' }}>— score breakdown —</div>
            <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(2, auto 1fr)', gap: '8px 24px', fontFamily: 'var(--mono)', fontSize: 'var(--t-meta)' }}>
              <Stat k="average"     v={agent.score.average?.toFixed(2) ?? '—'} />
              <Stat k="feedback"    v={String(agent.score.totalFeedback)} />
              <Stat k="raters"      v={String(agent.score.uniqueRaters)} />
              <Stat k="completion"  v={agent.score.completionRate !== null ? `${(agent.score.completionRate * 100).toFixed(0)}%` : '—'} />
              <Stat k="jobs total"     v={String(agent.jobs.total)} />
              <Stat k="jobs settled"   v={String(agent.jobs.completed)} />
              <Stat k="jobs rejected"  v={String(agent.jobs.rejected)} />
              <Stat k="earned"      v={`${agent.jobs.totalEarned || '0'} USDC`} />
            </dl>
          </section>

          {/* Ledger of jobs */}
          {ledgerRows.length > 0 && (
            <section>
              <div className="caps" style={{ marginBottom: 'var(--s-3)' }}>— ledger of {agent.jobs.total} jobs —</div>
              <SettledLedger rows={ledgerRows} />
            </section>
          )}

          {/* Reputation events */}
          {repArr.length > 0 && (
            <section>
              <div className="caps" style={{ marginBottom: 'var(--s-3)' }}>— reputation events —</div>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column' }}>
                {repArr.slice(0, 14).map((event, i) => (
                  <li
                    key={i}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'auto 1fr auto',
                      gap: 'var(--s-3)',
                      padding: '8px 0',
                      borderBottom: '1px solid var(--rule)',
                      fontFamily: 'var(--mono)',
                      fontSize: 'var(--t-mono-sm)',
                      alignItems: 'center',
                    }}
                  >
                    <CopyableAddress addr={event.clientAddress} />
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontVariantNumeric: 'tabular-nums' }}>
                      <span style={{ color: 'var(--ink-3)' }}>→</span>
                      <span style={{ color: event.value > 0 ? 'var(--marsh)' : event.value < 0 ? 'var(--hot)' : 'var(--ink-2)', fontWeight: 500 }}>
                        {event.value > 0 ? '+' : ''}{event.value}
                      </span>
                      {event.tag1 && <span style={{ color: 'var(--ink-3)' }}>[{event.tag1}]</span>}
                    </span>
                    <a href={explorerTx(event.txHash)} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--ink-3)', borderBottom: '1px dotted var(--ink-3)' }}>
                      {timeAgo(event.timestamp)}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Portfolio */}
          {portfolio.length > 0 && (
            <section>
              <div className="caps" style={{ marginBottom: 'var(--s-3)' }}>— portfolio —</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 'var(--s-4)' }}>
                {portfolio.map(item => {
                  const itemImage = safeImageSrc(item.image_url)
                  const itemHref = safeHref(item.url)
                  return (
                    <article key={item.id} style={{ border: '1px solid var(--rule-2)', padding: 'var(--s-4)', background: 'var(--paper)' }}>
                      {itemImage && (
                        <img src={itemImage} alt={item.title || ''} style={{ width: '100%', height: 120, objectFit: 'cover', marginBottom: 8 }} />
                      )}
                      <h4 style={{ fontFamily: 'var(--serif)', fontSize: 'var(--t-meta)', fontWeight: 400, fontStyle: 'italic' }}>{item.title}</h4>
                      {item.description && (
                        <p style={{ fontFamily: 'var(--serif)', fontSize: 'var(--t-mono-sm)', color: 'var(--ink-2)', marginTop: 4 }}>{item.description}</p>
                      )}
                      {item.category && (
                        <span className="caps" style={{ marginTop: 6, display: 'inline-block', border: '1px solid var(--rule-2)', padding: '2px 6px' }}>{item.category}</span>
                      )}
                      {itemHref && (
                        <a href={itemHref} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', marginTop: 8, fontFamily: 'var(--mono)', fontSize: 'var(--t-mono-sm)', color: 'var(--ink)', borderBottom: '1px dotted var(--ink-3)' }}>view ↗</a>
                      )}
                    </article>
                  )
                })}
              </div>
            </section>
          )}
        </div>

        {/* Right column: cartouche manifest + capabilities + CTA */}
        <aside style={{ position: 'sticky', top: 'calc(var(--nav-height) + 24px)', display: 'flex', flexDirection: 'column', gap: 'var(--s-5)' }}>
          <Cartouche
            title={<>{agent.name || `agent-${agent.agentId}`}</>}
            subtitle={TRUST_TIERS[agent.trustTier]}
            rows={[
              { k: 'address', v: <CopyableAddress addr={agent.owner} /> },
              { k: 'agent #', v: <span className="num">{agent.agentId}</span> },
              { k: 'score',   v: <span className="num">{agent.score.average?.toFixed(2) ?? '—'}</span> },
              { k: 'jobs',    v: <span className="num">{agent.jobs.total}</span> },
              { k: 'earned',  v: <span className="num">{agent.jobs.totalEarned || '0'} USDC</span> },
            ]}
          />

          {agent.capabilities.length > 0 && (
            <section>
              <div className="caps" style={{ marginBottom: 'var(--s-2)' }}>— capabilities —</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {agent.capabilities.map((cap) => (
                  <span
                    key={cap}
                    style={{
                      fontFamily: 'var(--mono)',
                      fontSize: 'var(--t-mono-sm)',
                      letterSpacing: '0.10em',
                      textTransform: 'uppercase',
                      padding: '4px 10px',
                      border: '1px solid var(--rule-2)',
                      color: 'var(--ink-2)',
                    }}
                  >
                    {cap}
                  </span>
                ))}
              </div>
            </section>
          )}

          {isConnected && (
            <Button as="a" href={`/agents/${id}/hire`} variant="primary" size="lg" full>
              hire {agent.name || 'this agent'} →
            </Button>
          )}
        </aside>
      </div>

      <style>{`
        @media (max-width: 900px) {
          [data-agent-grid] { grid-template-columns: 1fr !important; }
          [data-agent-grid] aside { position: static !important; }
        }
      `}</style>
    </div>
  )
}

function Stat({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <>
      <dt className="caps" style={{ alignSelf: 'baseline' }}>{k}</dt>
      <dd style={{ fontFamily: 'var(--mono)', fontSize: 'var(--t-meta)', fontVariantNumeric: 'tabular-nums', color: 'var(--ink)' }}>{v}</dd>
    </>
  )
}
