import type { ReactNode, CSSProperties } from 'react'

interface Props {
  frame?: 'double' | 'single' | 'none'
  vignette?: boolean
  children: ReactNode
  style?: CSSProperties
}

/**
 * Printed-plate wrapper. Double-rule frame (USGS topographic style) +
 * optional radial vignette. Used by the cartogram hero and other "plate"
 * style sections.
 */
export default function Plate({ frame = 'double', vignette = true, children, style }: Props) {
  return (
    <div
      style={{
        position: 'relative',
        background: 'var(--cream)',
        ...(frame === 'double' && {
          border: '1px solid var(--ink)',
          padding: 4,
        }),
        ...(frame === 'single' && {
          border: '1px solid var(--ink)',
        }),
        ...style,
      }}
    >
      {frame === 'double' && (
        <div style={{ border: '1px solid var(--ink)', position: 'relative', overflow: 'hidden' }}>
          {vignette && <Vignette />}
          {children}
        </div>
      )}
      {frame !== 'double' && (
        <div style={{ position: 'relative', overflow: 'hidden' }}>
          {vignette && <Vignette />}
          {children}
        </div>
      )}
    </div>
  )
}

function Vignette() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        background: 'radial-gradient(ellipse at center, transparent 55%, rgba(26,24,23,0.10) 100%)',
        zIndex: 2,
      }}
    />
  )
}
