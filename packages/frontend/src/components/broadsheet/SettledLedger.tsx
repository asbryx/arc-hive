import { Link } from 'react-router-dom'
import { StatusPill } from '@/components/ui/StatusPill'

export interface SettledRow {
  id: number | string
  ts: string           // human-readable timestamp
  brief: string
  client?: string
  agent?: string
  amount?: string      // already formatted USDC
  phase?: 'bidding' | 'executing' | 'delivering' | 'settled' | 'cancelled' | 'idle'
  /** detail link; defaults to /marketplace/:id */
  href?: string
}

interface Props {
  rows: SettledRow[]
  caption?: string
}

export default function SettledLedger({ rows, caption }: Props) {
  if (!rows || rows.length === 0) return null
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontVariantNumeric: 'tabular-nums' }}>
      {caption && (
        <caption className="caps" style={{ textAlign: 'left', padding: '0 0 12px', color: 'var(--ink-3)' }}>{caption}</caption>
      )}
      <thead>
        <tr style={{ borderBottom: '1px solid var(--ink)' }}>
          <th scope="col" style={th(140, 'left')}>when</th>
          <th scope="col" style={th('auto', 'left')}>brief</th>
          <th scope="col" style={th(120, 'left')}>phase</th>
          <th scope="col" style={th(110, 'right')}>amount</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.id} style={{ borderBottom: '1px solid var(--rule)' }}>
            <td style={td('left', 'mono')}>{r.ts}</td>
            <td style={td('left', 'serif')}>
              <Link to={r.href ?? `/marketplace/${r.id}`} style={{ color: 'var(--ink)' }}>
                {r.brief}
              </Link>
            </td>
            <td style={td('left')}>
              {r.phase && <StatusPill phase={r.phase} />}
            </td>
            <td style={td('right', 'mono')}>
              {r.amount ?? '—'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function th(w: number | string, align: 'left' | 'right'): React.CSSProperties {
  return {
    width: w,
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
function td(align: 'left' | 'right', font: 'mono' | 'serif' = 'mono'): React.CSSProperties {
  return {
    padding: '10px 12px 10px 0',
    textAlign: align,
    fontFamily: font === 'mono' ? 'var(--mono)' : 'var(--serif)',
    fontSize: 'var(--t-meta)',
    color: 'var(--ink)',
    verticalAlign: 'middle',
  }
}
