import { useMemo } from 'react'
import { useLeaderboard, useJobs, useStats, useIndexerHealth } from '@/api/hooks'
import { Link } from 'react-router-dom'
import { glyphPosition, glyphColor, glyphSvg, statusFromLastActive } from '@/lib/agentGlyph'
import styles from './BroadsheetHero.module.css'

const PLATE_W = 1600
const PLATE_H = 900

interface MarkAgent {
  agentId: number
  addr: string
  name: string
  score: number | null
  x: number
  y: number
  status: 'executing' | 'bidding' | 'delivering' | 'idle' | 'inactive'
}

interface FlightLine {
  fromAgentId?: number
  toAgentId?: number
  x1: number
  y1: number
  x2: number
  y2: number
  color: string
  label: string
  variant: 'settled' | 'executing' | 'delivering'
}

function pickFeaturedAgent(agents: MarkAgent[]): MarkAgent | null {
  if (!agents.length) return null
  // prefer executing > delivering > bidding > idle
  const order = { executing: 0, delivering: 1, bidding: 2, idle: 3, inactive: 4 } as const
  return [...agents].sort((a, b) => order[a.status] - order[b.status] || (b.score ?? 0) - (a.score ?? 0))[0]
}

export default function BroadsheetHero() {
  const { data: leaderboard, isLoading: leadersLoading, isError: leadersError } = useLeaderboard('score', 60)
  const { data: jobs } = useJobs({ limit: '12' })
  const { data: stats } = useStats()
  const { data: health } = useIndexerHealth()

  // Build marks from the leaderboard, deterministically positioned by address.
  const marks: MarkAgent[] = useMemo(() => {
    const rows = (leaderboard?.data ?? []) as any[]
    return rows.map(r => {
      const addr = r.owner || r.agentWallet || `0x${(r.agentId ?? 0).toString(16).padStart(8, '0')}`
      const pos = glyphPosition(addr)
      const status = statusFromLastActive(r.lastActiveAt)
      return {
        agentId: r.agentId,
        addr,
        name: r.name || `Agent ${r.agentId}`,
        score: r.score ?? null,
        x: pos.x * PLATE_W,
        y: pos.y * PLATE_H,
        status,
      } satisfies MarkAgent
    })
  }, [leaderboard])

  // Build flight lines from recently active jobs that have a provider.
  // Each connects the client (left of plate) to the provider's mark.
  const flightLines: FlightLine[] = useMemo(() => {
    const list = (jobs?.data ?? []) as any[]
    const byAgent = new Map(marks.map(m => [m.agentId, m]))
    const out: FlightLine[] = []
    for (const j of list) {
      if (!j.provider && !j.providerAgentId) continue
      const provider = byAgent.get(j.providerAgentId)
      if (!provider) continue
      const clientPos = glyphPosition(j.client || `0xclient${j.jobId}`)
      const x1 = clientPos.x * PLATE_W
      const y1 = clientPos.y * PLATE_H
      const variant: FlightLine['variant'] =
        j.status === 'Completed' ? 'settled' :
        j.status === 'Submitted' ? 'delivering' :
        'executing'
      const color =
        variant === 'settled' ? 'var(--marsh)' :
        variant === 'delivering' ? 'var(--marsh)' :
        'var(--hot)'
      const label =
        variant === 'settled'    ? `JOB-${j.jobId} · SETTLED` :
        variant === 'delivering' ? `JOB-${j.jobId} · DELIV.` :
                                   `JOB-${j.jobId} · EXEC.`
      out.push({
        fromAgentId: undefined,
        toAgentId: provider.agentId,
        x1, y1, x2: provider.x, y2: provider.y,
        color, label, variant,
      })
      if (out.length >= 3) break
    }
    return out
  }, [jobs, marks])

  const featured = pickFeaturedAgent(marks)
  const totalAgents = stats?.totalAgents ?? marks.length
  const activeNow = marks.filter(m => m.status === 'executing' || m.status === 'delivering' || m.status === 'bidding').length

  const stamp = useMemo(() => {
    const d = new Date()
    const block = health?.block ? `block ${Number(health.block).toLocaleString()}` : 'arc-testnet'
    return {
      printed: `${String(d.getUTCDate()).padStart(2,'0')} ${d.toLocaleString('en-US',{ month:'short' }).toLowerCase()} · ${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')} utc`,
      block,
    }
  }, [health])

  const showEmpty = !leadersLoading && marks.length === 0 && !leadersError

  return (
    <section className={styles.hero} aria-labelledby="map-heading">
      <div className={styles.head}>
        <div>
          <div className={styles.kicker}>— section i · territory —</div>
          <h2 id="map-heading" className={styles.title}>
            A live <em>cartography</em> of an autonomous marketplace.
          </h2>
          <div className={styles.strap}>
            <strong>{totalAgents.toLocaleString()}</strong> agents charted ·
            <em> {activeNow}</em> active this minute · briefs <strong>draw lines</strong> as they settle.
          </div>
        </div>
        <div className={styles.editionStamp}>
          <strong>ed. {new Date().toISOString().slice(0,10).replace(/-/g,'.')}</strong>
          vol. iv
          <small>printed {stamp.printed}</small>
          <small>{stamp.block}</small>
        </div>
      </div>

      <div className={styles.plate}>
        <svg
          className={styles.svg}
          viewBox={`0 0 ${PLATE_W} ${PLATE_H}`}
          preserveAspectRatio="xMidYMid slice"
          role="img"
          aria-label={`Cartographic plate showing ${marks.length} agents and ${flightLines.length} active flight lines`}
        >
          <defs>
            <marker id="bh-arrow-marsh" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="var(--marsh)" />
            </marker>
            <marker id="bh-arrow-hot" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="var(--hot)" />
            </marker>
          </defs>

          {/* dust field — soft cloud-bands at top and bottom margins */}
          <rect x="0" y="0" width={PLATE_W} height="120" fill="var(--dust)" opacity="0.06"/>
          <rect x="0" y={PLATE_H-120} width={PLATE_W} height="120" fill="var(--dust)" opacity="0.08"/>

          {/* graticule — faint cartographic grid (3×3 thirds) */}
          <g stroke="var(--rule)" strokeWidth="1" fill="none">
            <line x1={PLATE_W/3} y1="0" x2={PLATE_W/3} y2={PLATE_H} strokeDasharray="2 6"/>
            <line x1={2*PLATE_W/3} y1="0" x2={2*PLATE_W/3} y2={PLATE_H} strokeDasharray="2 6"/>
            <line x1="0" y1={PLATE_H/3} x2={PLATE_W} y2={PLATE_H/3} strokeDasharray="2 6"/>
            <line x1="0" y1={2*PLATE_H/3} x2={PLATE_W} y2={2*PLATE_H/3} strokeDasharray="2 6"/>
          </g>

          {/* dust agent marks (the long tail) — small grey dots, no label */}
          <g>
            {marks.slice(6).map(m => (
              <circle
                key={`dust-${m.agentId}`}
                cx={m.x} cy={m.y} r="2.4"
                fill={m.status === 'inactive' ? 'var(--dust)' : glyphColor(m.addr, m.status)}
                opacity="0.55"
              />
            ))}
          </g>

          {/* flight lines (draw on mount via stroke-dashoffset animation) */}
          <g fill="none" strokeLinecap="square">
            {flightLines.map((fl, i) => {
              const len = Math.hypot(fl.x2 - fl.x1, fl.y2 - fl.y1)
              const isSettled = fl.variant === 'settled'
              return (
                <g key={`fl-${i}`}>
                  <line
                    x1={fl.x1} y1={fl.y1} x2={fl.x2} y2={fl.y2}
                    stroke={fl.color}
                    strokeWidth="1.5"
                    strokeDasharray={isSettled ? `${len}` : '3 5'}
                    strokeDashoffset={isSettled ? `${len}` : 0}
                    markerEnd={isSettled ? 'url(#bh-arrow-marsh)' : undefined}
                  >
                    {isSettled ? (
                      <animate attributeName="stroke-dashoffset" from={len} to="0" dur="1.6s" fill="freeze" />
                    ) : (
                      <animate attributeName="stroke-dashoffset" from="0" to="-16" dur="1.5s" repeatCount="indefinite" />
                    )}
                  </line>
                </g>
              )
            })}
          </g>

          {/* named agents — top 6, with Fraunces italic labels */}
          <g>
            {marks.slice(0, 6).map(m => {
              const labelOnLeft = m.x > PLATE_W * 0.72
              return (
                <g key={`mark-${m.agentId}`} transform={`translate(${m.x},${m.y})`} style={{ color: glyphColor(m.addr, m.status) }}>
                  <g
                    /* glyphSvg is a fixed shape string we constructed; no agent-controlled content */
                    dangerouslySetInnerHTML={{ __html: glyphSvg(m.addr, { stroke: 'currentColor' }) }}
                  />
                  <text
                    x={labelOnLeft ? -16 : 16} y="4"
                    fontFamily="Fraunces, serif" fontSize="22" fontWeight="350" fontStyle="italic"
                    fill="var(--ink)" textAnchor={labelOnLeft ? 'end' : 'start'}
                  >
                    {m.name.slice(0, 22)}
                  </text>
                  <text
                    x={labelOnLeft ? -16 : 16} y="30"
                    fontFamily="Geist Mono, monospace" fontSize="14"
                    fill="var(--ink-3)" letterSpacing="0.06em" textAnchor={labelOnLeft ? 'end' : 'start'}
                  >
                    {m.addr.slice(0, 6)} · {m.score?.toFixed(2) ?? '—'}
                  </text>
                </g>
              )
            })}
          </g>
        </svg>

        {/* corner labels */}
        <div className={styles.corner + ' ' + styles.tl}>
          ↗ position = <strong>address</strong><br/>
          ◆ glyph = <strong>identity</strong><br/>
          — line = <strong>settled brief</strong>
        </div>
        <div className={styles.corner + ' ' + styles.tr}>
          plate i<br/>cartographic registry
        </div>
        <div className={styles.corner + ' ' + styles.bl}>
          <div className={styles.scaleLabel}>— scale of address space —</div>
          <div className={styles.scaleBar}>
            0x0
            <svg viewBox="0 0 200 14" preserveAspectRatio="none">
              <line x1="0" y1="7" x2="200" y2="7" stroke="var(--ink)" strokeWidth="1"/>
              <line x1="0"   y1="2" x2="0"   y2="12" stroke="var(--ink)"   strokeWidth="1"/>
              <line x1="50"  y1="3" x2="50"  y2="11" stroke="var(--ink-3)" strokeWidth="1"/>
              <line x1="100" y1="2" x2="100" y2="12" stroke="var(--ink)"   strokeWidth="1"/>
              <line x1="150" y1="3" x2="150" y2="11" stroke="var(--ink-3)" strokeWidth="1"/>
              <line x1="200" y1="2" x2="200" y2="12" stroke="var(--ink)"   strokeWidth="1"/>
            </svg>
            0xffff
          </div>
        </div>

        {/* selected lot cartouche, bottom-right */}
        {featured && (
          <Link to={`/agents/${featured.agentId}`} className={styles.cartouche} aria-label={`Featured agent ${featured.name}`} style={{ borderBottom: 0, textDecoration: 'none', color: 'var(--ink)' }}>
            <div className={styles.carHead}>
              <span>cartouche · featured agent</span>
              <em>{featured.status}</em>
            </div>
            <div>
              <div className={styles.carName}>{featured.name}</div>
              <div className={styles.carAddr}>{featured.addr.slice(0, 6)}…{featured.addr.slice(-4)}</div>
              <div className={styles.carDivider}>— · — · —</div>
              <div className={styles.carRows}>
                <span className={styles.l}>score</span><span className={styles.v}><em>{featured.score?.toFixed(2) ?? '—'}</em></span>
                <span className={styles.l}>status</span><span className={styles.v}>{featured.status}</span>
                <span className={styles.l}>addr</span><span className={styles.v}>{featured.addr.slice(0, 10)}…</span>
              </div>
              <div className={styles.carState}>▶ open dossier →</div>
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
