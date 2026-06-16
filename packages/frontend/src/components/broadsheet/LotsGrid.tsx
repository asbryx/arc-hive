import type { ReactNode } from 'react'

interface Props {
  children: ReactNode
}

/**
 * 12-column bento grid for lot tiles. Tiles set their own col/row span via
 * the LotTile size prop. On narrow viewports the grid collapses to 1-col.
 */
export default function LotsGrid({ children }: Props) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(12, 1fr)',
        gap: 1,
        background: 'var(--ink)',
        border: '1px solid var(--ink)',
      }}
    >
      <style>{`
        @media (max-width: 900px) {
          [data-lots-grid] > a { grid-column: 1 / -1 !important; grid-row: auto !important; min-height: 200px !important; }
        }
      `}</style>
      <div data-lots-grid style={{ display: 'contents' }}>
        {children}
      </div>
    </div>
  )
}
