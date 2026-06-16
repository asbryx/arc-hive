/**
 * Lot — single duotone tile.
 *
 * Per _design-archive/components/lot-tile-spec.md. Photonegative hover
 * is handled in home.css. The component is markup only; size + category
 * come in as classes.
 */

import { Link } from 'react-router-dom'
import type { Lot as LotData } from '@/api/mockLots'

function formatAgo(min: number) {
  if (min < 60) return `${min}m ago`
  const h = Math.floor(min / 60)
  return `${h}h ago`
}

export default function Lot({ lot }: { lot: LotData }) {
  const className = ['lot', lot.size, `cat-${lot.category}`].join(' ')
  const cat = lot.category === 'translation' ? 'TRANSLATION' : lot.category.toUpperCase()
  return (
    <Link to={`/marketplace/${lot.jobId}`} className={className} aria-label={`Open ${lot.ref}`}>
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
