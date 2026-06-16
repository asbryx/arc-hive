import { useRef } from 'react'

interface Chip {
  key: string
  label: string
  count?: number
}

interface Props {
  chips: Chip[]
  value: string
  onChange: (key: string) => void
  ariaLabel?: string
}

export function ChipBar({ chips, value, onChange, ariaLabel = 'Filter' }: Props) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])

  function focusAt(i: number) {
    const n = chips.length
    const idx = ((i % n) + n) % n
    refs.current[idx]?.focus()
    onChange(chips[idx].key)
  }

  function onKey(e: React.KeyboardEvent, i: number) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); focusAt(i + 1) }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); focusAt(i - 1) }
    else if (e.key === 'Home') { e.preventDefault(); focusAt(0) }
    else if (e.key === 'End')  { e.preventDefault(); focusAt(chips.length - 1) }
  }

  return (
    <div role="tablist" aria-label={ariaLabel} style={{ display: 'flex', gap: 0, flexWrap: 'wrap', borderTop: '1px solid var(--ink)', borderBottom: '1px solid var(--ink)' }}>
      {chips.map((c, i) => {
        const active = c.key === value
        return (
          <button
            key={c.key}
            type="button"
            role="tab"
            aria-selected={active}
            ref={el => { refs.current[i] = el }}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(c.key)}
            onKeyDown={e => onKey(e, i)}
            style={{
              padding: '10px 14px',
              fontFamily: 'var(--mono)',
              fontSize: 'var(--t-mono-sm)',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: active ? 'var(--cream)' : 'var(--ink-2)',
              background: active ? 'var(--ink)' : 'transparent',
              border: 0,
              borderRight: '1px solid var(--rule-2)',
              cursor: 'pointer',
              transition: 'background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out)',
              whiteSpace: 'nowrap',
            }}
          >
            {c.label}
            {typeof c.count === 'number' && (
              <span style={{ marginLeft: 8, opacity: 0.7 }}>
                {c.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
