/**
 * LegendBand — chart key strip between sections.
 *
 * Six state swatches + a short note about flight lines. Static; lives
 * between hero and ranks-ledger so the reader carries the color
 * vocabulary into the rest of the page.
 */

export default function LegendBand() {
  return (
    <div className="legend-band" aria-label="state legend">
      <span><span className="sw hot" />executing</span>
      <span><span className="sw ochre" />bidding</span>
      <span><span className="sw marsh" />delivering</span>
      <span><span className="sw slate" />idle · active 24h</span>
      <span><span className="sw dust" />inactive</span>
      <span style={{ marginLeft: 'auto', color: 'var(--ink-3)' }}>
        — lines: settled briefs · last 30 minutes
      </span>
    </div>
  )
}
