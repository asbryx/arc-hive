import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { readContract, waitForTransactionReceipt } from '@wagmi/core'
import { parseUnits } from 'viem'
import { AGENTIC_COMMERCE, AGENTIC_COMMERCE_ABI, USDC_ADDRESS, USDC_ABI } from '@/lib/contracts'
import { arcTestnet, config } from '@/lib/wagmi'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

interface OpenJob {
  id: number
  jobId: number | null
  title: string
  description: string
  category: string | null
  requirements: string | null
  budgetMin: string | null
  budgetMax: string | null
  deadlineHours: number
  clientAddress: string
  onChainTx: string | null
  status: string
  applicationCount: number
  selectedApplicant: string | null
  onchainJobId: number | null
  fundedTx: string | null
  fundedAt: string | null
  completedTx: string | null
  completedAt: string | null
  rejectedAt: string | null
  finalBudget: string | null
  createdAt: string
}

interface Application {
  id: number
  applicantAddress: string
  agentId: number | null
  agentName: string | null
  completedJobs: number
  message: string | null
  proposedBudget: string | null
  status: string
  createdAt: string
}

interface Deliverable {
  id: number
  providerAddress: string
  content: string
  link: string | null
  notes: string | null
  version: number
  status: string
  clientFeedback: string | null
  createdAt: string
}

// Translate contract errors to human-readable messages
function parseContractError(err: any): string {
  const raw = err?.shortMessage || err?.message || ''
  if (raw.includes('WrongStatus')) return 'Job is not in the right state for this action. Refresh and try again.'
  if (raw.includes('NotClient')) return 'Only the job poster can approve this.'
  if (raw.includes('NotProvider')) return 'Only the assigned agent can do this.'
  if (raw.includes('NotEvaluator')) return 'Only the evaluator can do this.'
  if (raw.includes('Expired')) return 'This job has expired.'
  if (raw.includes('InsufficientBudget') || raw.includes('insufficient funds')) return 'Not enough USDC balance to fund this job.'
  if (raw.includes('InsufficientAllowance') || raw.includes('allowance')) return 'USDC approval needed. Approve spending first.'
  if (raw.includes('User rejected') || raw.includes('user rejected')) return 'Transaction cancelled.'
  if (raw.includes('reverted')) return 'Transaction failed on-chain. The contract rejected this action.'
  return raw.slice(0, 120) || 'Something went wrong. Try again.'
}

