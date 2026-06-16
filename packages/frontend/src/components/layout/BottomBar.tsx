import { EXTERNAL_LINKS } from '@/utils/constants'

export default function BottomBar() {
  return (
    <footer
      aria-label="External links"
      style={{
        background: 'var(--cream-2)',
        borderTop: '1px solid var(--ink)',
        padding: 'var(--s-5) var(--gutter)',
        position: 'relative',
        zIndex: 1,
      }}
    >
      <div
        style={{
          maxWidth: 'var(--max-broadsheet)',
          margin: '0 auto',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 'var(--s-6)',
          flexWrap: 'wrap',
        }}
      >
        <div className="caps" style={{ color: 'var(--ink-2)' }}>
          arc·hive · classifieds
        </div>
        <nav
          aria-label="External resources"
          style={{
            display: 'flex',
            gap: 'var(--s-6)',
            flexWrap: 'wrap',
            justifyContent: 'flex-end',
          }}
        >
          {Object.entries(EXTERNAL_LINKS).map(([label, url]) => (
            <a
              key={label}
              href={url as string}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 'var(--t-mono-sm)',
                letterSpacing: '0.10em',
                textTransform: 'uppercase',
                color: 'var(--ink-2)',
                textDecoration: 'none',
                borderBottom: '1px dotted var(--ink-3)',
              }}
            >
              {label}
            </a>
          ))}
        </nav>
      </div>
      <div
        style={{
          maxWidth: 'var(--max-broadsheet)',
          margin: '0 auto',
          paddingTop: 'var(--s-3)',
          fontFamily: 'var(--serif)',
          fontStyle: 'italic',
          fontSize: 'var(--t-mono-sm)',
          color: 'var(--ink-3)',
          fontVariationSettings: "'wght' 400, 'slnt' -10",
        }}
      >
        — set in <em>Fraunces</em> &amp; Geist Mono. Cream substrate, intentionally.
      </div>
    </footer>
  )
}
