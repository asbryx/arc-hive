import { forwardRef } from 'react'
import type { ButtonHTMLAttributes, AnchorHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'ghost' | 'destructive' | 'phase'
type Size = 'sm' | 'md' | 'lg'

interface CommonProps {
  variant?: Variant
  size?: Size
  full?: boolean
  children: ReactNode
  /** when variant='phase', supply one of hot/ochre/marsh/slate */
  phase?: 'hot' | 'ochre' | 'marsh' | 'slate'
}

type ButtonProps = CommonProps & ButtonHTMLAttributes<HTMLButtonElement> & { as?: 'button' }
type LinkProps = CommonProps & AnchorHTMLAttributes<HTMLAnchorElement> & { as: 'a'; href: string }

export type AnyButtonProps = ButtonProps | LinkProps

const PAD: Record<Size, string> = {
  sm: '6px 12px',
  md: '10px 18px',
  lg: '14px 26px',
}

const FONT_SIZE: Record<Size, string> = {
  sm: 'var(--t-mono-sm)',
  md: 'var(--t-meta)',
  lg: 'var(--t-body)',
}

function styleFor(variant: Variant, size: Size, full: boolean, phase?: CommonProps['phase']) {
  const phaseColor =
    phase === 'hot' ? 'var(--hot)' :
    phase === 'ochre' ? 'var(--ochre)' :
    phase === 'marsh' ? 'var(--marsh)' :
    phase === 'slate' ? 'var(--slate)' : 'var(--ink)'

  const base: React.CSSProperties = {
    fontFamily: 'var(--mono)',
    fontSize: FONT_SIZE[size],
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    padding: PAD[size],
    border: '1px solid var(--ink)',
    background: 'transparent',
    color: 'var(--ink)',
    cursor: 'pointer',
    transition: 'background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: full ? '100%' : undefined,
    whiteSpace: 'nowrap',
    textDecoration: 'none',
  }

  if (variant === 'primary') {
    return {
      ...base,
      background: 'var(--ink)',
      color: 'var(--cream)',
    }
  }
  if (variant === 'destructive') {
    return {
      ...base,
      borderColor: 'var(--hot)',
      color: 'var(--hot)',
    }
  }
  if (variant === 'phase') {
    return {
      ...base,
      borderColor: phaseColor,
      color: phaseColor,
    }
  }
  // ghost
  return base
}

export const Button = forwardRef<HTMLButtonElement | HTMLAnchorElement, AnyButtonProps>(function Button(props, ref) {
  const { variant = 'ghost', size = 'md', full = false, phase, children, as, style, ...rest } = props as any
  const merged = { ...styleFor(variant, size, full, phase), ...(style || {}) }

  if (as === 'a') {
    const { href, ...linkRest } = rest as LinkProps
    return (
      <a ref={ref as any} href={href} style={merged} {...linkRest}>
        {children}
      </a>
    )
  }
  return (
    <button ref={ref as any} type="button" style={merged} {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}>
      {children}
    </button>
  )
})
