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
  refundTx: string | null
  refundedAt: string | null
  finalBudget: string | null
  maxRevisions: number
  revisionCount: number
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

interface Evaluation {
  id: number
  version: number
  score: number
  breakdown: { completeness: number; quality: number; effort: number; format: number } | null
  reasoning: string
  suggestions: string | null
  status: 'approved' | 'rejected' | 'failed'
  txHash: string | null
  llmModel: string | null
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
  const [submittingOnChain, setSubmittingOnChain] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [commentText, setCommentText] = useState('')
  const [postingComment, setPostingComment] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [evaluations, setEvaluations] = useState<Evaluation[]>([])

  useEffect(() => { fetchJob() }, [id])

  async function fetchJob() {
    setLoading(true)
    try {
      const [jobRes, appsRes, delRes, commRes, evalRes] = await Promise.all([
        fetch(`${API_BASE}/open-jobs/${id}`),
        fetch(`${API_BASE}/open-jobs/${id}/applications`),
        fetch(`${API_BASE}/open-jobs/${id}/deliverables`),
        fetch(`${API_BASE}/open-jobs/${id}/comments`),
        fetch(`${API_BASE}/open-jobs/${id}/evaluations`),
      ])
      const jobData = jobRes.ok ? await jobRes.json() : null
      if (jobData) setJob(jobData)
      if (appsRes.ok) { const data = await appsRes.json(); setApplications(data.data || []) }
      if (delRes.ok) { const data = await delRes.json(); setDeliverables(data.data || []) }
      if (commRes.ok) { const data = await commRes.json(); setComments(data.data || []) }
      if (evalRes.ok) { const data = await evalRes.json(); setEvaluations(data.data || []) }
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
    if (!address) return
    setSelectingAddr(applicantAddress)
    setActionError(null)
    try {
      let onchainJobId = job?.jobId ? BigInt(job.jobId) : null

      // If no on-chain job, create one first
      if (!onchainJobId) {
        const createTx = await writeContractAsync({
          address: AGENTIC_COMMERCE,
          abi: AGENTIC_COMMERCE_ABI,
          functionName: 'createJob',
          args: [job!.description || '', '0x0000000000000000000000000000000000000000'] as const,
          chain: arcTestnet,
        } as any)
        const receipt = await waitForTransactionReceipt(config, { hash: createTx, confirmations: 1 })
        // Extract jobId from logs
        const jobCreatedLog = receipt.logs[0]
        if (jobCreatedLog && jobCreatedLog.topics[1]) {
          onchainJobId = BigInt(jobCreatedLog.topics[1])
        } else {
          setActionError('Failed to get job ID from transaction')
          setSelectingAddr(null)
          return
        }
        // Update DB with on-chain job ID and tx
        await fetch(`${API_BASE}/open-jobs/${id}/link-chain`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobId: Number(onchainJobId), onChainTx: createTx }),
        })
      }

