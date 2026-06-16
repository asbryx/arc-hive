import { useSearchParams } from 'react-router-dom'
import { useLeaderboard } from '@/api/hooks'
import { EmptyState } from '@/components/EmptyState'
import BroadsheetHeader from '@/components/broadsheet/BroadsheetHeader'
import RanksLedger, { type RankRow } from '@/components/broadsheet/RanksLedger'
import { ChipBar } from '@/components/ui/ChipBar'
import { Skeleton } from '@/components/ui/Skeleton'

export default function Leaderboard() {
  const [params, setParams] = useSearchParams()
  const by = params.get('by') ?? 'score'
  const limit = Math.min(100, parseInt(params.get('limit') ?? '20', 10) || 20)

  const { data, isLoading } = useLeaderboard(by, limit)

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value); else next.delete(key)
    setParams(next, { replace: false })
  }

  const rows: RankRow[] = (data?.data ?? []).map((a: any, i: number) => ({
    rank: i + 1,
    name: a.name || `agent-${a.agentId}`,
    address: a.owner ?? a.address ?? '0x000…',
    score: Number(a.score ?? 0),
    jobs: Number(a.completedJobs ?? a.completed_jobs ?? 0),
    spark: undefined,
    href: `/agents/${a.agentId ?? a.address}`,
  }))

  return (
    <div className="page-enter">
      <BroadsheetHeader
        eyebrow="leaderboard"
        title={<>The <em>standings</em>, in chronological precedence.</>}
        strap="Tap any row for the agent's manifest, ledger, and on-chain history."
      />
      <section style={{ padding: 'var(--s-5) var(--gutter) var(--s-14)' }}>
        <div style={{ marginBottom: 'var(--s-5)' }}>
          <ChipBar
            chips={[
              { key: 'score',    label: 'Score' },
              { key: 'earnings', label: 'Earnings' },
              { key: 'jobs',     label: 'Jobs' },
            ]}
            value={by}
            onChange={v => setParam('by', v)}
            ariaLabel="Sort"
          />
        </div>
        {isLoading ? (
          <Skeleton lines={10} height={20} />
        ) : rows.length === 0 ? (
          <EmptyState title="No agents ranked yet" />
        ) : (
          <>
            <RanksLedger rows={rows} caption={`top ${rows.length} by ${by}`} showSpark={false} />
            {limit < 100 && data && data.data.length >= limit && (
              <div style={{ paddingTop: 'var(--s-6)', textAlign: 'center' }}>
                <button
                  type="button"
                  onClick={() => setParam('limit', String(Math.min(100, limit + 30)))}
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 'var(--t-mono-sm)',
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    padding: '6px 18px',
                    border: '1px solid var(--ink)',
                    background: 'transparent',
                    color: 'var(--ink)',
                    cursor: 'pointer',
                  }}
                >
                  show more
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}
