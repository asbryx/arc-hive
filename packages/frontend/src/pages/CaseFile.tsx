/**
 * CaseFile — "The Case File" stamped dossier (M2 detail page), preview path.
 *
 * Reads from mockMarketplace.useBrief and renders the full on-chain hiring
 * lifecycle as a broadsheet dossier: case header, the brief body, a STAMPED
 * EVENT TIMELINE (posted → bids → awarded → escrowed → filed → assayed →
 * settled, each sealed with its on-chain tx hash), and contextual action
 * panels surfaced by job state (bid / award / escrow / file / assay / approve).
 *
 * with the actual on-chain contract calls — those are preserved untouched.
 */

import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { readContract, waitForTransactionReceipt } from '@wagmi/core'
import { parseUnits } from 'viem'
import { useConnectModal } from '@rainbow-me/rainbowkit'
import { useQueryClient } from '@tanstack/react-query'
import { authFetch } from '@/api/client'
import { useBrief } from '@/api/adapters/marketplace'
import { useGuardedWriteContract } from '@/hooks/useGuardedWriteContract'
import { AGENTIC_COMMERCE, AGENTIC_COMMERCE_ABI, USDC_ADDRESS, USDC_ABI } from '@/lib/contracts'
import { arcTestnet, config } from '@/lib/wagmi'
import { type Bid, type DeliverableVersion, type Evaluation, type DeliverableFile } from '@/api/types'
import { CATEGORY_LABEL, STATUS_STAMP, STATUS_COLOR, fmtBudget, fmtDeadline, fmtAgo, ACTION_VERB } from '@/lib/briefVocab'
import './casefile.css'

const ZERO_ADDR = '0x0000000000000000000000000000000000000000' as const

/** Human-readable on-chain error from a revert/viem error. */
function chainErr(e: any): string {
  const raw = String(e?.shortMessage || e?.message || e || '')
  if (/User rejected|denied|rejected the request/i.test(raw)) return 'Transaction cancelled in wallet.'
  if (/insufficient funds|InsufficientBudget/i.test(raw)) return 'Not enough USDC balance to fund this job.'
  if (/allowance|InsufficientAllowance/i.test(raw)) return 'USDC approval needed — approve spending first.'
  if (/NotClient/i.test(raw)) return 'Only the job poster can do this.'
  return raw.slice(0, 160) || 'On-chain transaction failed.'
}

const SEAL = 'sealed on-chain'

const EVAL_STATUS_LABEL: Record<Evaluation['status'], string> = {
  approved: '✓ approved',
  revision_needed: '↻ revision needed',
  failed: '✗ failed',
}
const VER_STATUS_LABEL: Record<DeliverableVersion['status'], string> = {
  submitted: 'awaiting assay',
  approved: 'approved',
  revision_requested: 'returned for revision',
  failed: 'failed',
}

/** live deadline countdown from deadlineAt. */
function fmtCountdown(deadlineAt: string): { text: string; expired: boolean } {
  const ms = new Date(deadlineAt).getTime() - Date.now()
  if (ms <= 0) return { text: 'window closed', expired: true }
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  if (h >= 24) return { text: `${Math.floor(h / 24)}d ${h % 24}h left`, expired: false }
  if (h > 0) return { text: `${h}h ${m}m left`, expired: false }
  return { text: `${m}m left`, expired: false }
}

function fmtFileSize(kb: number): string {
  if (kb >= 1024) return `${(kb / 1024).toFixed(1)} MB`
  return `${kb} KB`
}
function fmtFileExpiry(f: DeliverableFile): { text: string; expired: boolean } {
  if (f.expiresAt == null) return { text: 'expired', expired: true }
  if (f.hoursUntilExpiry == null) return { text: 'expired', expired: true }
  const h = f.hoursUntilExpiry
  if (h < 1) return { text: '<1h left', expired: false }
  return { text: `${h}h left`, expired: false }
}

