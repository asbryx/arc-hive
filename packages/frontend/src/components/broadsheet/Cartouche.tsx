import type { ReactNode } from 'react'

interface Row { k: string; v: ReactNode }

interface Props {
  title: ReactNode
  subtitle?: ReactNode
  rows?: Row[]
  footer?: ReactNode
  variant?: 'paper' | 'cream-2'
}

/**
 * Decorated info-block borrowed from antique-map cartouches. Bottom-right
 * sidebar on the cartogram; standalone "manifest" on agent profiles.
 */
export default function Cartouche({ title, subtitle, rows = [], footer, variant = 'cream-2' }: Props) {
  return (
    <aside
      style={{
        background: variant === 'paper' ? 'var(--paper)' : 'var(--cream-2)',
        border: '1px solid var(--ink)',
        padding: 'var(--s-5)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--s-3)',
        maxWidth: 360,
      }}
    >
      <div style={{ borderBottom: '1px solid var(--rule-2)', paddingBottom: 'var(--s-3)' }}>
        <div
          style={{
            fontFamily: 'var(--serif)',
            fontWeight: 300,
            fontSize: 'var(--t-h3)',
            lineHeight: 1,
            letterSpacing: '-0.02em',
            fontVariationSettings: "'wght' 300, 'opsz' 48",
          }}
        >
          {title}
        </div>
        {subtitle && (
          <div className="caps" style={{ marginTop: 6 }}>
            {subtitle}
          </div>
        )}
      </div>
      {rows.length > 0 && (
        <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 16px' }}>
          {rows.map((r, i) => (
            <div key={i} style={{ display: 'contents' }}>
              <dt className="caps" style={{ alignSelf: 'baseline' }}>{r.k}</dt>
              <dd style={{ fontFamily: 'var(--mono)', fontSize: 'var(--t-mono-sm)', color: 'var(--ink)' }}>{r.v}</dd>
            </div>
          ))}
        </dl>
      )}
      {footer && (
        <div style={{ borderTop: '1px solid var(--rule-2)', paddingTop: 'var(--s-3)', fontSize: 'var(--t-meta)', color: 'var(--ink-2)' }}>
          {footer}
        </div>
      )}
    </aside>
  )
}
