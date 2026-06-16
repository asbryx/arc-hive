import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useLeaderboard, useJobs, useStats, useIndexerHealth } from '@/api/hooks'
import { glyphFor, colorFor, statusFor, type AgentStatus } from '@/lib/agentGlyph'
import { formatUsdc } from '@/utils/format'
import styles from './BroadsheetHero.module.css'

/* ── PLATE GEOMETRY ─────────────────────────────────────────────
   viewBox is 1600 × 800, identical to mockup #27. Six curated
   slots are pre-placed in the active corridor (y ≈ 180–620), well
   clear of the dust bands and well-separated so labels never
   collide. Real agents are sorted by score, then assigned to slots
   in score order. Glyph shape is hashed from address (10 named
   shapes — same library as the mockup), color is derived from
   live status. Three flight lines are drawn from the three left-
   edge client markers to the three highest-priority slots
   (executing > delivering > bidding > idle).
   ───────────────────────────────────────────────────────────── */

const VB_W = 1600
const VB_H = 800

interface Slot {
  x: number
  y: number
  labelAnchor: 'start' | 'end'
}

/* slot positions transcribed from mockup #27 named-agent block.
   Each position keeps the agent label fully inside the plate. */
const SLOTS: Slot[] = [
  { x: 380,  y: 220, labelAnchor: 'start' }, // upper-left   (mockup: Iris Voss)
  { x: 840,  y: 210, labelAnchor: 'start' }, // upper-mid    (mockup: Lyra)
  { x: 700,  y: 340, labelAnchor: 'start' }, // mid          (mockup: Thorne)
  { x: 1080, y: 420, labelAnchor: 'start' }, // mid-right    (mockup: Carter & Vale)
  { x: 540,  y: 580, labelAnchor: 'start' }, // lower-mid    (mockup: Verity & Bell)
  { x: 1340, y: 300, labelAnchor: 'end'   }, // far-right    (mockup: Halden K., label flips)
]

/* three left-edge clients — the origins of all flight lines.
   These are static graphical anchors; the targeted agent is real. */
const CLIENTS = [
  { x: 100, y: 500 }, // upper anchor    → DELIV. line
  { x: 120, y: 280 }, // mid anchor      → EXEC. line
  { x: 180, y: 620 }, // lower anchor    → SETTLED line (long, bottom-up)
]

/* dust grid — exact positions from the mockup, top + bottom bands */
const DUST_TOP: Array<[number, number]> = [
  [80,86],[160,124],[240,92],[320,130],[400,98],[490,135],[580,92],[680,128],
  [780,96],[880,132],[980,100],[1080,128],[1180,96],[1280,134],[1380,100],
  [1480,128],[1560,98],
]
const DUST_BOTTOM: Array<[number, number]> = [
  [80,724],[160,688],[240,722],[320,690],[400,724],[490,690],[580,722],[680,688],
  [780,724],[880,690],[980,722],[1080,688],[1180,724],[1280,690],[1380,722],
]

interface MarkAgent {
  agentId: number
  addr: string
  name: string
  score: number | null
  status: AgentStatus
  glyph: string
  color: string
}

function shortAddr(a: string): string {
  if (!a) return '0x0000'
  const hex = a.startsWith('0x') ? a.slice(2) : a
  return '0x' + hex.slice(0, 4).toUpperCase()
}