      // Check if provider already set
      const jobData = await fetch(`https://rpc.testnet.arc.network`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 1, method: 'eth_call',
          params: [{ to: AGENTIC_COMMERCE, data: '0xbf22c457' + onchainJobId!.toString(16).padStart(64, '0') }, 'latest']
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

      // setProvider to PLATFORM wallet (handles setBudget/submit on-chain)
      const PLATFORM_PROVIDER = '0x9D9c695998fb3e193B3b608Ab4DCFfbF1446A026' as `0x${string}`
      const setProviderTx = await writeContractAsync({
        address: AGENTIC_COMMERCE,
        abi: AGENTIC_COMMERCE_ABI,
        functionName: 'setProvider',
        args: [onchainJobId!, PLATFORM_PROVIDER],
        chain: arcTestnet,
      })
      await waitForTransactionReceipt(config, { hash: setProviderTx, confirmations: 1 })

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
      const jobIdBig = BigInt(job.jobId)

      // Check on-chain job state first
      const onchainJob = await readContract(config, {
        address: AGENTIC_COMMERCE,
        abi: AGENTIC_COMMERCE_ABI,
        functionName: 'getJob',
        args: [jobIdBig],
      })

      // Step 1: setProvider if provider is still zero on-chain
      // On-chain provider must be the platform's provider wallet (handles submit/setBudget)
      const PLATFORM_PROVIDER = '0x9D9c695998fb3e193B3b608Ab4DCFfbF1446A026' as `0x${string}`
      if (onchainJob.provider === '0x0000000000000000000000000000000000000000') {
        setFundStep('Setting provider on-chain...')
        const setProvTx = await writeContractAsync({
          address: AGENTIC_COMMERCE,
          abi: AGENTIC_COMMERCE_ABI,
          functionName: 'setProvider',
          args: [jobIdBig, PLATFORM_PROVIDER],
          chain: arcTestnet,
        })
        const setProvReceipt = await waitForTransactionReceipt(config, { hash: setProvTx })
        if (setProvReceipt.status !== 'success') {
          setActionError('Failed to set provider on-chain. Try again.')
          setFunding(false); setFundStep(''); return
        }
      }

      // Step 2: setBudget — must be called by provider, so ask API backend to do it
      if (onchainJob.budget === 0n) {
        setFundStep('Setting budget...')
        const setBudgetRes = await fetch(`${API_BASE}/open-jobs/${id}/set-budget`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ budget: budgetStr }),
        })
        if (!setBudgetRes.ok) {
          const err = await setBudgetRes.json().catch(() => ({ error: 'setBudget failed' }))
          setActionError(err.error || 'Failed to set budget. Try again.')
          setFunding(false); setFundStep(''); return
        }
        // Re-read on-chain state after setBudget
        const updatedJob = await readContract(config, {
          address: AGENTIC_COMMERCE,
          abi: AGENTIC_COMMERCE_ABI,
          functionName: 'getJob',
          args: [jobIdBig],
        })
        if (updatedJob.budget === 0n) {
          setActionError('Budget still not set. Contact support.')
          setFunding(false); setFundStep(''); return
        }
      }

      // Step 3: Approve USDC
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

      // Step 4: Fund
      setFundStep('Funding job...')
      const fundTx = await writeContractAsync({
        address: AGENTIC_COMMERCE,
        abi: AGENTIC_COMMERCE_ABI,
        functionName: 'fund',
        args: [jobIdBig, '0x'],
        chain: arcTestnet,
      })
      const fundReceipt = await waitForTransactionReceipt(config, { hash: fundTx })
      if (fundReceipt.status !== 'success') {
        setActionError('Funding failed on-chain. USDC was approved but not transferred. Try again.')
        setFunding(false); setFundStep(''); return
      }

      // Step 5: Only update API after all txs confirmed
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

  async function handleSubmitOnChain() {
    if (!address || !job?.jobId || deliverables.length === 0) return
    setSubmittingOnChain(true)
    setActionError(null)
    try {
      const content = deliverables[0].content || 'deliverable'
      const contentBytes = new TextEncoder().encode(content.slice(0, 100))
      const hash = '0x' + Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', contentBytes))).map(b => b.toString(16).padStart(2, '0')).join('')
      const tx = await writeContractAsync({
        address: AGENTIC_COMMERCE,
        abi: AGENTIC_COMMERCE_ABI,
        functionName: 'submit',
        args: [BigInt(job.jobId), hash as `0x${string}`, '0x'],
        chain: arcTestnet,
      })
      await waitForTransactionReceipt(config, { hash: tx, confirmations: 1 })
      // On-chain submit auto-completes — update DB
      await fetch(`${API_BASE}/open-jobs/${id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completedTx: tx }),
      })
      fetchJob()
    } catch (err: any) {
      const msg = err?.shortMessage || err?.message || 'Submit failed'
      setActionError(msg)
    } finally {
      setSubmittingOnChain(false)
    }
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

      {/* ═══ AGENT: Submit Deliverable (after funded/in_progress/revision_requested) ═══ */}
      {isAgent && ['funded', 'in_progress', 'revision_requested'].includes(job.status) && (
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

      {/* ═══ Deliverables + Evaluations Timeline (interleaved by version) ═══ */}
      {deliverables.length > 0 && (
        <div style={{ borderTop: '1px solid var(--dimmer)', paddingTop: 24, marginBottom: 24 }}>
          <div style={{ fontSize: 11, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16 }}>
            Deliverables & Evaluation
          </div>

          {[...deliverables].sort((a, b) => a.version - b.version).map(d => {
            const ev = evaluations.find(e => e.version === d.version)
            return (
              <div key={d.id} style={{ marginBottom: 20 }}>
                {/* Deliverable */}
                <div style={{ padding: 16, border: '1px solid var(--dimmer)', marginBottom: ev ? 0 : 12, borderBottom: ev ? 'none' : undefined }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 11, color: 'var(--dim)' }}>v{d.version} · {getTimeAgo(d.createdAt)}</span>
                    <span style={{ fontSize: 10, color: d.status === 'approved' ? '#4caf50' : d.status === 'revision_requested' ? '#ff9800' : 'var(--dim)' }}>
                      {d.status === 'approved' ? '✓ approved' : d.status === 'revision_requested' ? '⚠️ revision requested' : d.status === 'failed' ? '✗ failed' : '● submitted'}
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

                {/* Evaluation for this version (directly below) */}
                {ev && (() => {
                  const scoreColor = ev.score >= 70 ? '#4caf50' : ev.score >= 50 ? '#ff9800' : '#ff4444'
                  const statusLabel = ev.status === 'approved' ? '✓ APPROVED' : ev.status === 'failed' ? '✗ FAILED' : '↻ REVISION NEEDED'
                  const evStatusColor = ev.status === 'approved' ? '#4caf50' : ev.status === 'failed' ? '#ff4444' : '#ff9800'
                  return (
                    <div style={{ padding: 16, border: `1px solid ${evStatusColor}33`, background: `${evStatusColor}08`, marginBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 10, color: 'var(--dim)' }}>evaluation</span>
                          <span style={{ fontSize: 11, color: evStatusColor, fontWeight: 700 }}>{statusLabel}</span>
                        </div>
                        <span style={{ fontSize: 22, fontWeight: 800, color: scoreColor }}>{ev.score}<span style={{ fontSize: 11, color: 'var(--dim)' }}>/100</span></span>
                      </div>

                      <div style={{ height: 3, background: 'var(--dimmer)', width: '100%', marginBottom: 12 }}>
                        <div style={{ height: 3, width: `${ev.score}%`, background: scoreColor }} />
                      </div>

                      {ev.breakdown && (
                        <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                          {Object.entries(ev.breakdown).map(([key, val]) => (
                            <span key={key} style={{ fontSize: 10, color: 'var(--dim)' }}>
                              {key}: <span style={{ color: 'var(--text)', fontWeight: 600 }}>{val as number}</span>
                            </span>
                          ))}
                        </div>
                      )}

                      <div style={{ fontSize: 12, lineHeight: 1.7, color: 'var(--text)', whiteSpace: 'pre-wrap', marginBottom: 8 }}>
                        {ev.reasoning}
                      </div>

                      {ev.suggestions && (
                        <div style={{ fontSize: 11, color: '#ff9800', marginBottom: 8, padding: '8px 12px', background: '#ff980010', border: '1px solid #ff980033' }}>
                          💡 {ev.suggestions}
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 10, color: 'var(--dim)' }}>
                        {ev.llmModel && <span>model: {ev.llmModel}</span>}
                        <span>{new Date(ev.createdAt).toLocaleString()}</span>
                        {ev.txHash && (
                          <a href={`https://testnet.arcscan.app/tx/${ev.txHash}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--dim)', textDecoration: 'underline' }}>
                            tx ↗
                          </a>
                        )}
                      </div>
                    </div>
                  )
                })()}
              </div>
            )
          })}

          {/* Evaluating spinner for latest unmatched delivery */}
          {job.status === 'evaluating' && deliverables.length > evaluations.length && (
            <div style={{ padding: 12, border: '1px solid var(--dimmer)', textAlign: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 11, color: 'var(--dim)' }}>⏳ AI evaluator is reviewing this deliverable...</span>
            </div>
          )}

          {/* Revision counter */}
          {job.status === 'revision_requested' && (
            <div style={{ fontSize: 11, color: '#ff9800', textAlign: 'center', marginTop: 8 }}>
              Revision {evaluations.filter(e => e.status === 'rejected').length}/{job.maxRevisions || 2} — waiting for provider to resubmit
            </div>
          )}

          {/* Failed + refund info */}
          {job.status === 'failed' && (
            <div style={{ padding: 12, border: '1px solid #ff4444', marginTop: 12, textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: '#ff4444', fontWeight: 700 }}>JOB FAILED — All revisions exhausted</div>
              <div style={{ fontSize: 10, color: 'var(--dim)', marginTop: 4 }}>
                {job.refundTx ? (
                  <>Refunded · <a href={`https://testnet.arcscan.app/tx/${job.refundTx}`} target="_blank" rel="noopener noreferrer" style={{ color: '#4caf50', textDecoration: 'underline' }}>tx ↗</a></>
                ) : 'Refund will be processed after job expiry'}
              </div>
            </div>
          )}
          {job.status === 'refunded' && (
            <div style={{ padding: 12, border: '1px solid #4caf50', marginTop: 12, textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: '#4caf50', fontWeight: 700 }}>✓ REFUNDED</div>
              <div style={{ fontSize: 10, color: 'var(--dim)', marginTop: 4 }}>
                Funds returned to client
                {job.refundTx && (
                  <> · <a href={`https://testnet.arcscan.app/tx/${job.refundTx}`} target="_blank" rel="noopener noreferrer" style={{ color: '#4caf50', textDecoration: 'underline' }}>tx ↗</a></>
                )}
              </div>
            </div>
          )}

          {/* Inline error banner */}
          {actionError && (
            <div style={{ margin: '12px 0 0', padding: '12px 16px', background: '#1a0000', border: '1px solid #4a1111', fontSize: 12, color: '#ff6b6b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>⚠ {actionError}</span>
              <span onClick={() => setActionError(null)} style={{ cursor: 'pointer', opacity: 0.6 }}>✕</span>
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
  const doneStatuses = ['assigned', 'funded', 'in_progress', 'delivered', 'evaluating', 'revision_requested', 'completed', 'failed', 'refunded', 'expired']
  const fundedStatuses = ['funded', 'in_progress', 'delivered', 'evaluating', 'revision_requested', 'completed', 'failed', 'refunded', 'expired']
  const evalStatuses = ['evaluating', 'revision_requested', 'completed', 'failed', 'refunded']

  const steps = [
    { label: 'Posted', done: true, time: job.createdAt },
    { label: 'Agent Selected', done: doneStatuses.includes(job.status), detail: job.selectedApplicant ? `${job.selectedApplicant.slice(0, 8)}...` : undefined },
    { label: 'Funded', done: fundedStatuses.includes(job.status), time: job.fundedAt || undefined, detail: job.finalBudget ? `${job.finalBudget} USDC` : undefined },
    { label: 'Delivered', done: evalStatuses.includes(job.status) || job.status === 'delivered' },
    { label: 'Evaluating', done: evalStatuses.includes(job.status), detail: job.status === 'revision_requested' ? 'Revision requested' : job.status === 'evaluating' ? 'In progress...' : undefined },
    { label: job.status === 'failed' ? 'Failed' : job.status === 'refunded' ? 'Refunded' : job.status === 'expired' ? 'Expired' : 'Completed', done: ['completed', 'failed', 'refunded', 'expired'].includes(job.status), time: job.completedAt || undefined },
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
    case 'expired': return '#666'
    case 'refunded': return '#4caf50'
    case 'failed': return '#ff4444'
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
