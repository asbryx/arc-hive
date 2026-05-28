import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAccount, useWriteContract } from 'wagmi'
import { useJobs } from '@/api/hooks'
import StatusPill from '@/components/graphics/StatusPill'
import { formatUsdc, truncateAddress } from '@/utils/format'
import { formatDescription } from '@/utils/description'
import { AGENTIC_COMMERCE, AGENTIC_COMMERCE_ABI } from '@/lib/contracts'
import { arcTestnet } from '@/lib/wagmi'

function strToBytes32Hex(s: string): string {
  const bytes = new TextEncoder().encode(s.slice(0, 32))
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
  return hex.padEnd(64, '0')
}

type Tab = 'client' | 'provider'

export default function Dashboard() {
  const { address, isConnected } = useAccount()
  const [tab, setTab] = useState<Tab>('client')
  const [actionJobId, setActionJobId] = useState<number | null>(null)
  const [actionType, setActionType] = useState<'complete' | 'reject' | 'submit' | 'refund' | null>(null)
  const [deliverableHash, setDeliverableHash] = useState('')
  const [reasonText, setReasonText] = useState('')
  const [txPending, setTxPending] = useState(false)
  const [txError, setTxError] = useState<string | null>(null)
  const [txSuccess, setTxSuccess] = useState<string | null>(null)

  const { writeContractAsync } = useWriteContract()

  // Fetch jobs where user is client
  const { data: clientJobs, refetch: refetchClient } = useJobs(
    address ? { client: address.toLowerCase(), limit: '50' } : undefined
  )

  // Fetch jobs where user is provider
  const { data: providerJobs, refetch: refetchProvider } = useJobs(
    address ? { provider: address.toLowerCase(), limit: '50' } : undefined
  )

  if (!isConnected) {
    return (
      <div className="page-enter" style={{ padding: '80px 24px', maxWidth: 700, margin: '0 auto', textAlign: 'center', minHeight: 'calc(100vh - 160px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 11, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 16 }}>
          // my jobs
        </div>
        <div style={{ fontSize: 13, color: 'var(--dim)' }}>Connect wallet to view your jobs</div>
      </div>
    )
  }

  async function handleAction() {
    if (!actionJobId || !actionType) return
    setTxPending(true)
    setTxError(null)
    setTxSuccess(null)

    try {
      if (actionType === 'complete') {
        const reason = reasonText
          ? `0x${strToBytes32Hex(reasonText)}` as `0x${string}`
          : '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`
        await writeContractAsync({
          address: AGENTIC_COMMERCE,
          abi: AGENTIC_COMMERCE_ABI,
          functionName: 'complete',
          args: [BigInt(actionJobId), reason, '0x'],
          chain: arcTestnet,
        })
        setTxSuccess(`Job #${actionJobId} completed. Payment released.`)
      } else if (actionType === 'reject') {
        const reason = reasonText
          ? `0x${strToBytes32Hex(reasonText)}` as `0x${string}`
          : '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`
        await writeContractAsync({
          address: AGENTIC_COMMERCE,
          abi: AGENTIC_COMMERCE_ABI,
          functionName: 'reject',
          args: [BigInt(actionJobId), reason, '0x'],
          chain: arcTestnet,
        })
        setTxSuccess(`Job #${actionJobId} rejected.`)
      } else if (actionType === 'submit') {
        if (!deliverableHash) { setTxError('Deliverable hash required'); setTxPending(false); return }
        const hash = deliverableHash.startsWith('0x') ? deliverableHash : `0x${deliverableHash}`
        const padded = hash.padEnd(66, '0').slice(0, 66) as `0x${string}`
        await writeContractAsync({
          address: AGENTIC_COMMERCE,
          abi: AGENTIC_COMMERCE_ABI,
          functionName: 'submit',
          args: [BigInt(actionJobId), padded, '0x'],
          chain: arcTestnet,
        })
        setTxSuccess(`Deliverable submitted for job #${actionJobId}.`)
      } else if (actionType === 'refund') {
        await writeContractAsync({
          address: AGENTIC_COMMERCE,
          abi: AGENTIC_COMMERCE_ABI,
          functionName: 'claimRefund',
          args: [BigInt(actionJobId)],
          chain: arcTestnet,
        })
        setTxSuccess(`Refund claimed for job #${actionJobId}.`)
      }

      setActionJobId(null)
      setActionType(null)
      setDeliverableHash('')
      setReasonText('')
      // Refetch after action
      setTimeout(() => { refetchClient(); refetchProvider() }, 3000)
    } catch (err: any) {
      setTxError(err.shortMessage || err.message || 'Transaction failed')
    } finally {
      setTxPending(false)
    }
  }

  const jobs = tab === 'client' ? clientJobs?.data : providerJobs?.data

  return (
    <div className="page-enter" style={{ padding: '40px 24px', maxWidth: 800, margin: '0 auto' }}>
      <div style={{ fontSize: 11, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 24 }}>
        // my jobs
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <button
          onClick={() => setTab('client')}
          style={{
            fontSize: 12, padding: '6px 14px',
            border: '1px solid var(--dimmer)',
            color: tab === 'client' ? 'var(--text)' : 'var(--dim)',
            borderColor: tab === 'client' ? 'var(--dim)' : 'var(--dimmer)',
            background: 'transparent', cursor: 'pointer',
          }}
        >
          as client ({clientJobs?.total || 0})
        </button>
        <button
          onClick={() => setTab('provider')}
          style={{
            fontSize: 12, padding: '6px 14px',
            border: '1px solid var(--dimmer)',
            color: tab === 'provider' ? 'var(--text)' : 'var(--dim)',
            borderColor: tab === 'provider' ? 'var(--dim)' : 'var(--dimmer)',
            background: 'transparent', cursor: 'pointer',
          }}
        >
          as provider ({providerJobs?.total || 0})
        </button>
      </div>

      {/* Success/Error banners */}
      {txSuccess && (
        <div style={{ padding: 12, border: '1px solid #00ff00', color: '#00ff00', fontSize: 12, marginBottom: 16 }}>
          {txSuccess}
        </div>
      )}
      {txError && (
        <div style={{ padding: 12, border: '1px solid #ff4444', color: '#ff4444', fontSize: 12, marginBottom: 16 }}>
          {txError}
        </div>
      )}

      {/* Job list */}
      {!jobs || jobs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--dim)', fontSize: 12 }}>
          {tab === 'client' ? 'No jobs posted yet' : 'No jobs assigned to you'}
        </div>
      ) : (
        <div>
          {jobs.map((job) => (
            <div
              key={job.jobId}
              style={{
                padding: '12px 0',
                borderBottom: '1px solid var(--dimmer)',
              }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 80px', gap: 8, alignItems: 'center', fontSize: 12 }}>
                <StatusPill status={job.status} />
                <Link to={`/jobs/${job.jobId}`} style={{ color: 'var(--text)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  #{job.jobId} — {job.description ? formatDescription(job.description, job.jobId) : truncateAddress(job.provider || '')}
                </Link>
                <span style={{ textAlign: 'right', color: 'var(--dim)' }}>
                  {job.budget ? `${formatUsdc(job.budget)}` : '—'}
                </span>
              </div>

              {/* Action buttons based on status and role */}
              <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {/* Client actions */}
                {tab === 'client' && job.status === 'Submitted' && (
                  <>
                    <button
                      onClick={() => { setActionJobId(job.jobId); setActionType('complete'); setTxSuccess(null) }}
                      style={{ fontSize: 11, padding: '4px 10px', background: 'var(--accent)', color: 'var(--text)', border: 'none', cursor: 'pointer' }}
                    >
                      approve & pay
                    </button>
                    <button
                      onClick={() => { setActionJobId(job.jobId); setActionType('reject'); setTxSuccess(null) }}
                      style={{ fontSize: 11, padding: '4px 10px', background: 'transparent', color: '#ff4444', border: '1px solid #ff4444', cursor: 'pointer' }}
                    >
                      reject
                    </button>
                  </>
                )}
                {tab === 'client' && job.status === 'Expired' && (
                  <button
                    onClick={() => { setActionJobId(job.jobId); setActionType('refund'); handleAction() }}
                    style={{ fontSize: 11, padding: '4px 10px', background: 'transparent', color: 'var(--dim)', border: '1px solid var(--dimmer)', cursor: 'pointer' }}
                  >
                    claim refund
                  </button>
                )}

                {/* Provider actions */}
                {tab === 'provider' && (job.status === 'Funded' || job.status === 'Rejected') && (
                  <button
                    onClick={() => { setActionJobId(job.jobId); setActionType('submit'); setTxSuccess(null) }}
                    style={{ fontSize: 11, padding: '4px 10px', background: 'var(--accent)', color: 'var(--text)', border: 'none', cursor: 'pointer' }}
                  >
                    submit deliverable
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Action Modal */}
      {actionJobId && actionType && actionType !== 'refund' && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
        }}>
          <div style={{ background: '#111', border: '1px solid var(--dimmer)', padding: 24, maxWidth: 400, width: '90%' }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 16 }}>
              {actionType === 'complete' && `Approve Job #${actionJobId}`}
              {actionType === 'reject' && `Reject Job #${actionJobId}`}
              {actionType === 'submit' && `Submit Deliverable — Job #${actionJobId}`}
            </div>

            {actionType === 'submit' && (
              <input
                type="text"
                value={deliverableHash}
                onChange={(e) => setDeliverableHash(e.target.value)}
                placeholder="Deliverable hash (bytes32 or hex string)"
                style={{
                  display: 'block', width: '100%', marginBottom: 12, padding: 10,
                  background: 'var(--bg)', border: '1px solid var(--dimmer)', color: 'var(--text)',
                  fontFamily: 'var(--font)', fontSize: 12,
                }}
              />
            )}

            {(actionType === 'complete' || actionType === 'reject') && (
              <input
                type="text"
                value={reasonText}
                onChange={(e) => setReasonText(e.target.value)}
                placeholder="Reason (optional, max 32 chars)"
                style={{
                  display: 'block', width: '100%', marginBottom: 12, padding: 10,
                  background: 'var(--bg)', border: '1px solid var(--dimmer)', color: 'var(--text)',
                  fontFamily: 'var(--font)', fontSize: 12,
                }}
              />
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => { setActionJobId(null); setActionType(null) }}
                style={{ flex: 1, padding: '10px 0', fontSize: 12, background: 'transparent', color: 'var(--dim)', border: '1px solid var(--dimmer)', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleAction}
                disabled={txPending}
                style={{
                  flex: 2, padding: '10px 0', fontSize: 12, fontWeight: 700,
                  background: actionType === 'reject' ? '#ff4444' : 'var(--accent)',
                  color: 'var(--text)', border: 'none', cursor: txPending ? 'wait' : 'pointer',
                  opacity: txPending ? 0.5 : 1,
                }}
              >
                {txPending ? 'Confirming...' : actionType === 'complete' ? 'Approve & Release Payment' : actionType === 'reject' ? 'Reject' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
