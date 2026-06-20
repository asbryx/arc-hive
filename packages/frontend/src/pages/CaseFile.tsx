/**
 * CaseFile — "The Case File" stamped dossier (M2 detail page), preview path.
 *
 * Reads from mockMarketplace.useBrief and renders the full on-chain hiring
 * lifecycle as a broadsheet dossier: case header, the brief body, a STAMPED
 * EVENT TIMELINE (posted → bids → awarded → escrowed → filed → assayed →
 * settled, each sealed with its on-chain tx hash), and contextual action
 * panels surfaced by job state (bid / award / escrow / file / assay / approve).
 *
 * Preview only (VITE_USE_MOCK_STATS). Prod uses the real MarketplaceDetail
 * with the actual on-chain contract calls — those are preserved untouched.
 * The on-chain handlers get ported into this themed shell once the design is
 * approved. Action buttons here are visual (no real wallet calls).
 */

import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useBrief, type Bid } from '@/api/mockMarketplace'
import { CATEGORY_LABEL, STATUS_STAMP, STATUS_COLOR, fmtBudget, fmtDeadline, fmtAgo, ACTION_VERB } from '@/lib/briefVocab'
import './casefile.css'

const SEAL = 'sealed on-chain'

export default function CaseFile() {
  const { id } = useParams()
  const { data: brief, isLoading } = useBrief(id ?? '')
  const [bidForm, setBidForm] = useState({ message: '', proposedBudget: '' })
  const [deliverForm, setDeliverForm] = useState({ content: '', link: '', notes: '' })
  const [rejectReason, setRejectReason] = useState('')
  const [commentText, setCommentText] = useState('')

  if (isLoading) return <div className="cf-page"><div className="cf-empty">opening the case file…</div></div>
  if (!brief) return (
    <div className="cf-page">
      <Link to="/marketplace" className="cf-back">← back to the classifieds</Link>
      <div className="cf-empty">no case file under this number. the lot may have been withdrawn.</div>
    </div>
  )

  const status = brief.status
  const isClient = false     // preview: viewer is a visitor; prod gates by wallet
  const canBid = status === 'open' || status === 'bidding'
  const canEscrow = status === 'awarded'
  const canFile = status === 'escrowed'
  const canReview = status === 'filed' || status === 'assayed'
  const bids = brief.bids ?? []
  const timeline = brief.timeline ?? []
  const comments = brief.comments ?? []

  return (
    <div className="cf-page">
      <Link to="/marketplace" className="cf-back">← back to the classifieds</Link>

      {/* ─── case header ─── */}
      <div className="cf-head">
        <div className="cf-head-top">
          <div className="cf-head-lot">LOT {brief.lotNo}<span className="cf-cat">{CATEGORY_LABEL[brief.category]}</span></div>
          <div className="cf-stamp" style={{ color: STATUS_COLOR[status] }}>{STATUS_STAMP[status]}</div>
        </div>
        <h1 className="cf-title">{brief.title}</h1>
        <div className="cf-meta">
          <span>budget <b>{fmtBudget(brief.budgetMin, brief.budgetMax)}</b></span>
          <span><b>{fmtDeadline(brief.deadlineHours)}</b></span>
          <span>bids <b>{brief.applicationCount}</b></span>
          <span>posted <b>{fmtAgo(brief.createdAt)}</b></span>
          <span className="cf-client">filed by {brief.clientName}</span>
        </div>
      </div>

      {/* ─── the brief ─── */}
      <div className="cf-section-label">the brief</div>
      <div className="cf-body">
        <p>{brief.title} {brief.summary}</p>
      </div>
      <div className="cf-req">{brief.requirements}</div>

      {/* ─── event timeline (the centerpiece) ─── */}
      <div className="cf-section-label">the record · stamped chronology</div>
      <div className="cf-timeline">
        {timeline.map((e, i) => (
          <div key={i} className={`cf-event ${e.txHash ? 'cf-sealed' : ''}`}>
            <div className="cf-event-time">{fmtAgo(e.at)}</div>
            <div className="cf-event-body">
              <div className="cf-event-verb">{e.event}</div>
              <div className="cf-event-detail">{e.detail}</div>
              {e.txHash && (
                <div className="cf-event-tx"><span className="cf-seal">{SEAL}</span> · {e.txHash.slice(0, 18)}…{e.txHash.slice(-6)}</div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ─── contextual action panels ─── */}

      {/* bid (agent) */}
      {canBid && (
        <>
          <div className="cf-section-label">{ACTION_VERB.bid}</div>
          <div className="cf-panel">
            <div className="cf-hint">Enter a bid for this brief. The client awards at their discretion; the chosen bid funds on-chain as escrow.</div>
            <label className="cf-field">
              <span className="cf-field-label">your note to the client</span>
              <textarea className="cf-textarea" placeholder="Read the brief. Can turn this around in the window…" value={bidForm.message} onChange={e => setBidForm(f => ({ ...f, message: e.target.value }))} />
            </label>
            <label className="cf-field">
              <span className="cf-field-label">proposed budget · USDC</span>
              <input className="cf-input" type="number" step="0.01" placeholder="1.40" value={bidForm.proposedBudget} onChange={e => setBidForm(f => ({ ...f, proposedBudget: e.target.value }))} />
            </label>
            <button className="cf-btn" type="button">{ACTION_VERB.bid} ↗</button>
          </div>
        </>
      )}

      {/* bids list (client, pre-award) */}
      {bids.length > 0 && status !== 'settled' && status !== 'expired' && (
        <>
          <div className="cf-section-label">the bids · {bids.length} entered</div>
          <div className="cf-bids">
            {bids.map(b => (
              <div key={b.id} className="cf-bid">
                <div className="cf-bid-name">{b.agentName}<span className="cf-bid-addr">{b.applicantAddress}</span></div>
                <div className="cf-bid-budget">{b.proposedBudget.toFixed(2)} USDC</div>
                <div className="cf-bid-jobs">{b.completedJobs} settled</div>
                {b.status === 'selected' ? <div className="cf-bid-sel">awarded</div> : <div className="cf-bid-sel" style={{ visibility: 'hidden' }}>—</div>}
                {b.message && <div className="cf-bid-msg">{b.message}</div>}
              </div>
            ))}
          </div>
          {status === 'bidding' && (
            <div className="cf-panel" style={{ marginTop: 16 }}>
              <div className="cf-hint">As the client, award the brief to one bidder. The award is sealed on-chain; the winner is then escrowed.</div>
              <button className="cf-btn" type="button">{ACTION_VERB.award} ↗</button>
            </div>
          )}
        </>
      )}

      {/* escrow (client, post-award) */}
      {canEscrow && (
        <>
          <div className="cf-section-label">{ACTION_VERB.escrow}</div>
          <div className="cf-panel">
            <div className="cf-hint">Fund the escrow. USDC is approved to the commerce contract, then locked against the awarded agent until the return is approved.</div>
            <div className="cf-btn-row">
              <button className="cf-btn" type="button">1 · approve USDC</button>
              <button className="cf-btn cf-ghost" type="button">2 · fund escrow</button>
            </div>
          </div>
        </>
      )}

      {/* file the return (agent) */}
      {canFile && (
        <>
          <div className="cf-section-label">{ACTION_VERB.file}</div>
          <div className="cf-panel">
            <div className="cf-hint">File the return. A link to the deliverable plus a short note on method. The client reviews and the assay scores it.</div>
            <label className="cf-field">
              <span className="cf-field-label">the return · link or content</span>
              <textarea className="cf-textarea" placeholder="https://…  —  or paste the deliverable here" value={deliverForm.content} onChange={e => setDeliverForm(f => ({ ...f, content: e.target.value }))} />
            </label>
            <label className="cf-field">
              <span className="cf-field-label">link (optional)</span>
              <input className="cf-input" type="url" placeholder="https://example.com/return" value={deliverForm.link} onChange={e => setDeliverForm(f => ({ ...f, link: e.target.value }))} />
            </label>
            <label className="cf-field">
              <span className="cf-field-label">notes on method</span>
              <input className="cf-input" placeholder="Two passes done. Open to one revision." value={deliverForm.notes} onChange={e => setDeliverForm(f => ({ ...f, notes: e.target.value }))} />
            </label>
            <button className="cf-btn" type="button">{ACTION_VERB.file} ↗</button>
          </div>
        </>
      )}

      {/* deliverable readout (filed+) */}
      {brief.deliverable && (
        <>
          <div className="cf-section-label">the return · as filed</div>
          <div className="cf-deliv">
            <p>{brief.deliverable.content}</p>
            {brief.deliverable.link && <a className="cf-deliv-link" href={brief.deliverable.link} target="_blank" rel="noreferrer noopener">view the return ↗</a>}
            {brief.deliverable.notes && <p style={{ color: 'var(--ink-3)', fontStyle: 'italic', fontSize: 13, marginTop: 10 }}>{brief.deliverable.notes}</p>}
          </div>
        </>
      )}

      {/* the assay (assayed+) */}
      {brief.assay && (
        <>
          <div className="cf-section-label">{ACTION_VERB.assay}</div>
          <div className="cf-panel">
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 4 }}>
              <span className="cf-assay-score">{brief.assay.score.toFixed(2)}</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-3)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>composite score</span>
            </div>
            <div className="cf-assay-break">
              <span>completeness <b>{brief.assay.breakdown.completeness}/10</b></span>
              <span>quality <b>{brief.assay.breakdown.quality}/10</b></span>
              <span>effort <b>{brief.assay.breakdown.effort}/10</b></span>
              <span>format <b>{brief.assay.breakdown.format}/10</b></span>
            </div>
            <p className="cf-assay-reason">{brief.assay.reasoning}</p>
            {brief.assay.suggestions && <p className="cf-assay-reason" style={{ marginTop: 8 }}>Suggested for the next pass: {brief.assay.suggestions}</p>}
          </div>
        </>
      )}

      {/* approve / reject (client, filed/assayed) */}
      {canReview && (
        <>
          <div className="cf-section-label">the verdict</div>
          <div className="cf-panel">
            <div className="cf-hint">Approve to remit the escrowed USDC to the agent on-chain, or return with a reason for revision.</div>
            <label className="cf-field">
              <span className="cf-field-label">reason for return (if returning)</span>
              <input className="cf-input" placeholder="One section needs a second pass…" value={rejectReason} onChange={e => setRejectReason(e.target.value)} />
            </label>
            <div className="cf-btn-row">
              <button className="cf-btn" type="button">{ACTION_VERB.approve} ↗</button>
              <button className="cf-btn cf-ghost cf-danger" type="button">{ACTION_VERB.reject}</button>
            </div>
          </div>
        </>
      )}

      {/* correspondence */}
      <div className="cf-section-label">{ACTION_VERB.comment}</div>
      {comments.length === 0 ? (
        <div className="cf-empty">no correspondence yet.</div>
      ) : (
        comments.map(c => (
          <div key={c.id} className="cf-comment">
            <div className="cf-comment-head"><span className="cf-comment-name">{c.authorName}</span> · {fmtAgo(c.at)}</div>
            <div className="cf-comment-body">{c.body}</div>
          </div>
        ))
      )}
      <div className="cf-panel" style={{ marginTop: 14 }}>
        <label className="cf-field">
          <span className="cf-field-label">add to the correspondence</span>
          <textarea className="cf-textarea" placeholder="A clarification or a question…" value={commentText} onChange={e => setCommentText(e.target.value)} />
        </label>
        <button className="cf-btn cf-ghost" type="button">post ↗</button>
      </div>
    </div>
  )
}
