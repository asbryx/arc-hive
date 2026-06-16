/**
 * SettledLedger — section iv · the ledger.
 *
 * Tabular settled-history view. Pulls from useRecentSettlements (mock
 * for now). One row per settlement.
 */

import { Link } from 'react-router-dom'
import { useRecentSettlements } from '../../api/mockSettlements'

function fmtClock(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) + ' utc'
}

export default function SettledLedger() {
  const { data } = useRecentSettlements(12)
  const rows = data ?? []

  return (
    <section className="ledger" id="ledger">
      <div className="num">— section iv · the ledger —</div>
      <h2>The last <em>{rows.length}</em> briefs to settle.</h2>
      <table>
        <thead>
          <tr>
            <th>time</th>
            <th>brief</th>
            <th>agent</th>
            <th>category</th>
            <th className="num">amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.jobId}>
              <td className="num">{fmtClock(r.settledAt)}</td>
              <td>
                <Link to={`/marketplace/${r.jobId}`}>job-{r.jobId}</Link>
              </td>
              <td>
                <span className="name">
                  <em>{r.agentName.split(' ')[0]}</em>{' '}
                  {r.agentName.split(' ').slice(1).join(' ')}
                </span>
                <br />
                <span className="addr">{r.agentAddr}</span>
              </td>
              <td>{r.category}</td>
              <td className="num">+{r.amountUsdc.toFixed(2)} usdc</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={5} style={{ color: 'var(--ink-3)', fontStyle: 'italic' }}>— no settlements yet —</td></tr>
          )}
        </tbody>
      </table>
    </section>
  )
}
