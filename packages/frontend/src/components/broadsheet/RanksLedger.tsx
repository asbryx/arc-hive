import { Link } from 'react-router-dom'
import Sparkline from './Sparkline'
import { CopyableAddress } from '@/components/ui/CopyableAddress'

export interface RankRow {
  rank: number
  name?: string
  address: string
  score: number
  delta?: number
  jobs?: number
  spark?: number[]
  phase?: 'hot' | 'ochre' | 'marsh' | 'slate'
  /** when set, the row title links here (defaults to /agents/:address) */
  href?: string
}

interface Props {
  rows: RankRow[]
  caption?: string
  showSpark?: boolean
}

export default function RanksLedger({ rows, caption, showSpark = true }: Props) {
  if (!rows || rows.length === 0) return null

  return (
    <table
      style={{
        width: '100%',
        borderCollapse: 'collapse',
        fontFamily: 'var(--mono)',
        fontSize: 'var(--t-meta)',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {caption && (
        <caption className="caps" style={{ textAlign: 'left', padding: '0 0 12px', color: 'var(--ink-3)' }}>
          {caption}
        </caption>
      )}
      <thead>
        <tr style={{ borderBottom: '1px solid var(--ink)' }}>
          <th scope="col" style={cellHead(40, 'left')}>#</th>
          <th scope="col" style={cellHead('auto', 'left')}>agent</th>
          <th scope="col" style={cellHead(120, 'left')}>address</th>
          <th scope="col" style={cellHead(80, 'right')}>score</th>
          <th scope="col" style={cellHead(70, 'right')}>jobs</th>
          {showSpark && <th scope="col" style={cellHead(110, 'right')}>84d</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.address + r.rank} style={{ borderBottom: '1px solid var(--rule)' }}>
            <td style={cell('left')}>{String(r.rank).padStart(2, '0')}</td>
            <td style={cell('left')}>
              <Link to={r.href ?? `/agents/${r.address}`} style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', color: 'var(--ink)', fontVariationSettings: "'wght' 350, 'slnt' -10" }}>
                {r.name ?? r.address.slice(0, 8)}
              </Link>
            </td>
            <td style={cell('left')}>
              <CopyableAddress addr={r.address} />
            </td>
            <td style={cell('right')}>
              <span style={{ fontWeight: 500 }}>{Number(r.score).toFixed(2)}</span>
              {typeof r.delta === 'number' && (
                <span style={{ marginLeft: 8, color: r.delta > 0 ? 'var(--marsh)' : r.delta < 0 ? 'var(--hot)' : 'var(--ink-3)' }}>
                  {r.delta > 0 ? '↑' : r.delta < 0 ? '↓' : '·'}{Math.abs(r.delta).toFixed(2)}
                </span>
              )}
            </td>
            <td style={cell('right')}>{r.jobs ?? '—'}</td>
            {showSpark && (
              <td style={{ ...cell('right'), paddingRight: 0 }}>
                {r.spark && r.spark.length > 0
                  ? <Sparkline data={r.spark} phase={r.phase ?? 'marsh'} />
                  : <span style={{ color: 'var(--ink-3)' }}>—</span>}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function cellHead(w: number | string, align: 'left' | 'right'): React.CSSProperties {
  return {
    width: typeof w === 'number' ? w : w,
    padding: '8px 12px 8px 0',
    textAlign: align,
    fontFamily: 'var(--mono)',
    fontSize: 'var(--t-micro)',
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    color: 'var(--ink-3)',
    fontWeight: 400,
  }
}
function cell(align: 'left' | 'right'): React.CSSProperties {
  return {
    padding: '10px 12px 10px 0',
    textAlign: align,
    color: 'var(--ink)',
    verticalAlign: 'middle',
  }
}
