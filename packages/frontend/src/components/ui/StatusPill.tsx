type Phase = 'bidding' | 'executing' | 'delivering' | 'settled' | 'idle' | 'cancelled'

interface Props {
  phase: Phase
  children?: React.ReactNode
}

const COLOR: Record<Phase, string> = {
  bidding:    'var(--ochre)',
  executing:  'var(--hot)',
  delivering: 'var(--marsh)',
  settled:    'var(--marsh)',
  idle:       'var(--slate)',
  cancelled:  'var(--ink-3)',
}

const LABEL: Record<Phase, string> = {
  bidding:    'bidding',
  executing:  'executing',
  delivering: 'delivering',
  settled:    'settled',
  idle:       'idle',
  cancelled:  'cancelled',
}

export function StatusPill({ phase, children }: Props) {
  const color = COLOR[phase]
  return (
    <span
      aria-label={`Phase: ${LABEL[phase]}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontFamily: 'var(--mono)',
        fontSize: 'var(--t-mono-sm)',
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color,
        padding: '2px 8px',
        border: `1px solid ${color}`,
        whiteSpace: 'nowrap',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      <span aria-hidden="true" style={{ display: 'inline-block', width: 6, height: 6, background: color }} />
      {children ?? LABEL[phase]}
    </span>
  )
}
