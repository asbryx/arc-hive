import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAccount, useWriteContract } from 'wagmi'
import { useJob } from '@/api/hooks'
import { AGENTIC_COMMERCE, AGENTIC_COMMERCE_ABI } from '@/lib/contracts'
import { arcTestnet } from '@/lib/wagmi'
import StatusPill from '@/components/graphics/StatusPill'
import Skeleton from '@/components/graphics/Skeleton'
import { truncateAddress, timeAgo, formatUsdc } from '@/utils/format'
import { explorerAddress, explorerTx } from '@/utils/explorer'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

export default function JobDetail() {
  const { id } = useParams<{ id: string }>()
  const { address } = useAccount()
  const { data: job, isLoading, refetch } = useJob(id!)
  const { writeContractAsync } = useWriteContract()

  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)

  // Deliverable submission form (for provider)
  const [showDeliverForm, setShowDeliverForm] = useState(false)
  const [deliverForm, setDeliverForm] = useState({ content: '', link: '', notes: '' })

  if (isLoading || !job) {
    return (
      <div className="page-enter" style={{ padding: '40px 24px', maxWidth: 900, margin: '0 auto' }}>
        <Skeleton width={200} height={24} style={{ marginBottom: 16 }} />
        <Skeleton width={300} height={14} style={{ marginBottom: 32 }} />
        <Skeleton width="100%" height={120} />
      </div>
    )
  }

  const isClient = address?.toLowerCase() === job.client?.toLowerCase()
  const isProvider = address?.toLowerCase() === job.provider?.toLowerCase()
  const isEvaluator = address?.toLowerCase() === job.evaluator?.toLowerCase()

  async function handleComplete() {
    if (!id) return
    setActionLoading('complete')
    setActionError(null)
    try {
      const reason = ('0x' + Array.from(new TextEncoder().encode('approved-via-archivehub')).map(b => b.toString(16).padStart(2, '0')).join('').padEnd(64, '0')) as `0x${string}`
      await writeContractAsync({
        address: AGENTIC_COMMERCE,
        abi: AGENTIC_COMMERCE_ABI,
        functionName: 'complete',
        args: [BigInt(id), reason, '0x'],
        chain: arcTestnet,
      })
      setActionSuccess('Job completed — payment released to provider.')
      refetch()
    } catch (err: any) {
      setActionError(err.shortMessage || err.message || 'Transaction failed')
    }
    setActionLoading(null)
  }

  async function handleReject() {
    if (!id) return
    setActionLoading('reject')
    setActionError(null)
    try {
      const reason = ('0x' + Array.from(new TextEncoder().encode('rejected-via-archivehub')).map(b => b.toString(16).padStart(2, '0')).join('').padEnd(64, '0')) as `0x${string}`
      await writeContractAsync({
        address: AGENTIC_COMMERCE,
        abi: AGENTIC_COMMERCE_ABI,
        functionName: 'reject',
        args: [BigInt(id), reason, '0x'],
        chain: arcTestnet,
      })
      setActionSuccess('Job rejected. You can claim refund after expiry.')
      refetch()
    } catch (err: any) {
      setActionError(err.shortMessage || err.message || 'Transaction failed')
    }
    setActionLoading(null)
  }

  async function handleSubmitDeliverable() {
    if (!id || !address) return
    setActionLoading('deliver')
    setActionError(null)
    try {
      // Save to API
      const res = await fetch(`${API_BASE}/jobs/${id}/deliverable`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerAddress: address,
          content: deliverForm.content,
          link: deliverForm.link || null,
          notes: deliverForm.notes || null,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to save')
      }

      // Submit on-chain
      const hash = ('0x' + Array.from(new TextEncoder().encode(deliverForm.content.slice(0, 31))).map(b => b.toString(16).padStart(2, '0')).join('').padEnd(64, '0')) as `0x${string}`
      await writeContractAsync({
        address: AGENTIC_COMMERCE,
        abi: AGENTIC_COMMERCE_ABI,
        functionName: 'submit',
        args: [BigInt(id), hash, '0x'],
        chain: arcTestnet,
      })

      setActionSuccess('Deliverable submitted. Waiting for client review.')
      setShowDeliverForm(false)
      refetch()
    } catch (err: any) {
      setActionError(err.shortMessage || err.message || 'Failed to submit')
    }
    setActionLoading(null)
  }

  return (
    <div className="page-enter" style={{ padding: '40px 24px', maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <StatusPill status={job.status} />
        <h1 style={{ fontSize: 20, fontWeight: 800 }}>Job #{job.jobId}</h1>
      </div>

      {/* Description */}
      {job.description && (
        <div style={{
          padding: '16px 20px',
          background: 'var(--dimmer)',
          borderLeft: '3px solid var(--accent)',
          marginBottom: 32,
          fontSize: 13,
          lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}>
          {job.description}
        </div>
      )}

      {/* Info grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 1, background: 'var(--dimmer)', marginBottom: 32 }}>
        <div style={{ padding: 16, background: 'var(--bg)' }}>
          <div style={{ fontSize: 10, color: 'var(--dim)', textTransform: 'uppercase', marginBottom: 4 }}>Budget</div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{job.budget ? `${formatUsdc(job.budget)} USDC` : '—'}</div>
        </div>
        <div style={{ padding: 16, background: 'var(--bg)' }}>
          <div style={{ fontSize: 10, color: 'var(--dim)', textTransform: 'uppercase', marginBottom: 4 }}>Status</div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{job.status}</div>
        </div>
        <div style={{ padding: 16, background: 'var(--bg)' }}>
          <div style={{ fontSize: 10, color: 'var(--dim)', textTransform: 'uppercase', marginBottom: 4 }}>Created</div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{timeAgo(job.createdAt)}</div>
        </div>
        {job.completedAt && (
          <div style={{ padding: 16, background: 'var(--bg)' }}>
            <div style={{ fontSize: 10, color: 'var(--dim)', textTransform: 'uppercase', marginBottom: 4 }}>Completed</div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{timeAgo(job.completedAt)}</div>
          </div>
        )}
      </div>

      {/* ═══ DELIVERABLE SECTION ═══ */}
      {(job.status === 'Submitted' || job.status === 'Completed' || job.status === 'Rejected') && (
        <section style={{ marginBottom: 32, padding: '20px', border: '1px solid var(--dimmer)', background: job.status === 'Submitted' ? 'rgba(39,63,79,0.05)' : 'transparent' }}>
          <div style={{ fontSize: 11, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 16 }}>
            // deliverable
          </div>

          {(job as any).deliverable ? (
            <div>
              <div style={{ fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap', marginBottom: 12 }}>
                {(job as any).deliverable.content}
              </div>
              {(job as any).deliverable.link && (
                <div style={{ marginBottom: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--dim)' }}>Link: </span>
                  <a href={(job as any).deliverable.link} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'underline' }}>
                    {(job as any).deliverable.link}
                  </a>
                </div>
              )}
              {(job as any).deliverable.notes && (
                <div style={{ fontSize: 12, color: 'var(--dim)', marginTop: 8, fontStyle: 'italic' }}>
                  Note: {(job as any).deliverable.notes}
                </div>
              )}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--dim)' }}>
              {job.deliverableHash ? (
                <>On-chain hash: <code style={{ fontSize: 11 }}>{job.deliverableHash.slice(0, 20)}...</code> (no off-chain content submitted)</>
              ) : (
                'No deliverable content available'
              )}
            </div>
          )}
        </section>
      )}

      {/* ═══ AI EVALUATION ═══ */}
      {(job as any).evaluation && (() => {
        const ev = (job as any).evaluation
        const decisionColor = ev.decision === 'approve' ? '#1a7a3a' : ev.decision === 'reject' ? '#ff4444' : '#cc8800'
        const decisionLabel = ev.decision === 'approve' ? '✓ APPROVED' : ev.decision === 'reject' ? '✗ REJECTED' : '↻ REVISION REQUESTED'
        return (
          <section style={{ marginBottom: 32, padding: '20px', border: `1px solid ${decisionColor}`, background: 'rgba(39,63,79,0.03)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: 2 }}>
                // ai evaluation
              </div>
              <span style={{ fontSize: 11, color: decisionColor, fontWeight: 700, letterSpacing: 1 }}>
                {decisionLabel}
              </span>
            </div>

            {/* Score bar */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: 'var(--dim)' }}>Quality Score</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: ev.score >= 70 ? '#1a7a3a' : ev.score >= 50 ? '#cc8800' : '#ff4444' }}>{ev.score}/100</span>
              </div>
              <div style={{ height: 4, background: 'var(--dimmer)', width: '100%' }}>
                <div style={{ height: 4, width: `${ev.score}%`, background: ev.score >= 70 ? '#1a7a3a' : ev.score >= 50 ? '#cc8800' : '#ff4444', transition: 'width 0.3s' }} />
              </div>
            </div>

            {/* Reasoning */}
            <div style={{ fontSize: 12, lineHeight: 1.7, color: 'var(--text)', whiteSpace: 'pre-wrap', marginBottom: 12 }}>
              {ev.reasoning}
            </div>

            {/* Meta */}
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 10, color: 'var(--dim)' }}>
              {ev.model && <span>model: {ev.model}</span>}
              {ev.evaluatedAt && <span>evaluated: {new Date(ev.evaluatedAt).toLocaleString()}</span>}
              {ev.completionTx && (
                <a href={`https://testnet.arcscan.app/tx/${ev.completionTx}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--dim)', textDecoration: 'underline' }}>
                  completion tx ↗
                </a>
              )}
            </div>
          </section>
        )
      })()}

      {/* ═══ ACTION BUTTONS ═══ */}
      {/* Provider: Submit deliverable (when job is Funded) */}
      {isProvider && job.status === 'Funded' && (
        <section style={{ marginBottom: 32, padding: '20px', border: '1px solid var(--accent)' }}>
          <div style={{ fontSize: 11, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 16 }}>
            // submit your work
          </div>

          {!showDeliverForm ? (
            <button
              onClick={() => setShowDeliverForm(true)}
              style={{
                width: '100%', padding: '14px 0', fontSize: 13, fontWeight: 700,
                background: 'var(--accent)', color: '#ffffff', border: 'none', cursor: 'pointer',
              }}
            >
              Submit Deliverable
            </button>
          ) : (
            <div>
              <label style={{ display: 'block', marginBottom: 12 }}>
                <span style={{ fontSize: 11, color: 'var(--dim)' }}>Deliverable Description *</span>
                <textarea
                  value={deliverForm.content}
                  onChange={(e) => setDeliverForm({ ...deliverForm, content: e.target.value })}
                  placeholder="Describe what you delivered. Include results, methodology, and any relevant details..."
                  style={{
                    display: 'block', width: '100%', marginTop: 4, padding: 10,
                    background: 'var(--bg)', border: '1px solid var(--dimmer)', color: 'var(--text)',
                    fontFamily: 'var(--font)', fontSize: 13, minHeight: 120, resize: 'vertical',
                  }}
                />
              </label>
              <label style={{ display: 'block', marginBottom: 12 }}>
                <span style={{ fontSize: 11, color: 'var(--dim)' }}>Link (GitHub, IPFS, Google Drive, etc.)</span>
                <input
                  type="text"
                  value={deliverForm.link}
                  onChange={(e) => setDeliverForm({ ...deliverForm, link: e.target.value })}
                  placeholder="https://github.com/..."
                  style={{
                    display: 'block', width: '100%', marginTop: 4, padding: 10,
                    background: 'var(--bg)', border: '1px solid var(--dimmer)', color: 'var(--text)',
                    fontFamily: 'var(--font)', fontSize: 13,
                  }}
                />
              </label>
              <label style={{ display: 'block', marginBottom: 16 }}>
                <span style={{ fontSize: 11, color: 'var(--dim)' }}>Notes for client</span>
                <input
                  type="text"
                  value={deliverForm.notes}
                  onChange={(e) => setDeliverForm({ ...deliverForm, notes: e.target.value })}
                  placeholder="Any additional context..."
                  style={{
                    display: 'block', width: '100%', marginTop: 4, padding: 10,
                    background: 'var(--bg)', border: '1px solid var(--dimmer)', color: 'var(--text)',
                    fontFamily: 'var(--font)', fontSize: 13,
                  }}
                />
              </label>
              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  onClick={() => setShowDeliverForm(false)}
                  style={{ flex: 1, padding: '10px 0', fontSize: 12, background: 'transparent', color: 'var(--dim)', border: '1px solid var(--dimmer)', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmitDeliverable}
                  disabled={!deliverForm.content || actionLoading === 'deliver'}
                  style={{
                    flex: 2, padding: '10px 0', fontSize: 12, fontWeight: 700,
                    background: 'var(--accent)', color: '#ffffff', border: 'none', cursor: 'pointer',
                    opacity: !deliverForm.content ? 0.4 : 1,
                  }}
                >
                  {actionLoading === 'deliver' ? 'Submitting...' : 'Submit On-Chain'}
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Evaluator/Client: Approve or Reject (when job is Submitted) */}
      {(isEvaluator || isClient) && job.status === 'Submitted' && (
        <section style={{ marginBottom: 32, padding: '20px', border: '1px solid var(--accent)' }}>
          <div style={{ fontSize: 11, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 16 }}>
            // review deliverable
          </div>
          <div style={{ fontSize: 12, color: 'var(--dim)', marginBottom: 16 }}>
            Review the deliverable above. Approve to release payment ({job.budget} USDC) to provider, or reject.
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <button
              onClick={handleReject}
              disabled={actionLoading !== null}
              style={{
                flex: 1, padding: '12px 0', fontSize: 13,
                background: 'transparent', color: '#ff4444', border: '1px solid #ff4444', cursor: 'pointer',
                opacity: actionLoading ? 0.5 : 1,
              }}
            >
              {actionLoading === 'reject' ? 'Rejecting...' : '✗ Reject'}
            </button>
            <button
              onClick={handleComplete}
              disabled={actionLoading !== null}
              style={{
                flex: 2, padding: '12px 0', fontSize: 13, fontWeight: 700,
                background: '#1a7a3a', color: 'var(--text)', border: 'none', cursor: 'pointer',
                opacity: actionLoading ? 0.5 : 1,
              }}
            >
              {actionLoading === 'complete' ? 'Approving...' : '✓ Approve & Pay'}
            </button>
          </div>
        </section>
      )}

      {/* Action feedback */}
      {actionError && (
        <div style={{ padding: 12, border: '1px solid #ff4444', color: '#ff4444', fontSize: 12, marginBottom: 24 }}>
          {actionError}
        </div>
      )}
      {actionSuccess && (
        <div style={{ padding: 12, border: '1px solid #1a7a3a', color: '#1a7a3a', fontSize: 12, marginBottom: 24 }}>
          {actionSuccess}
        </div>
      )}

      {/* Parties */}
      <section style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 11, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 16 }}>
          // parties
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--dimmer)' }}>
            <span style={{ fontSize: 11, color: 'var(--dim)' }}>Client</span>
            <a href={explorerAddress(job.client)} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text)', textDecoration: 'underline', fontSize: 13 }}>
              {truncateAddress(job.client, 6)}
            </a>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--dimmer)' }}>
            <span style={{ fontSize: 11, color: 'var(--dim)' }}>Provider</span>
            {job.provider ? (
              <a href={explorerAddress(job.provider)} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text)', textDecoration: 'underline', fontSize: 13 }}>
                {truncateAddress(job.provider, 6)}
              </a>
            ) : (
              <span style={{ color: 'var(--dim)', fontSize: 13 }}>Unassigned</span>
            )}
          </div>
          {job.providerAgentId && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--dimmer)' }}>
              <span style={{ fontSize: 11, color: 'var(--dim)' }}>Agent</span>
              <Link to={`/agents/${job.providerAgentId}`} style={{ color: 'var(--text)', textDecoration: 'underline', fontSize: 13 }}>
                agent-{job.providerAgentId}
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* On-chain */}
      <section style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 11, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 16 }}>
          // on-chain
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(() => {
            const statusTxMap: Record<string, string> = {
              Completed: 'JobCompleted',
              Submitted: 'JobSubmitted',
              Rejected: 'JobRejected',
              Funded: 'JobFunded',
            }
            const targetEvent = statusTxMap[job.status]
            const relevantTx = job.timeline?.find((e: any) => e.event === targetEvent)?.txHash
            if (relevantTx && relevantTx !== job.createdTx) {
              return (
                <a href={explorerTx(relevantTx)} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: 'var(--text)', textDecoration: 'underline' }}>
                  → view {job.status.toLowerCase()} tx on arcscan
                </a>
              )
            }
            return null
          })()}
          {job.createdTx && (
            <a href={explorerTx(job.createdTx)} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: 'var(--dim)', textDecoration: 'underline' }}>
              → view creation tx on arcscan
            </a>
          )}
          <a href={explorerAddress('0x0747EEf0706327138c69792bF28Cd525089e4583')} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: 'var(--dim)', textDecoration: 'underline' }}>
            → view contract on arcscan
          </a>
          {job.deliverableHash && (
            <span style={{ fontSize: 12, color: 'var(--dim)' }}>
              deliverable hash: <code style={{ fontSize: 11 }}>{job.deliverableHash.slice(0, 20)}...</code>
            </span>
          )}
        </div>
      </section>

      {/* Timeline */}
      {job.timeline && job.timeline.length > 0 && (
        <section style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 11, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 16 }}>
            // timeline
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {job.timeline.map((event: any, i: number) => (
              <div key={i} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--dimmer)', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--accent)', minWidth: 100 }}>{event.event}</span>
                <span style={{ fontSize: 11, color: 'var(--dim)', flex: 1 }}>{timeAgo(event.timestamp)}</span>
                {event.txHash && (
                  <a href={explorerTx(event.txHash)} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: 'var(--dim)', textDecoration: 'underline' }}>
                    tx ↗
                  </a>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
