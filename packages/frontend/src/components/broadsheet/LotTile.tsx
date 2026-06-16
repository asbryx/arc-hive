import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'

export type LotSize = 'feature' | 'standard' | 'compact' | 'tall'
export type LotCategory = 'code' | 'research' | 'audit' | 'brand' | 'copy' | 'trans'

interface Props {
  size?: LotSize
  category?: LotCategory
  reference?: string
  meta?: ReactNode
  activity?: ReactNode
  title: ReactNode
  summary?: ReactNode
  bidLabel?: ReactNode
  price?: ReactNode
  href: string
  /** when true: render with ink border + cream bg (used for my-perspective on Dashboard) */
  ownPerspective?: boolean
}

const CAT_BG: Record<LotCategory, string> = {
  code:     'var(--code-bg)',
  research: 'var(--research-bg)',
  audit:    'var(--audit-bg)',
  brand:    'var(--brand-bg)',
  copy:     'var(--copy-bg)',
  trans:    'var(--trans-bg)',
}
const CAT_FG: Record<LotCategory, string> = {
  code:     'var(--code-fg)',
  research: 'var(--research-fg)',
  audit:    'var(--audit-fg)',
  brand:    'var(--brand-fg)',
  copy:     'var(--copy-fg)',
  trans:    'var(--trans-fg)',
}

const TITLE_SIZE: Record<LotSize, string> = {
  feature:  'clamp(28px, 3.2vw, 48px)',
  tall:     'clamp(22px, 2vw, 28px)',
  standard: 'clamp(20px, 1.6vw, 24px)',
  compact:  'clamp(18px, 1.2vw, 20px)',
}

const SPAN: Record<LotSize, { col: number; row: number; minH: number }> = {
  feature:  { col: 7, row: 2, minH: 360 },
  tall:     { col: 4, row: 2, minH: 360 },
  standard: { col: 5, row: 1, minH: 220 },
  compact:  { col: 4, row: 1, minH: 190 },
}

export default function LotTile({
  size = 'standard',
  category = 'code',
  reference,
  meta,
  activity,
  title,
  summary,
  bidLabel,
  price,
  href,
  ownPerspective = false,
}: Props) {
  const bg = ownPerspective ? 'var(--cream)' : CAT_BG[category]
  const fg = ownPerspective ? 'var(--ink)' : CAT_FG[category]
  const span = SPAN[size]

  return (
    <Link
      to={href}
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        gap: 'var(--s-4)',
        padding: 'var(--s-7)',
        background: bg,
        color: fg,
        gridColumn: `span ${span.col}`,
        gridRow: `span ${span.row}`,
        minHeight: span.minH,
        position: 'relative',
        cursor: 'pointer',
        textDecoration: 'none',
        transition: 'background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out)',
        overflow: 'hidden',
        border: ownPerspective ? '1px solid var(--ink)' : 'none',
        ['--hover-bg' as any]: fg,
        ['--hover-fg' as any]: bg,
      }}
      onMouseEnter={e => {
        const el = e.currentTarget
        el.style.background = fg as string
        el.style.color = bg as string
      }}
      onMouseLeave={e => {
        const el = e.currentTarget
        el.style.background = bg as string
        el.style.color = fg as string
      }}
      onFocus={e => {
        const el = e.currentTarget
        el.style.background = fg as string
        el.style.color = bg as string
      }}
      onBlur={e => {
        const el = e.currentTarget
        el.style.background = bg as string
        el.style.color = fg as string
      }}
    >
      {/* top: meta row */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 'var(--s-3)',
            fontFamily: 'var(--mono)',
            fontSize: 'var(--t-mono-sm)',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            opacity: 0.78,
          }}
        >
          <span>{reference}</span>
          <span style={{ textAlign: 'right' }}>{meta}</span>
        </div>
        {activity && (
          <div
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 'var(--t-mono-sm)',
              letterSpacing: '0.06em',
            }}
          >
            {activity}
          </div>
        )}
        <div
          style={{
            fontFamily: 'var(--serif)',
            fontWeight: 300,
            fontSize: TITLE_SIZE[size],
            lineHeight: 1.05,
            letterSpacing: '-0.02em',
            fontVariationSettings: "'wght' 300, 'opsz' 64",
          }}
        >
          {title}
        </div>
        {summary && size !== 'compact' && (
          <p
            style={{
              fontFamily: 'var(--serif)',
              fontSize: 'var(--t-body)',
              lineHeight: 1.55,
              opacity: 0.88,
              maxWidth: 56 * 7, // ~7 char-widths * lines
              display: '-webkit-box',
              WebkitLineClamp: size === 'feature' ? 4 : 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {summary}
          </p>
        )}
      </div>
      {/* bottom: bid / price */}
      {(bidLabel || price) && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            borderTop: '1px solid currentColor',
            paddingTop: 'var(--s-3)',
            opacity: 0.95,
          }}
        >
          <div
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 'var(--t-mono-sm)',
              letterSpacing: '0.06em',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {bidLabel}
          </div>
          {price && (
            <div
              style={{
                fontFamily: 'var(--mono)',
                fontSize: size === 'feature' ? 'var(--t-h3)' : 'var(--t-h4)',
                fontWeight: 500,
                fontVariantNumeric: 'tabular-nums',
                lineHeight: 1,
              }}
            >
              {price}
            </div>
          )}
        </div>
      )}
    </Link>
  )
}
