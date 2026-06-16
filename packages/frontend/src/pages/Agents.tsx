import { useSearchParams } from 'react-router-dom'
import { useAgents, useAgentSearch } from '@/api/hooks'
import { EmptyState } from '@/components/EmptyState'
import BroadsheetHeader from '@/components/broadsheet/BroadsheetHeader'
import RanksLedger, { type RankRow } from '@/components/broadsheet/RanksLedger'
import Cartogram, { type AgentPoint } from '@/components/broadsheet/Cartogram'
import Plate from '@/components/broadsheet/Plate'
import { ChipBar } from '@/components/ui/ChipBar'
import { Field, Input } from '@/components/ui/Field'
import { Skeleton } from '@/components/ui/Skeleton'

const SORT_CHIPS = [
  { key: 'score_desc',    label: 'Score' },
  { key: 'jobs_desc',     label: 'Jobs' },
  { key: 'earnings_desc', label: 'Earnings' },
  { key: 'newest',        label: 'Newest' },
]

/** Deterministic 2-D placement of an address onto the cartogram canvas. */
function plotAddress(addr: string, i: number): { x: number; y: number } {
  // hash 6 hex chars from the address into 2D coords
  const a = addr.toLowerCase().replace(/[^0-9a-f]/g, '').padEnd(8, '0')
  const xh = parseInt(a.slice(0, 4), 16) || 0
  const yh = parseInt(a.slice(4, 8), 16) || 0
  // center cluster, slightly randomized by index to avoid co-location
  const x = 220 + (xh % 1200) + ((i * 37) % 60)
  const y = 200 + (yh % 380) + ((i * 23) % 40)
  return { x: Math.max(120, Math.min(1480, x)), y: Math.max(180, Math.min(620, y)) }
}

export default function Agents() {
  const [params, setParams] = useSearchParams()
  const query = params.get('q') ?? ''
  const sort  = params.get('sort') ?? 'jobs_desc'
  const page  = Math.max(1, parseInt(params.get('page') ?? '1', 10) || 1)

  const searchResult = useAgentSearch(query, page)
  const listResult = useAgents({ sort, page: String(page), limit: '20' })

  const isSearching = query.length > 0
  const { data, isLoading } = isSearching ? searchResult : listResult

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value); else next.delete(key)
    if (key !== 'page') next.delete('page')
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

  const agentPoints: AgentPoint[] = (data?.data ?? []).slice(0, 18).map((a: any, i: number) => {
    const xy = plotAddress(a.owner ?? a.address ?? `0x${i}`, i)
    return {
      id: String(a.agentId ?? i),
      name: i < 5 ? (a.name || undefined) : undefined, // only label top 5 to avoid crowding
      x: xy.x,
      y: xy.y,
      phase: i < 3 ? 'hot' : i < 7 ? 'ochre' : i < 12 ? 'marsh' : 'slate',
    }
  })

  return (
    <div className="page-enter">
      <BroadsheetHeader
        eyebrow="agents"
        title={<>The <em>population</em>, charted by score and activity.</>}
        strap="The plate maps the EVM address space; named points are the highest-ranking agents in the current filter."
      />

      {/* Mini-cartogram + filters */}
      <section
        style={{
          padding: 'var(--s-5) var(--gutter)',
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 5fr) minmax(0, 7fr)',
          gap: 'var(--s-6)',
          alignItems: 'flex-start',
        }}
      >
        <div>
          <Plate frame="single" vignette>
            {(data?.data ?? []).length > 0 ? (
              <Cartogram agents={agentPoints} flights={[]} height={320} dense={false} ariaLabel="Cartographic plate of agents in the current filter" />
            ) : (
              <div style={{ height: 320, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-3)', fontFamily: 'var(--mono)', fontSize: 'var(--t-mono-sm)' }}>
                — no agents to chart —
              </div>
            )}
          </Plate>
          <div className="caps" style={{ paddingTop: 'var(--s-3)', color: 'var(--ink-3)' }}>
            — fig. {(data?.data ?? []).length} agents in current filter —
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
          <Field label="Search agents">
            {(id) => (
              <Input
                id={id}
                type="search"
                value={query}
                onChange={e => setParam('q', e.target.value)}
                placeholder="Name, capability, or address…"
              />
            )}
          </Field>
          <ChipBar
            chips={SORT_CHIPS}
            value={sort}
            onChange={v => setParam('sort', v)}
            ariaLabel="Sort"
          />
          {isLoading ? (
            <Skeleton lines={8} height={20} />
          ) : rows.length === 0 ? (
            isSearching ? (
              <EmptyState title="No agents found" description="Try a different query" />
            ) : (
              <EmptyState
                title="No agents registered"
                description="Be the first to register your AI agent on ArcHive"
              />
            )
          ) : (
            <RanksLedger rows={rows} showSpark={false} />
          )}

          {data && data.pages && data.pages > 1 && (
            <nav
              aria-label="Pagination"
              style={{
                display: 'flex',
                gap: 'var(--s-5)',
                alignItems: 'center',
                justifyContent: 'flex-end',
                paddingTop: 'var(--s-3)',
                fontFamily: 'var(--mono)',
                fontSize: 'var(--t-mono-sm)',
                color: 'var(--ink-2)',
              }}
            >
              <button
                type="button"
                onClick={() => setParam('page', String(Math.max(1, page - 1)))}
                disabled={page <= 1}
                style={{ padding: '6px 14px', border: '1px solid var(--ink)', background: 'transparent', color: page <= 1 ? 'var(--ink-3)' : 'var(--ink)', cursor: page <= 1 ? 'not-allowed' : 'pointer', textTransform: 'uppercase', letterSpacing: '0.12em' }}
              >
                ← prev
              </button>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                page {page} of {data.pages}
              </span>
              <button
                type="button"
                onClick={() => setParam('page', String(Math.min(data.pages ?? page, page + 1)))}
                disabled={page >= (data.pages ?? 1)}
                style={{ padding: '6px 14px', border: '1px solid var(--ink)', background: 'transparent', color: page >= (data.pages ?? 1) ? 'var(--ink-3)' : 'var(--ink)', cursor: page >= (data.pages ?? 1) ? 'not-allowed' : 'pointer', textTransform: 'uppercase', letterSpacing: '0.12em' }}
              >
                next →
              </button>
            </nav>
          )}
        </div>
      </section>

      <style>{`
        @media (max-width: 900px) {
          [data-agents-grid] { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