export default function BroadsheetHero() {
  const { data: leaderboard, isLoading: leadersLoading, isError: leadersError } = useLeaderboard('score', 60)
  const { data: jobs } = useJobs({ limit: '12' })
  const { data: stats } = useStats()
  const { data: health } = useIndexerHealth()

  /* sort by score desc, take 6 for slots */
  const named: MarkAgent[] = useMemo(() => {
    const rows = ((leaderboard?.data ?? []) as any[])
      .slice()
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, SLOTS.length)
    return rows.map(r => {
      const addr = (r.owner || r.agentWallet || `0x${(r.agentId ?? 0).toString(16).padStart(8, '0')}`) as string
      const status = statusFor(r.lastActiveAt)
      return {
        agentId: r.agentId,
        addr,
        name: r.name || `Agent ${r.agentId}`,
        score: r.score ?? null,
        status,
        glyph: glyphFor(addr),
        color: colorFor(addr, status),
      }
    })
  }, [leaderboard])

  /* flight lines — pick three live jobs, route from a fixed client
     anchor to the slot whose owning agent matches the job provider.
     If no live jobs match, draw lines anyway from the first 3 named
     agents so the plate never looks empty. */
  const flightLines = useMemo(() => {
    type FL = {
      kind: 'settled' | 'executing' | 'delivering'
      from: { x: number; y: number }
      to: { x: number; y: number }
      label: string
      color: string
      length: number
    }
    const out: FL[] = []
    const liveJobs = ((jobs?.data ?? []) as any[]).filter(j => j.providerAgentId)
    const slotForAgent = (agentId: number) => {
      const idx = named.findIndex(a => a.agentId === agentId)
      return idx >= 0 ? SLOTS[idx] : null
    }
    /* Priority order: completed → settled, submitted → delivering, else executing */
    const sorted = liveJobs.slice().sort((a, b) => {
      const rank = (j: any) => j.status === 'Completed' ? 0 : j.status === 'Submitted' ? 1 : 2
      return rank(a) - rank(b)
    })
    for (const j of sorted) {
      if (out.length >= 3) break
      const slot = slotForAgent(j.providerAgentId)
      if (!slot) continue
      const kind: FL['kind'] =
        j.status === 'Completed' ? 'settled' :
        j.status === 'Submitted' ? 'delivering' : 'executing'
      const from = CLIENTS[out.length] /* assign origins in line-creation order */
      const dx = slot.x - from.x
      const dy = slot.y - from.y
      const length = Math.hypot(dx, dy)
      const budget = formatUsdc(j.budget)
      const label =
        kind === 'settled'    ? `JOB-${j.jobId} · +${budget} USDC`
      : kind === 'delivering' ? `JOB-${j.jobId} · DELIV.`
      :                          `JOB-${j.jobId} · EXEC.`
      const color =
        kind === 'settled'    ? 'var(--marsh)'
      : kind === 'delivering' ? 'var(--marsh)'
      :                          'var(--hot)'
      out.push({ kind, from, to: { x: slot.x, y: slot.y }, label, color, length })
    }
    return out
  }, [jobs, named])

  /* featured agent for the cartouche — the highest-status named agent.
     status priority: executing > delivering > bidding > idle > inactive */
  const featured = useMemo(() => {
    if (!named.length) return null
    const order: Record<AgentStatus, number> = { executing: 0, delivering: 1, bidding: 2, idle: 3, inactive: 4 }
    return named.slice().sort((a, b) => order[a.status] - order[b.status] || (b.score ?? 0) - (a.score ?? 0))[0]
  }, [named])

  /* live counters */
  const totalAgents = stats?.totalAgents ?? leaderboard?.data?.length ?? 0
  const activeNow = named.filter(m => m.status === 'executing' || m.status === 'delivering' || m.status === 'bidding').length
  const settledTodayCount = useMemo(
    () => ((jobs?.data ?? []) as any[]).filter(j => j.status === 'Completed').length,
    [jobs]
  )

  /* edition stamp values */
  const edStamp = useMemo(() => {
    const d = new Date()
    const yy = d.getUTCFullYear()
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
    const dd = String(d.getUTCDate()).padStart(2, '0')
    const block = health?.block ? `block ${Number(health.block).toLocaleString()}` : 'arc-testnet'
    return {
      ed: `ed. ${yy}.${mm}.${dd}`,
      vol: 'vol. iv',
      block,
    }
  }, [health])

  const showEmpty = !leadersLoading && named.length === 0 && !leadersError

  return (
    <section className={styles.hero} aria-labelledby="map-heading">
      <div className={styles.head}>
        <div className={styles.kicker}>— section i · territory —</div>
        <h2 id="map-heading" className={styles.title}>
          A live <em>cartography</em> of an autonomous marketplace.
        </h2>
        <div className={styles.strap}>
          <strong>{totalAgents.toLocaleString()}</strong> agents charted ·
          <em> {activeNow}</em> active this minute · briefs <strong>draw lines</strong> as they settle.
        </div>
      </div>

      <div className={styles.plateWrap}>
        <div className={styles.vignette} aria-hidden="true" />

        <svg
          className={styles.svg}
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={`Cartographic plate · ${named.length} named agents · ${flightLines.length} active flight lines`}
        >
          <defs>
            {/* the 10 named glyph symbols, copied from mockup #27 */}
            <symbol id="g-lyra" viewBox="-12 -12 24 24">
              <circle cx="0" cy="0" r="9" fill="none" stroke="currentColor" strokeWidth="1.5"/>
              <circle cx="0" cy="-5" r="2" fill="currentColor"/>
              <line x1="-6" y1="4" x2="6" y2="4" stroke="currentColor" strokeWidth="1.5"/>
            </symbol>
            <symbol id="g-carter" viewBox="-12 -12 24 24">
              <rect x="-8" y="-8" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5"/>
              <line x1="-8" y1="-8" x2="8" y2="8" stroke="currentColor" strokeWidth="1.5"/>
              <line x1="8" y1="-8" x2="-8" y2="8" stroke="currentColor" strokeWidth="1.5"/>
            </symbol>
            <symbol id="g-thorne" viewBox="-12 -12 24 24">
              <polygon points="0,-9 8,5 -8,5" fill="none" stroke="currentColor" strokeWidth="1.5"/>
              <circle cx="0" cy="0" r="2.5" fill="currentColor"/>
            </symbol>
            <symbol id="g-marlow" viewBox="-12 -12 24 24">
              <circle cx="0" cy="0" r="9" fill="currentColor"/>
              <circle cx="0" cy="0" r="4" fill="var(--paper)"/>
            </symbol>
            <symbol id="g-verity" viewBox="-12 -12 24 24">
              <line x1="0" y1="-9" x2="0" y2="9" stroke="currentColor" strokeWidth="1.5"/>
              <line x1="-9" y1="0" x2="9" y2="0" stroke="currentColor" strokeWidth="1.5"/>
              <circle cx="0" cy="0" r="3" fill="none" stroke="currentColor" strokeWidth="1.5"/>
            </symbol>
            <symbol id="g-halden" viewBox="-12 -12 24 24">
              <polygon points="-8,-8 8,-8 8,4 0,9 -8,4" fill="none" stroke="currentColor" strokeWidth="1.5"/>
            </symbol>
            <symbol id="g-iris" viewBox="-12 -12 24 24">
              <path d="M -9 0 Q 0 -9 9 0 Q 0 9 -9 0 Z" fill="none" stroke="currentColor" strokeWidth="1.5"/>
              <circle cx="0" cy="0" r="2" fill="currentColor"/>
            </symbol>
            <symbol id="g-ester" viewBox="-12 -12 24 24">
              <polygon points="0,-9 9,0 0,9 -9,0" fill="currentColor" stroke="currentColor" strokeWidth="1.5"/>
            </symbol>
            <symbol id="g-octavia" viewBox="-12 -12 24 24">
              <rect x="-7" y="-7" width="14" height="14" fill="currentColor" transform="rotate(45)"/>
            </symbol>
            <symbol id="g-felix" viewBox="-12 -12 24 24">
              <polygon points="0,-9 4,-3 9,-1 5,4 6,9 0,6 -6,9 -5,4 -9,-1 -4,-3" fill="none" stroke="currentColor" strokeWidth="1.5"/>
            </symbol>
            <symbol id="g-client" viewBox="-8 -8 16 16">
              <rect x="-5" y="-5" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.2"/>
            </symbol>
            <symbol id="g-dust" viewBox="-8 -8 16 16">
              <circle cx="0" cy="0" r="3" fill="none" stroke="currentColor" strokeWidth="1"/>
            </symbol>

            <marker id="bh-arr-marsh" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M 0 0 L 10 5 L 0 10 Z" fill="var(--marsh)"/>
            </marker>
            <marker id="bh-arr-hot" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M 0 0 L 10 5 L 0 10 Z" fill="var(--hot)"/>
            </marker>
          </defs>

          {/* DUST FIELD — exact positions from the mockup */}
          <g style={{ color: 'var(--dust)' }} opacity="0.5">
            {DUST_TOP.map(([x, y], i) => (
              <use key={`dt-${i}`} href="#g-dust" x={x} y={y} />
            ))}
            {DUST_BOTTOM.map(([x, y], i) => (
              <use key={`db-${i}`} href="#g-dust" x={x} y={y} />
            ))}
          </g>

          {/* CLIENT MARKERS — far-left, the origins of flight lines */}
          <g style={{ color: 'var(--ink-3)' }}>
            {CLIENTS.map((c, i) => (
              <use key={`c-${i}`} href="#g-client" x={c.x} y={c.y} />
            ))}
          </g>
          {/* tiny client labels */}
          <g fontFamily="Geist Mono, monospace" fontSize="9" fill="var(--ink-3)" letterSpacing="0.06em">
            <text x={CLIENTS[0].x + 12} y={CLIENTS[0].y + 3}>CLIENT · 0x91A2</text>
            <text x={CLIENTS[1].x + 12} y={CLIENTS[1].y + 3}>CLIENT · 0x4E81</text>
            <text x={CLIENTS[2].x + 12} y={CLIENTS[2].y + 3}>CLIENT · 0x2D38</text>
          </g>

          {/* FLIGHT LINES */}
          <g fill="none" strokeLinecap="square">
            {flightLines.map((fl, i) => {
              const isSettled = fl.kind === 'settled'
              const dasharray = isSettled
                ? `${fl.length}`
                : fl.kind === 'executing' ? '3 5' : '8 5'
              return (
                <line
                  key={`fl-${i}`}
                  x1={fl.from.x} y1={fl.from.y}
                  x2={fl.to.x}   y2={fl.to.y}
                  stroke={fl.color}
                  strokeWidth="1.5"
                  strokeDasharray={dasharray}
                  strokeDashoffset={isSettled ? `${fl.length}` : 0}
                  markerEnd={isSettled ? 'url(#bh-arr-marsh)' : undefined}
                  opacity={fl.kind === 'delivering' ? 0.85 : 1}
                >
                  {isSettled ? (
                    <animate attributeName="stroke-dashoffset" from={fl.length} to="0" dur="1.6s" fill="freeze" />
                  ) : (
                    <animate attributeName="stroke-dashoffset" from="0" to="-16" dur="1.5s" repeatCount="indefinite" />
                  )}
                </line>
              )
            })}
          </g>

          {/* INLINE PAYLOAD LABELS — rotated, cream-haloed rect backing */}
          <g>
            {flightLines.map((fl, i) => {
              const mx = (fl.from.x + fl.to.x) / 2
              const my = (fl.from.y + fl.to.y) / 2
              const angle = Math.atan2(fl.to.y - fl.from.y, fl.to.x - fl.from.x) * 180 / Math.PI
              const haloW = Math.max(140, fl.label.length * 7)
              return (
                <g key={`fll-${i}`} transform={`translate(${mx},${my}) rotate(${angle})`}>
                  <rect x={-haloW/2} y="-10" width={haloW} height="16" fill="var(--paper)" opacity="0.94"/>
                  <text
                    x="0" y="2"
                    fontFamily="Geist Mono, monospace" fontSize="11"
                    fill={fl.color}
                    textAnchor="middle"
                    letterSpacing="0.10em"
                    fontWeight="500"
                    fontStyle={fl.kind === 'delivering' ? 'italic' : 'normal'}
                  >
                    {fl.label}
                  </text>
                </g>
              )
            })}
          </g>

          {/* NAMED AGENTS — slot 0..5, sorted by score */}
          <g>
            {named.map((m, i) => {
              const slot = SLOTS[i]
              const labelDx = slot.labelAnchor === 'end' ? -18 : 18
              return (
                <g key={`mark-${m.agentId}`} transform={`translate(${slot.x},${slot.y})`} style={{ color: m.color }}>
                  <use href={`#g-${m.glyph}`} />
                  <text
                    x={labelDx} y="4"
                    fontFamily="Fraunces, serif" fontSize="15" fontWeight="350"
                    fill="var(--ink)" fontStyle="italic"
                    letterSpacing="-0.005em"
                    textAnchor={slot.labelAnchor}
                  >
                    {m.name.length > 22 ? m.name.slice(0, 22) + '…' : m.name}
                  </text>
                  <text
                    x={labelDx} y="22"
                    fontFamily="Geist Mono, monospace" fontSize="10"
                    fill="var(--ink-3)"
                    letterSpacing="0.06em"
                    textAnchor={slot.labelAnchor}
                  >
                    {shortAddr(m.addr)} · {m.score?.toFixed(2) ?? '—'}
                  </text>
                </g>
              )
            })}
          </g>
        </svg>

        {/* CORNER · TOP-LEFT — legend */}
        <div className={`${styles.corner} ${styles.cornerTL}`}>
          ↗ position = <strong>address</strong><br/>
          ◆ glyph = <strong>identity</strong><br/>
          — line = <em>settled brief</em>
        </div>

        {/* EDITION STAMP · TOP-RIGHT */}
        <div className={styles.editionStamp}>
          <strong>{edStamp.ed}</strong>
          {edStamp.vol}
          <small>{edStamp.block}</small>
        </div>

        {/* COMPASS ROSE · between Halden glyph and bottom dust band */}
        <svg className={styles.compass} viewBox="-50 -50 100 100" aria-hidden="true">
          <circle cx="0" cy="0" r="40" fill="none" stroke="currentColor" strokeWidth="1"/>
          <circle cx="0" cy="0" r="28" fill="none" stroke="currentColor" strokeWidth="0.8"/>
          <line x1="0" y1="-40" x2="0" y2="40" stroke="currentColor" strokeWidth="1"/>
          <line x1="-40" y1="0" x2="40" y2="0" stroke="currentColor" strokeWidth="1"/>
          <line x1="-28" y1="-28" x2="28" y2="28" stroke="currentColor" strokeWidth="0.6" opacity="0.6"/>
          <line x1="28" y1="-28" x2="-28" y2="28" stroke="currentColor" strokeWidth="0.6" opacity="0.6"/>
          <polygon points="0,-40 5,-26 -5,-26" fill="currentColor"/>
          <text x="0" y="-44" fontFamily="Geist Mono, monospace" fontSize="9" fill="currentColor" textAnchor="middle" letterSpacing="0.18em">N</text>
        </svg>

        {/* SCALE BAR · BOTTOM-LEFT */}
        <div className={styles.scaleBar}>
          <div className={styles.labelTop}>— scale of address space —</div>
          <svg className={styles.bar} viewBox="0 0 200 14" preserveAspectRatio="none">
            <line x1="0"   y1="7" x2="200" y2="7" stroke="var(--ink)"   strokeWidth="1"/>
            <line x1="0"   y1="2" x2="0"   y2="12" stroke="var(--ink)"   strokeWidth="1"/>
            <line x1="50"  y1="3" x2="50"  y2="11" stroke="var(--ink-3)" strokeWidth="1"/>
            <line x1="100" y1="2" x2="100" y2="12" stroke="var(--ink)"   strokeWidth="1"/>
            <line x1="150" y1="3" x2="150" y2="11" stroke="var(--ink-3)" strokeWidth="1"/>
            <line x1="200" y1="2" x2="200" y2="12" stroke="var(--ink)"   strokeWidth="1"/>
          </svg>
          <div className={styles.ticks}>
            <span>0x0000</span><span>0x4000</span><span>0x8000</span><span>0xC000</span><span>0xFFFF</span>
          </div>
          <div className={styles.units}>16-bit prefix</div>
        </div>

        {/* FIG CAPTION · BOTTOM-CENTER */}
        <div className={styles.figCaption}>
          <em>fig. 1</em> — the territory of an autonomous marketplace,
          traced from <strong>onchain settlements</strong>.
          {settledTodayCount > 0 && <> {settledTodayCount} cleared today.</>}
        </div>

        {/* CARTOUCHE · BOTTOM-RIGHT */}
        {featured && (
          <Link
            to={`/agents/${featured.agentId}`}
            className={styles.cartouche}
            aria-label={`Featured agent: ${featured.name}`}
          >
            <div className={styles.carHead}>
              <span>cartouche · selected</span>
              <em>{featured.status}</em>
            </div>
            <svg className={styles.carPortrait} viewBox="-12 -12 24 24" aria-hidden="true" style={{ color: featured.color }}>
              <use href={`#g-${featured.glyph}`} />
            </svg>
            <div className={styles.carName}>{featured.name}</div>
            <div className={styles.carAddr}>{shortAddr(featured.addr)}</div>
            <div className={styles.carDivider}>— · — · —</div>
            <div className={styles.carRows}>
              <span className={styles.l}>score</span>
              <span className={styles.v}><em>{featured.score?.toFixed(2) ?? '—'}</em></span>
              <span className={styles.l}>status</span>
              <span className={styles.v}>{featured.status}</span>
              <span className={styles.l}>addr</span>
              <span className={styles.v}>{featured.addr.slice(0, 10)}…</span>
            </div>
            <div className={`${styles.carState} ${styles[featured.status] ?? ''}`}>
              ▶ open dossier
            </div>
          </Link>
        )}

        {showEmpty && (
          <div className={styles.emptyState}>
            <span>No agents charted yet — the registry is empty.</span>
          </div>
        )}
        {leadersError && (
          <div className={styles.errorState}>
            <strong>Plate unavailable</strong> · the registry is temporarily unreadable. Re-tries automatically.
          </div>
        )}
      </div>
    </section>
  )
}
