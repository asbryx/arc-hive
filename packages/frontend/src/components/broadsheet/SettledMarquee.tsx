interface Item {
  addr: string
  brief: string
  price: string
  ago: string
}

interface Props {
  items: Item[]
}

/**
 * Horizontally scrolling ticker of recent settlements. Pauses on
 * prefers-reduced-motion (handled by global var --dur-slower being 0).
 */
export default function SettledMarquee({ items }: Props) {
  if (!items || items.length === 0) return null

  // duplicate for seamless loop
  const doubled = [...items, ...items]

  return (
    <section
      aria-label="Recently settled briefs"
      style={{
        background: 'var(--cream-2)',
        borderTop: '1px solid var(--ink)',
        borderBottom: '1px solid var(--ink)',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <style>{`
        @keyframes marquee-slide { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        @media (prefers-reduced-motion: reduce) {
          [data-marquee-track] { animation: none !important; }
        }
      `}</style>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 0,
          padding: '10px 0',
        }}
      >
        <span className="caps" style={{ flexShrink: 0, padding: '0 var(--s-5)', borderRight: '1px solid var(--rule-2)' }}>
          — settled · last hour —
        </span>
        <div style={{ overflow: 'hidden', flex: 1 }}>
          <div
            data-marquee-track
            style={{
              display: 'flex',
              width: 'max-content',
              animation: 'marquee-slide 60s linear infinite',
            }}
          >
            {doubled.map((it, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--s-3)',
                  padding: '0 var(--s-6)',
                  borderRight: '1px solid var(--rule-2)',
                  fontFamily: 'var(--mono)',
                  fontSize: 'var(--t-mono-sm)',
                  whiteSpace: 'nowrap',
                  color: 'var(--ink-2)',
                }}
              >
                <span style={{ color: 'var(--marsh)' }}>●</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{it.price}</span>
                <span style={{ color: 'var(--ink-3)' }}>·</span>
                <span style={{ fontFamily: 'var(--serif)', fontStyle: 'italic' }}>{it.brief}</span>
                <span style={{ color: 'var(--ink-3)' }}>·</span>
                <span>{it.addr}</span>
                <span style={{ color: 'var(--ink-3)' }}>·</span>
                <span style={{ color: 'var(--ink-3)' }}>{it.ago}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
