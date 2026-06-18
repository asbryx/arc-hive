/**
 * Lot — single duotone tile.
 *
 * Position + size come in as a TreemapTile from the parent's squarified
 * layout (lib/squarifiedTreemap.ts). The tile picks its typography
 * bucket from its rendered area, so a large area gets the feature
 * treatment (huge title, summary visible) and a tiny area drops to
 * just ref + title + price.
 *
 * Hover photonegative is in lots.css.
 */

import { Link } from 'react-router-dom'
import type { Lot as LotData } from '@/api/mockLots'
import type { TreemapTile } from '@/lib/squarifiedTreemap'

type SizeBucket = 'feature' | 'tall' | 'standard' | 'compact' | 'thin'

function bucketFor(area: number, h: number): SizeBucket {
  // Height gates the bucket independent of area: a wide-short tile must use a
  // compact layout (fewer title lines) or its content overflows the bottom.
  if (h < 150) return 'thin'
  if (h < 190) return 'compact'
  if (area >= 60000) return 'feature'
  if (area >= 34000) return 'tall'
  if (area >= 22000) return 'standard'
  return 'compact'
}

function formatAgo(min: number) {
  if (min < 60) return `${min}m ago`
  const h = Math.floor(min / 60)
  return `${h}h ago`
}

export default function Lot({ lot, tile }: { lot: LotData; tile: TreemapTile }) {
  const area = tile.w * tile.h
  const bucket = bucketFor(area, tile.h)
  const className = ['lot', `size-${bucket}`, `cat-${lot.category}`].join(' ')
  const cat = lot.category === 'translation' ? 'TRANSLATION' : lot.category.toUpperCase()
  const style: React.CSSProperties = {
    position: 'absolute',
    left:   `${tile.x}px`,
    top:    `${tile.y}px`,
    width:  `${tile.w}px`,
    height: `${tile.h}px`,
  }

  return (
    <Link
      to={`/marketplace/${lot.jobId}`}
      className={className}
      aria-label={`Open ${lot.ref}`}
      style={style}
    >
      <div className="meta">
        <span className="ref">{lot.ref}</span>
        <span>{cat}</span>
        <span>{formatAgo(lot.postedMinutesAgo)}</span>
      </div>
      {lot.isLive && <div className="activity">live · {lot.bidCount} bids</div>}
      <div
        className="title"
        // titles include sanctioned <em> markers from mockLots.ts
        dangerouslySetInnerHTML={{ __html: lot.title }}
      />
      <div className="summary">{lot.summary}</div>
      <div className="foot">
        <div className="bid-info">
          {lot.bidCount > 0 ? (
            <>
              CURRENT TOP<br />
              <strong>{lot.topBidUsdc.toFixed(2)} USDC · {lot.bidCount} bids</strong>
            </>
          ) : (
            <>
              RESERVE<br />
              <strong>{lot.reserveUsdc.toFixed(2)} USDC · awaiting bids</strong>
            </>
          )}
        </div>
        <div className="price">
          {(lot.bidCount > 0 ? lot.topBidUsdc : lot.reserveUsdc).toFixed(2)}
          <small>USDC</small>
        </div>
      </div>
    </Link>
  )
}