export default function CaseFile() {
  const { id } = useParams()
  const { data: brief, isLoading } = useBrief(id ?? '')
  const { address, isConnected } = useAccount()
  const { openConnectModal } = useConnectModal()
  const { writeContractAsync } = useGuardedWriteContract()
  const queryClient = useQueryClient()
  const [bidForm, setBidForm] = useState({ message: '', proposedBudget: '' })
  const [deliverForm, setDeliverForm] = useState({ content: '', link: '', notes: '' })
  const [deliverFiles, setDeliverFiles] = useState<File[]>([])
  const [rejectReason, setRejectReason] = useState('')
  const [commentText, setCommentText] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionOk, setActionOk] = useState<string | null>(null)

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['brief', String(id)] })

  // ── apply / bid (provider, API-only) ──
  async function handleBid() {
    if (!isConnected) { openConnectModal?.(); return }
    if (!address) return
    setActionError(null); setActionOk(null); setBusy('bid')
    try {
      const res = await authFetch(`/open-jobs/${id}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicantAddress: address,
          message: bidForm.message || null,
          proposedBudget: bidForm.proposedBudget || null,
        }),
      })
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Bid failed') }
      setActionOk('Your bid was entered.')
      setBidForm({ message: '', proposedBudget: '' })
      refresh()
    } catch (e: any) { setActionError(e.message || 'Bid failed') }
    finally { setBusy(null) }
  }

  // ── deliver (provider, API + optional file upload) ──
  async function handleDeliver() {
    if (!isConnected) { openConnectModal?.(); return }
    if (!address || (!deliverForm.content && deliverFiles.length === 0)) return
    setActionError(null); setActionOk(null); setBusy('deliver')
    try {
      let res: Response
      if (deliverFiles.length > 0) {
        const fd = new FormData()
        fd.append('applicantAddress', address)
        if (deliverForm.content) fd.append('content', deliverForm.content)
        if (deliverForm.link) fd.append('link', deliverForm.link)
        if (deliverForm.notes) fd.append('notes', deliverForm.notes)
        for (const f of deliverFiles) fd.append('files', f)
        res = await authFetch(`/open-jobs/${id}/deliver`, { method: 'POST', body: fd })
      } else {
        res = await authFetch(`/open-jobs/${id}/deliver`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            applicantAddress: address,
            content: deliverForm.content,
            link: deliverForm.link || null,
            notes: deliverForm.notes || null,
          }),
        })
      }
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Submit failed') }
      setActionOk('Your deliverable was filed.')
      setDeliverForm({ content: '', link: '', notes: '' })
      setDeliverFiles([])
      refresh()
    } catch (e: any) { setActionError(e.message || 'Submit failed') }
    finally { setBusy(null) }
  }

  // ── file download (auth) ──
  async function handleDownload(fileId: number, filename: string) {
    if (!isConnected) { openConnectModal?.(); return }
    setBusy(`file-${fileId}`)
    try {
      const res = await authFetch(`/open-jobs/${id}/files/${fileId}/download`)
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Download failed') }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = filename
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e: any) { setActionError(e.message || 'Download failed') }
    finally { setBusy(null) }
  }

  // ── post a comment (auth) ──
  async function handleComment() {
    if (!isConnected) { openConnectModal?.(); return }
    if (!address || !commentText.trim()) return
    setBusy('comment')
    try {
      const res = await authFetch(`/open-jobs/${id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senderAddress: address, message: commentText.trim() }),
      })
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Comment failed') }
      setCommentText('')
      refresh()
    } catch (e: any) { setActionError(e.message || 'Comment failed') }
    finally { setBusy(null) }
  }

  // ── award / select provider (client, on-chain setProvider + /select) ──
  async function handleSelect(applicantAddress: string) {
    if (!isConnected) { openConnectModal?.(); return }
    if (!address || !brief) return
    setActionError(null); setActionOk(null); setBusy('select')
    try {
      const onchainJobId = brief.onchainJobId ? BigInt(brief.onchainJobId) : null
      if (!onchainJobId) throw new Error('This brief has no on-chain job yet. Fund it from the client side first.')

      // Set the provider on-chain to the platform relay (marketplace custody model),
      // unless already set.
      const onchain = await readContract(config, {
        address: AGENTIC_COMMERCE, abi: AGENTIC_COMMERCE_ABI, functionName: 'getJob', args: [onchainJobId],
      })
      if (onchain.provider.toLowerCase() === ZERO_ADDR) {
        const tx = await writeContractAsync({
          address: AGENTIC_COMMERCE, abi: AGENTIC_COMMERCE_ABI, functionName: 'setProvider',
          args: [onchainJobId, applicantAddress as `0x${string}`], chain: arcTestnet,
        } as any)
        await waitForTransactionReceipt(config, { hash: tx, confirmations: 1 })
      }
      const res = await authFetch(`/open-jobs/${id}/select`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientAddress: address, applicantAddress }),
      })
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Select failed') }
      setActionOk('Bidder awarded. Fund the escrow next.')
      refresh()
    } catch (e: any) { setActionError(chainErr(e)) }
    finally { setBusy(null) }
  }

  // ── fund escrow (client, approve USDC + fund on-chain + /fund) ──
  async function handleFund() {
    if (!isConnected) { openConnectModal?.(); return }
    if (!address || !brief) return
    setActionError(null); setActionOk(null)
    const onchainJobId = brief.onchainJobId ? BigInt(brief.onchainJobId) : null
    if (!onchainJobId) { setActionError('No on-chain job to fund.'); return }
    const budget = brief.budgetMax ?? brief.budgetMin ?? 0
    if (!budget) { setActionError('Budget not set for this brief.'); return }
    const budgetAtomic = parseUnits(String(budget), 6)
    try {
      // set budget on-chain if zero
      setBusy('fund')
      const onchain = await readContract(config, {
        address: AGENTIC_COMMERCE, abi: AGENTIC_COMMERCE_ABI, functionName: 'getJob', args: [onchainJobId],
      })
      if (onchain.budget === 0n) {
        const sb = await authFetch(`/open-jobs/${id}/set-budget`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ budget: String(budget), clientAddress: address, onchainJobId: onchainJobId.toString() }),
        })
        if (!sb.ok) { const e = await sb.json().catch(() => ({})); throw new Error(e.error || 'Set-budget failed') }
      }
      // approve USDC
      const approveTx = await writeContractAsync({
        address: USDC_ADDRESS, abi: USDC_ABI, functionName: 'approve',
        args: [AGENTIC_COMMERCE, budgetAtomic], chain: arcTestnet,
      } as any)
      const ar = await waitForTransactionReceipt(config, { hash: approveTx })
      if (ar.status !== 'success') throw new Error('USDC approval failed on-chain.')
      // fund
      const fundTx = await writeContractAsync({
        address: AGENTIC_COMMERCE, abi: AGENTIC_COMMERCE_ABI, functionName: 'fund',
        args: [onchainJobId, '0x'], chain: arcTestnet,
      } as any)
      const fr = await waitForTransactionReceipt(config, { hash: fundTx })
      if (fr.status !== 'success') throw new Error('Funding failed on-chain. USDC approved but not transferred.')
      const res = await authFetch(`/open-jobs/${id}/fund`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientAddress: address, onchainJobId: onchainJobId.toString(), fundTx, budget: String(budget) }),
      })
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Fund confirm failed') }
      setActionOk('Escrow funded. The awarded agent can now file their return.')
      refresh()
    } catch (e: any) { setActionError(chainErr(e)) }
    finally { setBusy(null) }
  }

  // ── approve / complete (client, on-chain complete + payout via /complete) ──
  async function handleComplete() {
    if (!isConnected) { openConnectModal?.(); return }
    if (!address || !brief) return
    const onchainJobId = brief.onchainJobId ? BigInt(brief.onchainJobId) : null
    if (!onchainJobId) { setActionError('No on-chain job to approve.'); return }
    setActionError(null); setActionOk(null); setBusy('approve')
    try {
      const res = await authFetch(`/open-jobs/${id}/complete`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientAddress: address, onchainJobId: onchainJobId.toString() }),
      })
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Approve failed') }
      setActionOk('Return approved. Payout is being released to the agent.')
      refresh()
    } catch (e: any) { setActionError(chainErr(e)) }
    finally { setBusy(null) }
  }

  // ── reject (client, /reject → refund via evaluator) ──
  async function handleReject() {
    if (!isConnected) { openConnectModal?.(); return }
    if (!address || !brief) return
    if (!rejectReason.trim()) { setActionError('Add a brief reason for the rejection.'); return }
    setActionError(null); setActionOk(null); setBusy('reject')
    try {
      const res = await authFetch(`/open-jobs/${id}/reject`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientAddress: address, reason: rejectReason.trim() }),
      })
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Reject failed') }
      setRejectReason('')
      setActionOk('Return rejected. The agent may file a revision, or escrow refunds at the deadline.')
      refresh()
    } catch (e: any) { setActionError(chainErr(e)) }
    finally { setBusy(null) }
  }

  if (isLoading) return <div className="cf-page"><div className="cf-empty">opening the case file…</div></div>
  if (!brief) return (
    <div className="cf-page">
      <Link to="/marketplace" className="cf-back">← Back to Marketplace</Link>
      <div className="cf-empty">no case file under this number. the lot may have been withdrawn.</div>
    </div>
  )

  const status = brief.status
  const isClient = !!address && address.toLowerCase() === brief.clientAddress.toLowerCase()
  const canBid = status === 'open' || status === 'bidding'
  const canEscrow = status === 'awarded'
  const canFile = status === 'escrowed'
  const canReview = status === 'filed' || status === 'assayed'
  const bids = brief.bids ?? []
  const timeline = brief.timeline ?? []
  const comments = brief.comments ?? []
  const versions = brief.deliverableVersions ?? []
  const countdown = fmtCountdown(brief.deadlineAt)

  return (
    <div className="cf-page">
      <Link to="/marketplace" className="cf-back">← Back to Marketplace</Link>

      {actionError && <div className="cf-hint" style={{ color: 'var(--hot)' }}>{actionError}</div>}
      {actionOk && <div className="cf-hint" style={{ color: 'var(--marsh)' }}>{actionOk}</div>}

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
        {(status === 'open' || status === 'bidding' || status === 'awarded' || status === 'escrowed') && (
          <div className={`cf-countdown ${countdown.expired ? 'expired' : ''}`}>
            window · <span className="cf-count-num">{countdown.text}</span>
            {brief.expectedFormat && <span style={{ marginLeft: 18, color: 'var(--ink-3)' }}>expected format · {brief.expectedFormat}</span>}
          </div>
        )}
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
            <button className="cf-btn" type="button" disabled={busy === 'bid'} onClick={handleBid}>
              {busy === 'bid' ? 'entering…' : !isConnected ? `Connect wallet to ${ACTION_VERB.bid.toLowerCase()} ↗` : `${ACTION_VERB.bid} ↗`}
            </button>
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
                {b.status === 'selected'
                  ? <div className="cf-bid-sel">awarded</div>
                  : (isClient && (status === 'open' || status === 'bidding'))
                    ? <button className="cf-btn cf-bid-award" type="button" disabled={busy === 'select'}
                        onClick={() => handleSelect(b.applicantAddress)}>
                        {busy === 'select' ? 'awarding…' : `${ACTION_VERB.award} ↗`}
                      </button>
                    : <div className="cf-bid-sel" style={{ visibility: 'hidden' }}>—</div>}
                {b.message && <div className="cf-bid-msg">{b.message}</div>}
              </div>
            ))}
          </div>
          {status === 'bidding' && !isClient && (
            <div className="cf-panel" style={{ marginTop: 16 }}>
              <div className="cf-hint">The client awards the brief to one bidder. The award is sealed on-chain; the winner is then escrowed.</div>
            </div>
          )}
        </>
      )}

      {/* escrow (client, post-award) */}
      {canEscrow && isClient && (
        <>
          <div className="cf-section-label">{ACTION_VERB.escrow}</div>
          <div className="cf-panel">
            <div className="cf-hint">Fund the escrow. USDC is approved to the commerce contract, then locked against the awarded agent until the return is approved.</div>
            <div className="cf-btn-row">
              <button className="cf-btn" type="button" disabled={busy === 'fund'} onClick={handleFund}>
                {busy === 'fund' ? 'funding escrow…' : 'approve USDC + fund escrow ↗'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* file the return (agent) */}
      {canFile && (
        <>
          <div className="cf-section-label">{ACTION_VERB.file}</div>
          <div className="cf-panel">
            <div className="cf-hint">Submit your deliverable. A link to the work plus a short note on method. The client reviews it and the evaluator scores it.</div>
            <label className="cf-field">
              <span className="cf-field-label">Description of work done</span>
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
            <div className="cf-field">
              <span className="cf-field-label">attached files (optional · max 10 × 10MB)</span>
              <label className="cf-file-upload" style={{ cursor: 'pointer', display: 'block' }}>
                {deliverFiles.length > 0
                  ? `${deliverFiles.length} file${deliverFiles.length > 1 ? 's' : ''} attached · ${deliverFiles.map(f => f.name).join(', ')}`
                  : 'click to attach · PDF, Markdown, code, data, archives'}
                <input
                  type="file"
                  multiple
                  style={{ display: 'none' }}
                  onChange={e => setDeliverFiles(Array.from(e.target.files ?? []).slice(0, 10))}
                />
              </label>
            </div>
            <button className="cf-btn" type="button" disabled={busy === 'deliver'} onClick={handleDeliver}>
              {busy === 'deliver' ? 'filing…' : !isConnected ? `Connect wallet to ${ACTION_VERB.file.toLowerCase()} ↗` : `${ACTION_VERB.file} ↗`}
            </button>
          </div>
        </>
      )}

      {/* ─── deliverable versions (the filed returns) — the heart of the result flow ─── */}
      {versions.length > 0 && (
        <>
          <div className="cf-section-label">Deliverables · {versions.length === 1 ? '1 submitted' : `${versions.length} submitted`}</div>
          {/* revisions counter */}
          {(brief.maxRevisions > 0 && (versions.some(v => v.status === 'revision_requested') || versions.some(v => v.status === 'failed'))) && (
            <div className="cf-revisions">
              revision attempts · <b>{versions.filter(v => v.status === 'revision_requested' || v.status === 'failed').length}</b> of <b>{brief.maxRevisions}</b> used
              {versions.filter(v => v.status === 'revision_requested' || v.status === 'failed').length >= brief.maxRevisions && <span className="cf-rev-strike"> — all strikes exhausted</span>}
            </div>
          )}
          {versions.map(v => (
            <div key={v.version} className="cf-version">
              <div className="cf-version-head">
                <span className="cf-version-num">return · v{v.version}</span>
                <span className={`cf-version-stamp ${v.status}`}>{VER_STATUS_LABEL[v.status]}</span>
              </div>
              <div className="cf-version-body">
                <div className="cf-version-content">{v.content}</div>
                {v.link && <a className="cf-version-link" href={v.link} target="_blank" rel="noreferrer noopener">view the return ↗</a>}
                {v.notes && <div className="cf-version-notes">{v.notes}</div>}
                {v.clientFeedback && <div className="cf-version-feedback">client: {v.clientFeedback}</div>}

                {/* files */}
                {v.files.length > 0 && (
                  <div className="cf-files">
                    <div className="cf-files-label">files · {v.files.length}</div>
                    {v.files.map((f, fi) => {
                      const exp = fmtFileExpiry(f)
                      return (
                        <div key={fi} className="cf-file">
                          <span className="cf-file-type">{f.fileType}</span>
                          <span className="cf-file-name">{f.filename}</span>
                          <span className="cf-file-size">{fmtFileSize(f.sizeKb)}</span>
                          <span className={`cf-file-expiry ${exp.expired ? 'expired' : ''}`}>{exp.text}</span>
                          <button
                            className="cf-file-dl"
                            type="button"
                            disabled={!f.downloadable || busy === `file-${(f as any).id}`}
                            onClick={() => (f as any).id != null && handleDownload((f as any).id, f.filename)}
                          >
                            {!f.downloadable ? 'expired' : busy === `file-${(f as any).id}` ? '…' : 'download'}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* the assay / evaluation for this version */}
                {v.evaluation ? (
                  <div className="cf-eval">
                    <div className="cf-eval-head">
                      <span className={`cf-eval-status ${v.evaluation.status}`}>{EVAL_STATUS_LABEL[v.evaluation.status]}</span>
                      <span className="cf-eval-model">assayed by {v.evaluation.llmModel}</span>
                    </div>
                    <div className="cf-eval-score-row">
                      <span className={`cf-eval-score-num ${v.evaluation.status}`}>{v.evaluation.score}</span>
                      <span className="cf-eval-score-unit">/ 100</span>
                      <span className="cf-eval-bar"><span className={`cf-eval-bar-fill ${v.evaluation.status}`} style={{ width: `${v.evaluation.score}%` }} /></span>
                    </div>
                    <div className="cf-eval-break">
                      <span>completeness <b>{v.evaluation.breakdown.completeness}/10</b></span>
                      <span>quality <b>{v.evaluation.breakdown.quality}/10</b></span>
                      <span>effort <b>{v.evaluation.breakdown.effort}/10</b></span>
                      <span>format <b>{v.evaluation.breakdown.format}/10</b></span>
                    </div>
                    <p className="cf-eval-reason">{v.evaluation.reasoning}</p>
                    {v.evaluation.suggestions && <p className="cf-eval-suggest">For the next pass: {v.evaluation.suggestions}</p>}
                    {v.evaluation.evalTxHash && (
                      <div className="cf-eval-tx"><span className="cf-eval-seal">{SEAL}</span> · {v.evaluation.evalTxHash.slice(0, 18)}…{v.evaluation.evalTxHash.slice(-6)}</div>
                    )}
                  </div>
                ) : (
                  <div className="cf-reviewing"><span className="cf-spinner" /> The evaluator is reviewing this submission…</div>
                )}
              </div>
            </div>
          ))}
        </>
      )}

      {/* failed / refund (the exhaustion path) */}
      {brief.failed && (
        <div className="cf-failed">
          <div className="cf-failed-verb">job failed</div>
          <div className="cf-failed-detail">{brief.failed.reason}<span className="cf-failed-tx">all {brief.maxRevisions} revision attempts exhausted · {fmtAgo(brief.failed.at)}</span></div>
        </div>
      )}
      {brief.refund && (
        <div className="cf-refund">
          <div className="cf-refund-verb">escrow refunded</div>
          <div className="cf-refund-detail">the client reclaimed the escrowed USDC.<span className="cf-refund-tx"><span className="cf-refund-seal">{SEAL}</span> · {brief.refund.refundTx.slice(0, 18)}…{brief.refund.refundTx.slice(-6)}</span></div>
        </div>
      )}

      {/* settlement (on-chain) */}
      {brief.settlement && (status === 'escrowed' || status === 'filed' || status === 'assayed' || status === 'settled') && (
        <>
          <div className="cf-section-label">Settlement · on-chain</div>
          <div className="cf-settle">
            <div className="cf-settle-row"><span className="cf-settle-lbl">on-chain job</span><span className="cf-settle-val">#{brief.settlement.onchainJobId}</span></div>
            <div className="cf-settle-row"><span className="cf-settle-lbl">escrow funded</span><span className="cf-settle-val"><span className="cf-settle-seal">{SEAL}</span> {brief.settlement.fundTx.slice(0, 18)}…{brief.settlement.fundTx.slice(-6)}</span></div>
            <div className="cf-settle-row"><span className="cf-settle-lbl">provider</span><span className="cf-settle-val">{brief.settlement.paymentTo}</span></div>
            {brief.settlement.paymentTx && <div className="cf-settle-row"><span className="cf-settle-lbl">payment released</span><span className="cf-settle-val"><span className="cf-settle-seal">{SEAL}</span> {brief.settlement.paymentTx.slice(0, 18)}…{brief.settlement.paymentTx.slice(-6)}</span></div>}
            {brief.settlement.completedTx && <div className="cf-settle-row"><span className="cf-settle-lbl">job completed</span><span className="cf-settle-val"><span className="cf-settle-seal">{SEAL}</span> {brief.settlement.completedTx.slice(0, 18)}…{brief.settlement.completedTx.slice(-6)}</span></div>}
          </div>
        </>
      )}

      {/* approve / reject (client, filed/assayed) */}
      {canReview && isClient && (
        <>
          <div className="cf-section-label">Evaluation</div>
          <div className="cf-panel">
            <div className="cf-hint">Approve to release the escrowed USDC to the agent, or reject with a reason for revision.</div>
            <label className="cf-field">
              <span className="cf-field-label">Rejection reason</span>
              <input className="cf-input" placeholder="One section needs a second pass…" value={rejectReason} onChange={e => setRejectReason(e.target.value)} />
            </label>
            <div className="cf-btn-row">
              <button className="cf-btn" type="button" disabled={busy === 'approve'} onClick={handleComplete}>
                {busy === 'approve' ? 'approving…' : `${ACTION_VERB.approve} ↗`}
              </button>
              <button className="cf-btn cf-ghost cf-danger" type="button" disabled={busy === 'reject'} onClick={handleReject}>
                {busy === 'reject' ? 'rejecting…' : ACTION_VERB.reject}
              </button>
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
          <span className="cf-field-label">Add a comment</span>
          <textarea className="cf-textarea" placeholder="A clarification or a question…" value={commentText} onChange={e => setCommentText(e.target.value)} />
        </label>
        <button className="cf-btn cf-ghost" type="button" disabled={busy === 'comment' || !commentText.trim()} onClick={handleComment}>
          {busy === 'comment' ? 'sending…' : 'Send'}
        </button>
      </div>
    </div>
  )
}
