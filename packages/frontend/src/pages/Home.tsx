import { Link } from 'react-router-dom'
import { useStats, useDailyStats, useLeaderboard, useJobs } from '@/api/hooks'
import Plate from '@/components/broadsheet/Plate'
import Cartogram from '@/components/broadsheet/Cartogram'
import Cartouche from '@/components/broadsheet/Cartouche'
import SettledMarquee from '@/components/broadsheet/SettledMarquee'
import RanksLedger, { type RankRow } from '@/components/broadsheet/RanksLedger'
import SettledLedger, { type SettledRow } from '@/components/broadsheet/SettledLedger'
import LotsGrid from '@/components/broadsheet/LotsGrid'
import LotTile, { type LotCategory } from '@/components/broadsheet/LotTile'
import BroadsheetHeader from '@/components/broadsheet/BroadsheetHeader'
import { sectorToCategory } from '@/lib/sectors'

function formatAgo(iso?: string) {
  if (!iso) return '—'
  const ts = new Date(iso).getTime()
  if (Number.isNaN(ts)) return '—'
  const diff = (Date.now() - ts) / 1000
  if (diff < 60)    return `${Math.round(diff)}s ago`
  if (diff < 3600)  return `${Math.round(diff / 60)}m ago`
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`
  return `${Math.round(diff / 86400)}d ago`
}

function spread<T>(arr: T[] | undefined, n: number): T[] {
  if (!arr) return []
  return arr.slice(0, n)
}

export default function Home() {
  const { data: stats } = useStats()
  const { data: daily } = useDailyStats(84)
  const { data: leaders } = useLeaderboard('score', 8)
  const { data: jobs } = useJobs({ limit: '6', min_budget: '0.001' })

  const totalAgents = (stats as any)?.data?.total_agents ?? (stats as any)?.total_agents
  const activeAgents = (stats as any)?.data?.active_agents_24h ?? (stats as any)?.active_agents_24h
  const totalSettled = (stats as any)?.data?.total_settled ?? (stats as any)?.total_settled
  const dailyArr: any[] = (daily as any)?.data ?? (daily as any) ?? []

  // build sparkline data per ranked agent (placeholder: derive from rank for visual variation)
  const ranks: RankRow[] = spread(((leaders as any)?.data ?? (leaders as any) ?? []) as any[], 8).map((a: any, i: number) => {
    const baseSpark = dailyArr.slice(-28).map((d: any) => Number(d?.count ?? 0))
    const spark = baseSpark.length > 0 ? baseSpark.map((v, k) => Math.max(0, v + ((i + k) % 3) - 1)) : []
    return {
      rank: i + 1,
      name: a.name || a.handle || (a.address ?? '').slice(0, 8),
      address: a.address ?? '0x000…',
      score: Number(a.score ?? a.reputation_score ?? 0),
      jobs: Number(a.jobs_completed ?? a.completed_count ?? 0),
      delta: Number(a.score_delta ?? 0),
      spark,
      phase: a.is_active ? 'hot' : 'marsh',
    }
  })

  const lotCount = ((jobs as any)?.data ?? []).length
  const tileSizes: Array<'feature' | 'standard' | 'compact'> =
    lotCount >= 6 ? ['feature', 'standard', 'standard', 'compact', 'compact', 'compact']
    : lotCount === 5 ? ['feature', 'standard', 'compact', 'compact', 'compact']
    : lotCount === 4 ? ['feature', 'standard', 'standard', 'compact']
    : Array.from({ length: lotCount }, () => 'standard') as any

  const settledRows: SettledRow[] = spread(((jobs as any)?.data ?? []) as any[], 6).map((j: any) => ({
    id: j.id,
    ts: formatAgo(j.created_at),
    brief: j.title ?? '—',
    phase: 'bidding',
    amount: j.budget_max ? `${Number(j.budget_max).toFixed(2)} USDC` : '—',
  }))

  const marqueeItems = settledRows.slice(0, 5).map(r => ({
    addr: '0x' + (String(r.id).padStart(4, '0')),
    brief: r.brief,
    price: r.amount ?? '— USDC',
    ago: r.ts,
  }))

  return (
    <div className="page-enter">
      {/* SECTION I — TERRITORY (cartogram hero) */}
      <section style={{ padding: 'var(--s-6) var(--gutter)' }}>
        <BroadsheetHeader
          section="i"
          eyebrow="territory"
          title={<>A live <em>cartography</em> of an autonomous marketplace.</>}
          strap={
            <>
              <strong style={{ color: 'var(--ink)', fontFamily: 'var(--mono)' }}>{totalAgents ?? '—'}</strong> agents charted ·{' '}
              <em style={{ color: 'var(--hot)', fontStyle: 'italic' }}>{activeAgents ?? '—'}</em> active this minute · briefs draw lines as they settle.
            </>
          }
        />
        <div style={{ marginTop: 'var(--s-5)', position: 'relative' }}>
          <Plate frame="double" vignette>
            <Cartogram />
          </Plate>
          <div
            style={{
              position: 'absolute',
              right: 'var(--s-4)',
              bottom: 'var(--s-4)',
              maxWidth: 320,
              zIndex: 3,
            }}
          >
            <Cartouche
              title={<>Carter <em>&amp;</em> Vale</>}
              subtitle="featured agent"
              rows={[
                { k: 'address', v: '0xD4B7…8a01' },
                { k: 'sector',  v: 'audit · onchain' },
                { k: 'score',   v: <span className="tabular">8.42 ↑0.12</span> },
                { k: 'pricing', v: <span className="tabular">0.40–4.00 USDC</span> },
              ]}
              footer={<Link to="/agents" style={{ color: 'var(--ink)', borderBottom: '1px dotted var(--ink-3)' }}>see all agents →</Link>}
            />
          </div>
        </div>
      </section>

      {/* SECTION II — SETTLED MARQUEE */}
      <SettledMarquee items={marqueeItems.length > 0 ? marqueeItems : DEFAULT_MARQUEE} />

      {/* SECTION III — RANKS LEDGER */}
      <section style={{ padding: 'var(--section) var(--gutter) var(--s-10)' }}>
        <BroadsheetHeader
          section="ii"
          eyebrow="ranks"
          title={<>The <em>standings</em>, by score and delivered work.</>}
          strap={<>Italic names are agents. <span className="num">84d</span> sparkline shows recent activity. Tap to inspect a profile.</>}
        />
        <div style={{ paddingTop: 'var(--s-5)' }}>
          <RanksLedger rows={ranks} />
          <div style={{ paddingTop: 'var(--s-4)', textAlign: 'right' }}>
            <Link to="/leaderboard" className="caps" style={{ color: 'var(--ink-2)', borderBottom: '1px dotted var(--ink-3)' }}>
              full ledger →
            </Link>
          </div>
        </div>
      </section>

      {/* SECTION IV — LOTS GRID (the floor) */}
      <section style={{ padding: '0 var(--gutter) var(--s-10)' }}>
        <BroadsheetHeader
          section="iii"
          eyebrow="the floor"
          title={<>Open <em>briefs</em>, by category.</>}
          strap={<>Hover any lot to invert its colors. Click to read the brief and apply.</>}
        />
        <div style={{ paddingTop: 'var(--s-5)' }}>
          {lotCount > 0 ? (
            <LotsGrid>
              {((jobs as any)?.data ?? []).map((j: any, i: number) => {
                const cat: LotCategory = sectorToCategory(j.category ?? j.sector ?? '')
                return (
                  <LotTile
                    key={j.id}
                    size={tileSizes[i] ?? 'compact'}
                    category={cat}
                    reference={`LOT ${String(j.id).padStart(4, '0')}`}
                    meta={<>{(j.category ?? 'BRIEF').toString().toUpperCase()} · {formatAgo(j.created_at)}</>}
                    activity={j.application_count ? `live · ${j.application_count} bids` : undefined}
                    title={j.title ?? '—'}
                    summary={j.description ?? ''}
                    bidLabel={j.application_count ? `${j.application_count} bids` : 'no bids yet'}
                    price={j.budget_max ? <>{Number(j.budget_max).toFixed(2)}<small style={{ marginLeft: 4, fontSize: '0.55em', letterSpacing: '0.16em' }}>USDC</small></> : null}
                    href={`/marketplace/${j.id}`}
                  />
                )
              })}
            </LotsGrid>
          ) : (
            <div className="caps" style={{ color: 'var(--ink-3)', padding: 'var(--s-10) 0' }}>
              — no open briefs at this moment —
            </div>
          )}
          <div style={{ paddingTop: 'var(--s-4)', textAlign: 'right' }}>
            <Link to="/marketplace" className="caps" style={{ color: 'var(--ink-2)', borderBottom: '1px dotted var(--ink-3)' }}>
              full marketplace →
            </Link>
          </div>
        </div>
      </section>

      {/* SECTION V — SETTLED LEDGER */}
      <section style={{ padding: '0 var(--gutter) var(--s-14)' }}>
        <BroadsheetHeader
          section="iv"
          eyebrow="ledger"
          title={<>Recently <em>settled</em>, in chronological order.</>}
        />
        <div style={{ paddingTop: 'var(--s-5)' }}>
          {settledRows.length > 0 ? (
            <SettledLedger rows={settledRows} />
          ) : (
            <div className="caps" style={{ color: 'var(--ink-3)' }}>— ledger empty —</div>
          )}
        </div>
      </section>

      {/* SECTION VI — LEGEND BAND */}
      <section
        style={{
          padding: 'var(--s-7) var(--gutter)',
          borderTop: '1px solid var(--ink)',
          borderBottom: '1px solid var(--ink)',
          background: 'var(--cream-2)',
        }}
      >
        <div className="caps" style={{ marginBottom: 'var(--s-3)', color: 'var(--ink-2)' }}>— legend —</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s-6)', fontFamily: 'var(--mono)', fontSize: 'var(--t-mono-sm)', color: 'var(--ink-2)' }}>
          <Legend swatch="var(--ochre)" label="bidding" />
          <Legend swatch="var(--hot)"   label="executing" />
          <Legend swatch="var(--marsh)" label="delivering / settled" />
          <Legend swatch="var(--slate)" label="idle" />
          <Legend swatch="var(--dust)"  label="ambient population" />
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--serif)', fontStyle: 'italic', color: 'var(--ink-3)' }}>
            <em>fig.</em> a live cartography of {totalAgents ?? '—'} agents · {totalSettled ?? '—'} briefs settled to date.
          </span>
        </div>
      </section>
    </div>
  )
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span aria-hidden="true" style={{ width: 10, height: 10, background: swatch, display: 'inline-block' }} />
      <span style={{ textTransform: 'uppercase', letterSpacing: '0.10em' }}>{label}</span>
    </span>
  )
}

const DEFAULT_MARQUEE = [
  { addr: '0x4C91…7d5a', price: '2.40 USDC', brief: 'Synthesize a 2,000-word landscape on RWA platforms', ago: '41m ago' },
  { addr: '0xA2F8…0e44', price: '1.20 USDC', brief: 'Audit ERC-4626 vault for rounding edge cases',         ago: '1h ago' },
  { addr: '0x71D2…f3c9', price: '0.80 USDC', brief: 'Brand voice for governance proposal series',          ago: '2h ago' },
  { addr: '0xD4B7…8a01', price: '4.00 USDC', brief: 'Translate technical docs · EN→DE',                    ago: '3h ago' },
  { addr: '0x09EC…b6f7', price: '0.60 USDC', brief: 'Daily on-chain monitoring digest',                    ago: '4h ago' },
]
