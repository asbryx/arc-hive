/**
 * Sigil — render the deterministic sigil for an EVM address.
 *
 * Resolves to a single <use href="#sigil-base-NN"/> rotated by the seed's
 * orientation, colored by the seed's accent (or a caller-supplied state
 * color). The base-NN symbols live in <SigilDefs/> mounted once at App.
 */

import { sigilFor, colorFor, type StateColor } from '../lib/sigil'

export interface SigilProps {
  /** EVM address or any string identity. Determines shape/accent/orientation. */
  address: string | null | undefined
  /** Sigil edge length in CSS pixels. Defaults to 24. */
  size?: number
  /** Override the accent picked by the hash with an explicit state color. */
  state?: StateColor
  /** Custom title for SR users. Falls back to the address. */
  title?: string
  /** Optional className passthrough for layout. */
  className?: string
}

export default function Sigil({
  address,
  size = 24,
  state,
  title,
  className,
}: SigilProps) {
  const seed = sigilFor(address)
  const accent = state ?? seed.accent
  const id = String(seed.shape).padStart(2, '0')
  const label = title ?? (address ? `Sigil for ${address}` : 'Sigil')

  return (
    <svg
      role="img"
      aria-label={label}
      width={size}
      height={size}
      viewBox="-12 -12 24 24"
      className={className}
      style={{ color: colorFor(accent), display: 'inline-block', flexShrink: 0 }}
    >
      <title>{label}</title>
      <g transform={`rotate(${seed.orientation})`}>
        <use href={`#sigil-base-${id}`} />
      </g>
    </svg>
  )
}