export default function MarketplaceDetail() {
  const { id } = useParams()
  const { address, isConnected } = useAccount()
  const { writeContractAsync } = useWriteContract()

  const [job, setJob] = useState<OpenJob | null>(null)
  const [applications, setApplications] = useState<Application[]>([])
  const [deliverables, setDeliverables] = useState<Deliverable[]>([])
  const [comments, setComments] = useState<{id: number, senderAddress: string, message: string, createdAt: string}[]>([])
  const [loading, setLoading] = useState(true)
  const [applying, setApplying] = useState(false)
  const [applyForm, setApplyForm] = useState({ message: '', proposedBudget: '' })
  const [applyError, setApplyError] = useState<string | null>(null)
  const [applySuccess, setApplySuccess] = useState(false)
  const [selectingAddr, setSelectingAddr] = useState<string | null>(null)
  const [funding, setFunding] = useState(false)
  const [fundStep, setFundStep] = useState('')
  const [delivering, setDelivering] = useState(false)
  const [deliverForm, setDeliverForm] = useState({ content: '', link: '', notes: '' })
  const [deliverError, setDeliverError] = useState<string | null>(null)
  const [completing, setCompleting] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [commentText, setCommentText] = useState('')
  const [postingComment, setPostingComment] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => { fetchJob() }, [id])

  async function fetchJob() {
    setLoading(true)
    try {
      const [jobRes, appsRes, delRes, commRes] = await Promise.all([
        fetch(`${API_BASE}/open-jobs/${id}`),
        fetch(`${API_BASE}/open-jobs/${id}/applications`),
        fetch(`${API_BASE}/open-jobs/${id}/deliverables`),
        fetch(`${API_BASE}/open-jobs/${id}/comments`),
      ])
      if (jobRes.ok) setJob(await jobRes.json())
      if (appsRes.ok) { const data = await appsRes.json(); setApplications(data.data || []) }
      if (delRes.ok) { const data = await delRes.json(); setDeliverables(data.data || []) }
      if (commRes.ok) { const data = await commRes.json(); setComments(data.data || []) }
    } catch {}
    setLoading(false)
  }

  async function handleApply() {
    if (!address) return
    setApplyError(null)
    try {
      const res = await fetch(`${API_BASE}/open-jobs/${id}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicantAddress: address,
          message: applyForm.message || null,
          proposedBudget: applyForm.proposedBudget || null,
        }),
      })
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Failed to apply') }
      setApplySuccess(true)
      setApplying(false)
      fetchJob()
    } catch (err: any) { setApplyError(err.message) }
  }

  async function handleSelect(applicantAddress: string) {
    if (!address || !job?.jobId) return
    setSelectingAddr(applicantAddress)
    try {
      const jobData = await fetch(`https://rpc.testnet.arc.network`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 1, method: 'eth_call',
          params: [{ to: AGENTIC_COMMERCE, data: '0xbf22c457' + BigInt(job.jobId).toString(16).padStart(64, '0') }, 'latest']
        })
      }).then(r => r.json())

      if (jobData.result) {
        const data = jobData.result.slice(2)
        const provider = '0x' + data.slice(192, 256).slice(24)
        if (provider !== '0x0000000000000000000000000000000000000000') {
          setActionError(`Provider already assigned on-chain (${provider.slice(0, 8)}...).`)
          setSelectingAddr(null)
          return
        }
      }

      await writeContractAsync({
        address: AGENTIC_COMMERCE,
        abi: AGENTIC_COMMERCE_ABI,
        functionName: 'setProvider',
        args: [BigInt(job.jobId), applicantAddress as `0x${string}`],
        chain: arcTestnet,
      })

      await fetch(`${API_BASE}/open-jobs/${id}/select`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicantAddress, clientAddress: address }),
      })
      fetchJob()
    } catch (err: any) {
      const msg = err.shortMessage || err.message || 'Failed to select agent'
      if (msg.includes('WrongStatus')) setActionError('Job no longer in Open status on-chain.')
      else if (msg.includes('Unauthorized')) setActionError('Only the job client can select a provider.')
      else setActionError(msg)
    }
    setSelectingAddr(null)
  }

  async function handleFund() {
    if (!address || !job?.jobId) return
    setFunding(true)
    setActionError(null)
    try {
      // Use the selected applicant's proposed budget or budgetMax
      const selectedApp = applications.find(a => a.status === 'selected')
      const budgetStr = selectedApp?.proposedBudget || job.budgetMax || job.budgetMin || '5'
      const budgetAtomic = parseUnits(budgetStr, 6)

      // Check on-chain job state first
      const onchainJob = await readContract(config, {
        address: AGENTIC_COMMERCE,
        abi: AGENTIC_COMMERCE_ABI,
        functionName: 'getJob',
        args: [BigInt(job.jobId)],
      })

      // Only call setBudget if budget not already set
      if (onchainJob.budget === 0n) {
        setFundStep('Setting budget on-chain...')
        const setBudgetTx = await writeContractAsync({
          address: AGENTIC_COMMERCE,
          abi: AGENTIC_COMMERCE_ABI,
          functionName: 'setBudget',
          args: [BigInt(job.jobId), budgetAtomic, '0x'],
          chain: arcTestnet,
        })
        const setBudgetReceipt = await waitForTransactionReceipt(config, { hash: setBudgetTx })
        if (setBudgetReceipt.status !== 'success') {
          setActionError('Failed to set budget on-chain. The provider may need to set it first.')
          setFunding(false); setFundStep(''); return
        }
      }

      // Step 2: Approve USDC
      setFundStep('Approving USDC...')
      const approveTx = await writeContractAsync({
        address: USDC_ADDRESS,
        abi: USDC_ABI,
        functionName: 'approve',
        args: [AGENTIC_COMMERCE, budgetAtomic],
        chain: arcTestnet,
      })
      const approveReceipt = await waitForTransactionReceipt(config, { hash: approveTx })
      if (approveReceipt.status !== 'success') {
        setActionError('USDC approval failed on-chain. Try again.')
        setFunding(false); setFundStep(''); return
      }

      // Step 3: Fund
      setFundStep('Funding job...')
      const fundTx = await writeContractAsync({
        address: AGENTIC_COMMERCE,
        abi: AGENTIC_COMMERCE_ABI,
        functionName: 'fund',
        args: [BigInt(job.jobId), '0x'],
        chain: arcTestnet,
      })
      const fundReceipt = await waitForTransactionReceipt(config, { hash: fundTx })
      if (fundReceipt.status !== 'success') {
        setActionError('Funding failed on-chain. USDC was approved but not transferred. Try again.')
        setFunding(false); setFundStep(''); return
      }

      // Step 4: Only update API after all txs confirmed
      setFundStep('Confirming...')
      await fetch(`${API_BASE}/open-jobs/${id}/fund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientAddress: address,
          onchainJobId: job.jobId,
          fundTx,
          budget: budgetStr,
        }),
      })

      fetchJob()
    } catch (err: any) {
      const msg = parseContractError(err)
      setActionError(msg)
    }
    setFunding(false)
    setFundStep('')
  }

  async function handleDeliver() {
    if (!address || !deliverForm.content) return
    setDeliverError(null)
    try {
      const res = await fetch(`${API_BASE}/open-jobs/${id}/deliver`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicantAddress: address,
          content: deliverForm.content,
          link: deliverForm.link || null,
          notes: deliverForm.notes || null,
        }),
      })
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Failed to submit') }
      setDelivering(false)
      setDeliverForm({ content: '', link: '', notes: '' })
      fetchJob()
    } catch (err: any) { setDeliverError(err.message) }
  }

  async function handleComplete() {
    if (!address || !job?.jobId) return
    setCompleting(true)
    setActionError(null)
    try {
      // Check on-chain status first
      const onchainJob = await readContract(config, {
        address: AGENTIC_COMMERCE,
        abi: AGENTIC_COMMERCE_ABI,
        functionName: 'getJob',
        args: [BigInt(job.jobId)],
      })

      // Status 1 = FUNDED, need submit first
      if (onchainJob.status === 1) {
        if (address.toLowerCase() === onchainJob.provider.toLowerCase()) {
          const deliverableContent = deliverables[0]?.content || 'deliverable'
          const deliverableBytes = new TextEncoder().encode(deliverableContent.slice(0, 100))
          const deliverableHash = '0x' + Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', deliverableBytes))).map(b => b.toString(16).padStart(2, '0')).join('')
          const submitTx = await writeContractAsync({
            address: AGENTIC_COMMERCE,
            abi: AGENTIC_COMMERCE_ABI,
            functionName: 'submit',
            args: [BigInt(job.jobId), deliverableHash as `0x${string}`, '0x'],
            chain: arcTestnet,
          })
          const submitReceipt = await waitForTransactionReceipt(config, { hash: submitTx })
          if (submitReceipt.status !== 'success') {
            setActionError('On-chain submit failed. Try again.')
            setCompleting(false)
            return
          }
        } else {
          setActionError('Agent hasn\'t submitted their work on-chain yet. Ask them to submit before you can approve.')
          setCompleting(false)
          return
        }
      } else if (onchainJob.status === 3) {
        setActionError('This job is already completed on-chain.')
        setCompleting(false)
        return
      } else if (onchainJob.status !== 2) {
        setActionError('Job is not ready to be approved yet. Current state: ' + ['Open', 'Funded', 'Submitted', 'Completed', 'Rejected', 'Expired'][onchainJob.status] || 'Unknown')
        setCompleting(false)
        return
      }

      const reasonBytes = new TextEncoder().encode('Deliverable approved')
      const reasonHash = '0x' + Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', reasonBytes))).map(b => b.toString(16).padStart(2, '0')).join('')

      const completeTx = await writeContractAsync({
        address: AGENTIC_COMMERCE,
        abi: AGENTIC_COMMERCE_ABI,
        functionName: 'complete',
        args: [BigInt(job.jobId), reasonHash as `0x${string}`, '0x'],
        chain: arcTestnet,
      })

      // Wait for tx confirmation
      const receipt = await waitForTransactionReceipt(config, { hash: completeTx })
      if (receipt.status !== 'success') {
        setActionError('Transaction failed on-chain. Payment was not released.')
        setCompleting(false)
        return
      }

      // Only update DB after confirmed on-chain
      await fetch(`${API_BASE}/open-jobs/${id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientAddress: address, completionTx: completeTx }),
      })
      fetchJob()
    } catch (err: any) {
      const msg = parseContractError(err)
      setActionError(msg)
    }
    setCompleting(false)
  }

  async function handleReject() {
    if (!address) return
    setRejecting(true)
    try {
      await fetch(`${API_BASE}/open-jobs/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientAddress: address, reason: rejectReason }),
      })
      setRejectReason('')
      fetchJob()
    } catch (err: any) { setActionError(err.message) }
    setRejecting(false)
  }

  async function handlePostComment() {
    if (!address || !commentText.trim()) return
    setPostingComment(true)
    try {
      await fetch(`${API_BASE}/open-jobs/${id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senderAddress: address, message: commentText.trim() }),
      })
      setCommentText('')
      fetchJob()
    } catch {}
    setPostingComment(false)
  }

  if (loading) {
    return <div className="page-enter" style={{ padding: '80px 24px', maxWidth: 700, margin: '0 auto' }}>
      <div style={{ color: 'var(--dim)', fontSize: 12 }}>Loading...</div>
    </div>
  }

  if (!job) {
    return <div className="page-enter" style={{ padding: '80px 24px', maxWidth: 700, margin: '0 auto' }}>
      <div style={{ color: 'var(--dim)', fontSize: 12 }}>Job not found</div>
    </div>
  }

  const isClient = address?.toLowerCase() === job.clientAddress.toLowerCase()
  const isAgent = address?.toLowerCase() === job.selectedApplicant?.toLowerCase()
  const hasApplied = applications.some(a => a.applicantAddress.toLowerCase() === address?.toLowerCase())
  const timeAgo = getTimeAgo(job.createdAt)
  const selectedApp = applications.find(a => a.status === 'selected')

  return (
    <div className="page-enter" style={{ padding: '80px 24px', maxWidth: 700, margin: '0 auto' }}>
      <Link to="/marketplace" style={{ fontSize: 11, color: 'var(--dim)', textDecoration: 'none' }}>
        ← back to marketplace
      </Link>

      {/* Inline error banner */}
      {actionError && (
        <div style={{ margin: '16px 0', padding: '12px 16px', background: '#1a0000', border: '1px solid #4a1111', fontSize: 12, color: '#ff6b6b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>⚠ {actionError}</span>
          <span onClick={() => setActionError(null)} style={{ cursor: 'pointer', opacity: 0.6 }}>✕</span>
        </div>
      )}

      {/* Job Header */}
      <div style={{ marginTop: 20, marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          {job.category && (
            <span style={{ padding: '2px 8px', fontSize: 10, background: 'var(--dimmer)', color: 'var(--text)' }}>
              {job.category}
            </span>
          )}
          <span style={{ fontSize: 10, color: statusColor(job.status) }}>● {job.status}</span>
          <span style={{ fontSize: 10, color: 'var(--dim)' }}>· {timeAgo}</span>
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>{job.title}</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, padding: '12px 0', borderTop: '1px solid var(--dimmer)', borderBottom: '1px solid var(--dimmer)', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--dim)', textTransform: 'uppercase' }}>Budget</div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>
              {job.finalBudget ? `${job.finalBudget} USDC` : job.budgetMin && job.budgetMax ? `${job.budgetMin}–${job.budgetMax} USDC` : `${job.budgetMax || job.budgetMin || 'Open'} USDC`}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--dim)', textTransform: 'uppercase' }}>Deadline</div>
            <div style={{ fontSize: 13 }}>{job.deadlineHours}h</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--dim)', textTransform: 'uppercase' }}>Applicants</div>
            <div style={{ fontSize: 13 }}>{job.applicationCount}</div>
          </div>
        </div>
      </div>

      {/* Status Timeline */}
      <StatusTimeline job={job} selectedApp={selectedApp} />

      {/* Description */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Description</div>
        <div style={{ fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{job.description}</div>
      </div>

      {/* Requirements */}
      {job.requirements && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Requirements</div>
          <div style={{ fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap', padding: '12px 16px', border: '1px solid var(--dimmer)' }}>
            {job.requirements}
          </div>
        </div>
      )}

      {/* Client info */}
      <div style={{ fontSize: 11, color: 'var(--dim)', marginBottom: 32 }}>
        Posted by {job.clientAddress.slice(0, 6)}...{job.clientAddress.slice(-4)}
        {job.onChainTx && <> · <a href={`https://testnet.arcscan.app/tx/${job.onChainTx}`} target="_blank" style={{ color: 'var(--accent)' }}>on-chain ↗</a></>}
      </div>

      {/* ═══ CLIENT: Fund Button (after selection, before funding) ═══ */}
      {isClient && job.status === 'assigned' && (
        <div style={{ borderTop: '1px solid var(--dimmer)', paddingTop: 24, marginBottom: 24 }}>
          <div style={{ fontSize: 11, color: 'var(--dim)', marginBottom: 12 }}>
            Agent selected. Fund the job to lock USDC in escrow and allow work to begin.
          </div>
          <button
            onClick={handleFund}
            disabled={funding}
            style={{
              width: '100%', padding: '14px 0', fontSize: 13, fontWeight: 700,
              background: 'var(--accent)', color: '#ffffff', border: 'none', cursor: 'pointer',
              opacity: funding ? 0.6 : 1,
            }}
          >
            {funding ? fundStep || 'Processing...' : `Fund Job (${selectedApp?.proposedBudget || job.budgetMax || job.budgetMin} USDC)`}
          </button>
        </div>
      )}

      {/* ═══ AGENT: Submit Deliverable (after funded/in_progress) ═══ */}
      {isAgent && ['funded', 'in_progress'].includes(job.status) && (
        <div style={{ borderTop: '1px solid var(--dimmer)', paddingTop: 24, marginBottom: 24 }}>
          {!delivering ? (
            <button
              onClick={() => setDelivering(true)}
              style={{
                width: '100%', padding: '14px 0', fontSize: 13, fontWeight: 700,
                background: 'var(--accent)', color: '#ffffff', border: 'none', cursor: 'pointer',
              }}
            >
              Submit Deliverable
            </button>
          ) : (
            <div>
              <div style={{ fontSize: 11, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
                Submit Your Work
              </div>
              <label style={{ display: 'block', marginBottom: 12 }}>
                <span style={{ fontSize: 11, color: 'var(--dim)' }}>Description of work done *</span>
                <textarea
                  value={deliverForm.content}
                  onChange={(e) => setDeliverForm({ ...deliverForm, content: e.target.value })}
                  placeholder="Describe what you delivered..."
                  style={{
                    display: 'block', width: '100%', marginTop: 4, padding: 10,
                    background: 'var(--bg)', border: '1px solid var(--dimmer)', color: 'var(--text)',
                    fontFamily: 'var(--font)', fontSize: 13, minHeight: 100, resize: 'vertical',
                  }}
                />
              </label>
              <label style={{ display: 'block', marginBottom: 12 }}>
                <span style={{ fontSize: 11, color: 'var(--dim)' }}>Link (GitHub, deployed URL, doc)</span>
                <input
                  type="url"
                  value={deliverForm.link}
                  onChange={(e) => setDeliverForm({ ...deliverForm, link: e.target.value })}
                  placeholder="https://..."
                  style={{
                    display: 'block', width: '100%', marginTop: 4, padding: 10,
                    background: 'var(--bg)', border: '1px solid var(--dimmer)', color: 'var(--text)',
                    fontFamily: 'var(--font)', fontSize: 13,
                  }}
                />
              </label>
              <label style={{ display: 'block', marginBottom: 16 }}>
                <span style={{ fontSize: 11, color: 'var(--dim)' }}>Notes</span>
                <textarea
                  value={deliverForm.notes}
                  onChange={(e) => setDeliverForm({ ...deliverForm, notes: e.target.value })}
                  placeholder="Additional context..."
                  style={{
                    display: 'block', width: '100%', marginTop: 4, padding: 10,
                    background: 'var(--bg)', border: '1px solid var(--dimmer)', color: 'var(--text)',
                    fontFamily: 'var(--font)', fontSize: 13, minHeight: 60, resize: 'vertical',
                  }}
                />
              </label>
              {deliverError && (
                <div style={{ padding: 8, border: '1px solid #ff4444', color: '#ff4444', fontSize: 11, marginBottom: 12 }}>{deliverError}</div>
              )}
              <div style={{ display: 'flex', gap: 12 }}>
                <button onClick={() => setDelivering(false)} style={{ flex: 1, padding: '10px 0', fontSize: 12, background: 'transparent', color: 'var(--dim)', border: '1px solid var(--dimmer)', cursor: 'pointer' }}>Cancel</button>
                <button onClick={handleDeliver} style={{ flex: 2, padding: '10px 0', fontSize: 12, fontWeight: 700, background: 'var(--accent)', color: '#ffffff', border: 'none', cursor: 'pointer' }}>Submit Work</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ Deliverables Display ═══ */}
      {deliverables.length > 0 && (
        <div style={{ borderTop: '1px solid var(--dimmer)', paddingTop: 24, marginBottom: 24 }}>
          <div style={{ fontSize: 11, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16 }}>
            Deliverables
          </div>
          {deliverables.map(d => (
            <div key={d.id} style={{ padding: 16, border: '1px solid var(--dimmer)', marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--dim)' }}>v{d.version} · {getTimeAgo(d.createdAt)}</span>
                <span style={{ fontSize: 10, color: d.status === 'approved' ? '#4caf50' : d.status === 'revision_requested' ? '#ff9800' : 'var(--dim)' }}>
                  {d.status === 'approved' ? '✓ approved' : d.status === 'revision_requested' ? '⚠ revision requested' : '● submitted'}
                </span>
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap', marginBottom: 8 }}>{d.content}</div>
              {d.link && (
                <a href={d.link} target="_blank" style={{ fontSize: 12, color: 'var(--accent)' }}>{d.link} ↗</a>
              )}
              {d.notes && <div style={{ fontSize: 12, color: 'var(--dim)', marginTop: 8 }}>{d.notes}</div>}
              {d.clientFeedback && (
                <div style={{ marginTop: 12, padding: '8px 12px', border: '1px solid #ff9800', fontSize: 12 }}>
                  <span style={{ color: '#ff9800', fontWeight: 700 }}>Feedback:</span> {d.clientFeedback}
                </div>
              )}
            </div>
          ))}

          {/* Client review buttons */}
          {isClient && job.status === 'delivered' && (
            <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
              <button
                onClick={handleComplete}
                disabled={completing}
                style={{
                  flex: 2, padding: '12px 0', fontSize: 12, fontWeight: 700,
                  background: '#4caf50', color: '#ffffff', border: 'none', cursor: 'pointer',
                  opacity: completing ? 0.6 : 1,
                }}
              >
                {completing ? 'Completing...' : 'Approve & Pay →'}
              </button>
              <button
                onClick={() => {
                  const reason = prompt('Feedback for the agent (what needs to change):')
                  if (reason) { setRejectReason(reason); handleReject() }
                }}
                disabled={rejecting}
                style={{
                  flex: 1, padding: '12px 0', fontSize: 12,
                  background: 'transparent', color: '#ff9800', border: '1px solid #ff9800', cursor: 'pointer',
                }}
              >
                Request Revision
              </button>
            </div>
          )}
        </div>
      )}

      {/* ═══ Apply Section (for agents, open jobs) ═══ */}
      {!isClient && job.status === 'open' && isConnected && !hasApplied && !applySuccess && (
        <div style={{ borderTop: '1px solid var(--dimmer)', paddingTop: 24, marginBottom: 24 }}>
          {!applying ? (
            <button
              onClick={() => setApplying(true)}
              style={{
                width: '100%', padding: '14px 0', fontSize: 13, fontWeight: 700,
                background: 'var(--accent)', color: '#ffffff', border: 'none', cursor: 'pointer',
              }}
            >
              Apply for this Job
            </button>
          ) : (
            <div>
              <div style={{ fontSize: 11, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Your Application</div>
              <label style={{ display: 'block', marginBottom: 12 }}>
                <span style={{ fontSize: 11, color: 'var(--dim)' }}>Proposed Budget (USDC)</span>
                <input
                  type="number" step="0.01"
                  value={applyForm.proposedBudget}
                  onChange={(e) => setApplyForm({ ...applyForm, proposedBudget: e.target.value })}
                  placeholder="Your price"
                  style={{ display: 'block', width: '100%', marginTop: 4, padding: 10, background: 'var(--bg)', border: '1px solid var(--dimmer)', color: 'var(--text)', fontFamily: 'var(--font)', fontSize: 13 }}
                />
              </label>
              <label style={{ display: 'block', marginBottom: 16 }}>
                <span style={{ fontSize: 11, color: 'var(--dim)' }}>Message</span>
                <textarea
                  value={applyForm.message}
                  onChange={(e) => setApplyForm({ ...applyForm, message: e.target.value })}
                  placeholder="Why you're a good fit..."
                  style={{ display: 'block', width: '100%', marginTop: 4, padding: 10, background: 'var(--bg)', border: '1px solid var(--dimmer)', color: 'var(--text)', fontFamily: 'var(--font)', fontSize: 13, minHeight: 80, resize: 'vertical' }}
                />
              </label>
              {applyError && <div style={{ padding: 8, border: '1px solid #ff4444', color: '#ff4444', fontSize: 11, marginBottom: 12 }}>{applyError}</div>}
              <div style={{ display: 'flex', gap: 12 }}>
                <button onClick={() => setApplying(false)} style={{ flex: 1, padding: '10px 0', fontSize: 12, background: 'transparent', color: 'var(--dim)', border: '1px solid var(--dimmer)', cursor: 'pointer' }}>Cancel</button>
                <button onClick={handleApply} style={{ flex: 2, padding: '10px 0', fontSize: 12, fontWeight: 700, background: 'var(--accent)', color: '#ffffff', border: 'none', cursor: 'pointer' }}>Submit Application</button>
              </div>
            </div>
          )}
        </div>
      )}

      {(hasApplied || applySuccess) && job.status === 'open' && (
        <div style={{ padding: '12px 16px', border: '1px solid var(--accent)', fontSize: 12, color: 'var(--accent)', marginBottom: 24 }}>
          ✓ Applied. Client will review and select a provider.
        </div>
      )}

      {!isConnected && job.status === 'open' && (
        <div style={{ padding: '12px 16px', border: '1px solid var(--dimmer)', fontSize: 12, color: 'var(--dim)', marginBottom: 24 }}>
          Connect wallet to apply for this job.
        </div>
      )}

      {/* ═══ Applications (client view) ═══ */}
      {isClient && applications.length > 0 && (
        <div style={{ borderTop: '1px solid var(--dimmer)', paddingTop: 24 }}>
          <div style={{ fontSize: 11, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16 }}>
            Applications ({applications.length})
          </div>
          {applications.map(app => (
            <div key={app.id} style={{ padding: 16, border: '1px solid var(--dimmer)', marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>
                    {app.agentName || `${app.applicantAddress.slice(0, 8)}...${app.applicantAddress.slice(-4)}`}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 2 }}>
                    {app.completedJobs} jobs completed{app.agentId && <> · Agent #{app.agentId}</>}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  {app.proposedBudget && <div style={{ fontSize: 13, fontWeight: 700 }}>{app.proposedBudget} USDC</div>}
                  <div style={{ fontSize: 10, color: app.status === 'selected' ? '#4caf50' : 'var(--dim)' }}>
                    {app.status === 'selected' ? '✓ selected' : app.status}
                  </div>
                </div>
              </div>
              {app.message && <div style={{ fontSize: 12, color: 'var(--dim)', marginTop: 8, whiteSpace: 'pre-wrap' }}>{app.message}</div>}
              {app.status === 'pending' && job.status === 'open' && (
                <button
                  onClick={() => handleSelect(app.applicantAddress)}
                  disabled={selectingAddr !== null}
                  style={{
                    marginTop: 12, padding: '8px 16px', fontSize: 11, fontWeight: 700,
                    background: 'var(--accent)', color: '#ffffff', border: 'none', cursor: 'pointer',
                    opacity: selectingAddr ? 0.5 : 1,
                  }}
                >
                  {selectingAddr === app.applicantAddress ? 'Confirming...' : 'Select Agent →'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* On-chain settlement (completed) */}
      {job.status === 'completed' && (
        <div style={{ borderTop: '1px solid var(--dimmer)', paddingTop: 24, marginBottom: 24 }}>
          <div style={{ fontSize: 11, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>On-chain Settlement</div>
          <div style={{ fontSize: 12, lineHeight: 2 }}>
            {job.onchainJobId && <div>Job ID: #{job.onchainJobId} · <a href={`https://testnet.arcscan.app/tx/${job.fundedTx}`} target="_blank" style={{ color: 'var(--accent)' }}>fund tx ↗</a></div>}
            {job.finalBudget && <div>Payment: {job.finalBudget} USDC → {job.selectedApplicant?.slice(0, 8)}...</div>}
            {job.completedTx && <div>Completed: <a href={`https://testnet.arcscan.app/tx/${job.completedTx}`} target="_blank" style={{ color: 'var(--accent)' }}>tx ↗</a></div>}
          </div>
        </div>
      )}

      {/* ═══ Comments Thread ═══ */}
      {isConnected && (
        <div style={{ borderTop: '1px solid var(--dimmer)', paddingTop: 24, marginBottom: 24 }}>
          <div style={{ fontSize: 11, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16 }}>
            Discussion {comments.length > 0 && `(${comments.length})`}
          </div>

          {comments.map(c => (
            <div key={c.id} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid var(--dimmer)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: c.senderAddress.toLowerCase() === job.clientAddress.toLowerCase() ? 'var(--accent)' : 'var(--text)' }}>
                  {c.senderAddress.slice(0, 8)}...{c.senderAddress.slice(-4)}
                  {c.senderAddress.toLowerCase() === job.clientAddress.toLowerCase() && ' (client)'}
                  {c.senderAddress.toLowerCase() === job.selectedApplicant?.toLowerCase() && ' (agent)'}
                </span>
                <span style={{ fontSize: 10, color: 'var(--dim)' }}>{getTimeAgo(c.createdAt)}</span>
              </div>
              <div style={{ fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{c.message}</div>
            </div>
          ))}

          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handlePostComment() } }}
              placeholder="Add a comment..."
              style={{
                flex: 1, padding: '10px 12px', fontSize: 12,
                background: 'var(--bg)', border: '1px solid var(--dimmer)', color: 'var(--text)',
                fontFamily: 'var(--font)',
              }}
            />
            <button
              onClick={handlePostComment}
              disabled={postingComment || !commentText.trim()}
              style={{
                padding: '10px 16px', fontSize: 11, fontWeight: 700,
                background: 'var(--accent)', color: '#ffffff', border: 'none', cursor: 'pointer',
                opacity: postingComment || !commentText.trim() ? 0.5 : 1,
              }}
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Status Timeline Component ───────────────────────────────────────────────

function StatusTimeline({ job, selectedApp }: { job: OpenJob; selectedApp?: Application | null }) {
  const steps = [
    { label: 'Posted', done: true, time: job.createdAt },
    { label: 'Agent Selected', done: ['assigned', 'funded', 'in_progress', 'delivered', 'completed'].includes(job.status), time: job.selectedApplicant ? undefined : undefined, detail: job.selectedApplicant ? `${job.selectedApplicant.slice(0, 8)}...` : undefined },
    { label: 'Funded', done: ['funded', 'in_progress', 'delivered', 'completed'].includes(job.status), time: job.fundedAt || undefined, detail: job.finalBudget ? `${job.finalBudget} USDC` : undefined },
    { label: 'In Progress', done: ['in_progress', 'delivered', 'completed'].includes(job.status) },
    { label: 'Delivered', done: ['delivered', 'completed'].includes(job.status) },
    { label: 'Completed', done: job.status === 'completed', time: job.completedAt || undefined },
  ]

  return (
    <div style={{ marginBottom: 24, padding: '16px 0' }}>
      {steps.map((step, i) => (
        <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: i < steps.length - 1 ? 4 : 0 }}>
          <div style={{ width: 16, textAlign: 'center', fontSize: 11, lineHeight: '18px' }}>
            {step.done ? '●' : '○'}
          </div>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 12, color: step.done ? 'var(--text)' : 'var(--dim)' }}>{step.label}</span>
            {step.detail && <span style={{ fontSize: 11, color: 'var(--dim)', marginLeft: 8 }}>— {step.detail}</span>}
            {step.time && <span style={{ fontSize: 10, color: 'var(--dim)', marginLeft: 8 }}>({getTimeAgo(step.time)})</span>}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function statusColor(status: string): string {
  switch (status) {
    case 'open': return 'var(--dim)'
    case 'assigned': return '#ff9800'
    case 'funded': return '#2196f3'
    case 'in_progress': return '#2196f3'
    case 'delivered': return '#9c27b0'
    case 'completed': return '#4caf50'
    case 'cancelled': return '#ff4444'
    default: return 'var(--dim)'
  }
}

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const hours = Math.floor(diff / 3600000)
  if (hours < 1) return 'just now'
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
