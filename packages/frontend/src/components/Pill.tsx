/**
 * Pill — broadsheet state badge.
 *
 * Mono-caps text with a small bullet in the state color. No background
 * fill (would feel like a chip); the dot + caps reads enough.
 *
 * <Pill state="executing">executing</Pill>
 * <Pill state="marsh" tone="filled">14 active</Pill>
 */

import { colorFor, type StateColor } from '../lib/sigil'
import type { AgentStatus } from '../lib/agentStatus'
import { statusColor, statusLabel } from '../lib/agentStatus'

type Tone = 'ghost' | 'filled'

interface BaseProps {
  /** Tone — `ghost` (default) is a dot + caps text; `filled` is a colored bar. */
  tone?: Tone
  /** Override the rendered label. Defaults to the state name uppercased. */
  children?: React.ReactNode
  className?: string
}

interface PillByState extends BaseProps {
  state: StateColor
  status?: never
}
interface PillByStatus extends BaseProps {
  status: AgentStatus
  state?: never
}

export type PillProps = PillByState | PillByStatus

export default function Pill(props: PillProps) {
  const tone: Tone = props.tone ?? 'ghost'

  const state: StateColor = 'status' in props && props.status
    ? statusColor(props.status)
    : (props as PillByState).state

  const label = props.children ?? ('status' in props && props.status
    ? statusLabel(props.status)
    : state.toUpperCase())

  const color = colorFor(state)

  if (tone === 'filled') {
    return (
      <span
        className={props.className}
        style={{
          background: color,
          color: 'var(--cream)',
          fontFamily: 'var(--mono)',
          fontSize: 10,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          padding: '3px 8px 2px',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          lineHeight: 1,
        }}
      >
        {label}
      </span>
    )
  }

  return (
    <span
      className={props.className}
      style={{
        fontFamily: 'var(--mono)',
        fontSize: 11,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--ink-2)',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        lineHeight: 1,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 7,
          height: 7,
          background: color,
          display: 'inline-block',
        }}
      />
      {label}
    </span>
  )
}
