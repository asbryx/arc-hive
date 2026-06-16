import type { ReactNode } from 'react'

interface Props {
  /** section i / ii / iii / iv — set as roman numeral */
  section?: string
  eyebrow?: string
  title: ReactNode
  strap?: ReactNode
  align?: 'left' | 'center'
}

/**
 * Headline block used at the top of every page section. Mono-caps eyebrow,
 * Fraunces hero title with italic accents, optional strap below.
 */
export default function BroadsheetHeader({ section, eyebrow, title, strap, align = 'left' }: Props) {
  const eyebrowText = section
    ? `— section ${section} · ${eyebrow ?? ''}${eyebrow ? ' ' : ''}—`
    : eyebrow

  return (
    <header
      style={{
        padding: 'var(--s-10) var(--gutter) var(--s-6)',
        borderBottom: '1px solid var(--rule)',
        textAlign: align,
      }}
    >
      {eyebrowText && (
        <div className="caps" style={{ marginBottom: 'var(--s-4)' }}>
          {eyebrowText}
        </div>
      )}
      <h1
        style={{
          fontFamily: 'var(--serif)',
          fontWeight: 200,
          fontSize: 'var(--t-h1)',
          lineHeight: 0.95,
          letterSpacing: '-0.025em',
          color: 'var(--ink)',
          fontVariationSettings: "'wght' 200, 'opsz' 96",
          maxWidth: 1200,
        }}
      >
        {title}
      </h1>
      {strap && (
        <div
          style={{
            marginTop: 'var(--s-5)',
            fontFamily: 'var(--mono)',
            fontSize: 'var(--t-mono-sm)',
            color: 'var(--ink-2)',
            letterSpacing: '0.04em',
            maxWidth: 720,
          }}
        >
          {strap}
        </div>
      )}
    </header>
  )
}
