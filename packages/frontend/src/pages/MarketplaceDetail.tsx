import { authFetch } from '@/api/client'
import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAccount, useWaitForTransactionReceipt } from 'wagmi'
import { useGuardedWriteContract } from '@/hooks/useGuardedWriteContract'
import { readContract, waitForTransactionReceipt } from '@wagmi/core'
import { parseUnits } from 'viem'
import { AGENTIC_COMMERCE, AGENTIC_COMMERCE_ABI, USDC_ADDRESS, USDC_ABI } from '@/lib/contracts'
import { arcTestnet, config } from '@/lib/wagmi'
import { getSector } from '@/lib/sectors'
import { useAuth } from '@/contexts/AuthContext'
import { safeHref } from '@/utils/safeUrl'

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
  sectorConfig: { sector?: string; details?: Record<string, string> } | null
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

interface DeliverableFile {
  id: number
  filename: string
  fileType: string
  mimeType: string
  size: number
  hash: string
  version: number
  deliverableStatus: string
  expired: boolean
  expiresAt: string | null
  hoursUntilExpiry: number | null
  downloadable: boolean
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
  const { token, isAuthenticated } = useAuth()
  // Audit fix T7: refuses to broadcast on-chain tx while backend is offline
  const { writeContractAsync } = useGuardedWriteContract()

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
  const [deliverFiles, setDeliverFiles] = useState<File[]>([])
  const [deliverError, setDeliverError] = useState<string | null>(null)
  const [completing, setCompleting] = useState(false)
  const [submittingOnChain, setSubmittingOnChain] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [commentText, setCommentText] = useState('')
  const [postingComment, setPostingComment] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [evaluations, setEvaluations] = useState<Evaluation[]>([])
  const [files, setFiles] = useState<DeliverableFile[]>([])
  const [downloadingFileId, setDownloadingFileId] = useState<number | null>(null)

  // Re-fetch when the SIWE token lands (`token`). Without this, the first
  // mount fires before AuthContext finishes signing — applications/deliverables
  // /files all 401 because authFetch has no JWT yet, and the result is the
  // 'Select Agent' / 'Fund' / 'Deliver' UI silently failing to render. Once
  // the JWT is stored, re-fetch so private endpoints succeed.
  useEffect(() => { fetchJob() }, [id, token])

  async function fetchJob() {
    setLoading(true)
    try {
      const [jobRes, appsRes, delRes, commRes, evalRes, filesRes] = await Promise.all([
        fetch(`${API_BASE}/open-jobs/${id}`),
        // Applications + deliverables both require auth — without the JWT
        // they 401 and the page silently renders without applicants or
        // contents, hiding the "Select agent" / "Fund" controls from
        // the client. (Bug fixed 2026-06-15.)
        authFetch(`/open-jobs/${id}/applications`),
        authFetch(`/open-jobs/${id}/deliverables`),
        authFetch(`/open-jobs/${id}/comments`),
        fetch(`${API_BASE}/open-jobs/${id}/evaluations`),
        authFetch(`/open-jobs/${id}/files`),
      ])
      const jobData = jobRes.ok ? await jobRes.json() : null
      if (jobData) setJob(jobData)
      if (appsRes.ok) { const data = await appsRes.json(); setApplications(data.data || []) }
      if (delRes.ok) { const data = await delRes.json(); setDeliverables(data.data || []) }
      if (commRes.ok) { const data = await commRes.json(); setComments(data.data || []) }
      if (evalRes.ok) { const data = await evalRes.json(); setEvaluations(data.data || []) }
      if (filesRes.ok) { const data = await filesRes.json(); setFiles(data.data || []) }
    } catch {}
    setLoading(false)
  }

  async function handleApply() {
    if (!address) return
    setApplyError(null)
    try {
      const res = await authFetch(`/open-jobs/${id}/apply`, {
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
        await authFetch(`/open-jobs/${id}/link-chain`, {
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
      const PLATFORM_PROVIDER = '0xDd03A2eEA57E2e10B05bF65515E1ebF2c753d7d5' as `0x${string}`
      const setProviderTx = await writeContractAsync({
        address: AGENTIC_COMMERCE,
        abi: AGENTIC_COMMERCE_ABI,
        functionName: 'setProvider',
        args: [onchainJobId!, PLATFORM_PROVIDER],
        chain: arcTestnet,
      })
      await waitForTransactionReceipt(config, { hash: setProviderTx, confirmations: 1 })

      await authFetch(`/open-jobs/${id}/select`, {
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

      // Step 0: if job doesn't exist on-chain (id=0), create it first
      // (contract may have been redeployed, or job was DB-only)
      const PLATFORM_PROVIDER = '0xDd03A2eEA57E2e10B05bF65515E1ebF2c753d7d5' as `0x${string}`
      const EVALUATOR = '0xC1FEf538dc6357435372CEb69970D4078F4d3528' as `0x${string}`
      let actualJobId = jobIdBig

      if (onchainJob.id === 0n) {
        setFundStep('Creating job on-chain...')
        const deadlineSec = (job.deadlineHours || 72) * 3600
        const expiredAt = BigInt(Math.floor(Date.now() / 1000) + deadlineSec)
        const description = `${job.title} — ${(job.description || '').slice(0, 200)}`
        const createTx = await writeContractAsync({
          address: AGENTIC_COMMERCE,
          abi: AGENTIC_COMMERCE_ABI,
          functionName: 'createJob',
          args: [PLATFORM_PROVIDER, EVALUATOR, expiredAt, description, '0x0000000000000000000000000000000000000000' as `0x${string}`],
          chain: arcTestnet,
        })
        const createReceipt = await waitForTransactionReceipt(config, { hash: createTx })
        if (createReceipt.status !== 'success') {
          setActionError('Failed to create job on-chain. Try again.')
          setFunding(false); setFundStep(''); return
        }
        // Extract on-chain job ID from JobCreated event (topics[1])
        actualJobId = 0n
        const jobCreatedTopic = '0xb0f0239bfdd96453e24733e18bfc24b70d8fadf123dd977473518dd577ee79b9'
        for (const log of createReceipt.logs) {
          if (log.address.toLowerCase() === AGENTIC_COMMERCE.toLowerCase() && log.topics[0] === jobCreatedTopic) {
            actualJobId = BigInt(log.topics[1]!)
            break
          }
        }
        if (actualJobId === 0n) {
          setActionError('Job created but could not find on-chain ID. Try again.')
          setFunding(false); setFundStep(''); return
        }
      }

      // Step 1: setProvider if provider is still zero on-chain (only if not just created)
      if (onchainJob.provider === '0x0000000000000000000000000000000000000000') {
        setFundStep('Setting provider on-chain...')
        const setProvTx = await writeContractAsync({
          address: AGENTIC_COMMERCE,
          abi: AGENTIC_COMMERCE_ABI,
          functionName: 'setProvider',
          args: [actualJobId, PLATFORM_PROVIDER],
          chain: arcTestnet,
        })
        const setProvReceipt = await waitForTransactionReceipt(config, { hash: setProvTx })
        if (setProvReceipt.status !== 'success') {
          setActionError('Failed to set provider on-chain. Try again.')
          setFunding(false); setFundStep(''); return
        }
      }

      // Step 2: setBudget — must be called by provider, so ask API backend to do it
      // (re-read onchain state with actualJobId in case we just created the job)
      const currentOnchainJob = await readContract(config, {
        address: AGENTIC_COMMERCE,
        abi: AGENTIC_COMMERCE_ABI,
        functionName: 'getJob',
        args: [actualJobId],
      })
      if (currentOnchainJob.budget === 0n) {
        setFundStep('Setting budget...')
        const setBudgetRes = await authFetch(`/open-jobs/${id}/set-budget`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ budget: budgetStr, clientAddress: address, onchainJobId: actualJobId.toString() }),
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
          args: [actualJobId],
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
        args: [actualJobId, '0x'],
        chain: arcTestnet,
      })
      const fundReceipt = await waitForTransactionReceipt(config, { hash: fundTx })
      if (fundReceipt.status !== 'success') {
        setActionError('Funding failed on-chain. USDC was approved but not transferred. Try again.')
        setFunding(false); setFundStep(''); return
      }

      // Step 5: Only update API after all txs confirmed
      setFundStep('Confirming...')
      await authFetch(`/open-jobs/${id}/fund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientAddress: address,
          onchainJobId: actualJobId.toString(),
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
    if (!address || (!deliverForm.content && deliverFiles.length === 0)) return
    setDeliverError(null)
    try {
      let res: Response
      if (deliverFiles.length > 0) {
        // Multipart form data with files
        const formData = new FormData()
        formData.append('applicantAddress', address)
        if (deliverForm.content) formData.append('content', deliverForm.content)
        if (deliverForm.link) formData.append('link', deliverForm.link)
        if (deliverForm.notes) formData.append('notes', deliverForm.notes)
        for (const file of deliverFiles) {
          formData.append('files', file)
        }
        res = await authFetch(`/open-jobs/${id}/deliver`, {
          method: 'POST',
          body: formData,
        })
      } else {
        // Backward compatible JSON mode (no files)
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
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Failed to submit') }
      setDelivering(false)
      setDeliverForm({ content: '', link: '', notes: '' })
      setDeliverFiles([])
      fetchJob()
    } catch (err: any) { setDeliverError(err.message) }
  }

  async function handleDownloadFile(fileId: number, filename: string) {
    if (!address) return
    setDownloadingFileId(fileId)
    try {
      const res = await authFetch(`/open-jobs/${id}/files/${fileId}/download`)
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Download failed')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err: any) {
      alert(err.message)
    }
    setDownloadingFileId(null)
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
      await authFetch(`/open-jobs/${id}/complete`, {
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
      if (Number(onchainJob.status) === 1) {
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
      } else if (Number(onchainJob.status) === 3) {
        setActionError('This job is already completed on-chain.')
        setCompleting(false)
        return
      } else if (Number(onchainJob.status) !== 2) {
        const statusNames = ['Open', 'Funded', 'Submitted', 'Completed', 'Rejected', 'Expired']
        setActionError('Job is not ready to be approved yet. Current state: ' + (statusNames[Number(onchainJob.status)] ?? 'Unknown'))
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
      await authFetch(`/open-jobs/${id}/complete`, {
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
      await authFetch(`/open-jobs/${id}/reject`, {
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
      await authFetch(`/open-jobs/${id}/comments`, {
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
        ← Back to Marketplace
      </Link>


      {/* Job Header */}
      <div style={{ marginTop: 20, marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
          {job.category && (() => {
            const sector = getSector(job.category)
            const displayName = job.category === 'Other' && job.sectorConfig?.details?.sectorLabel
              ? job.sectorConfig.details.sectorLabel
              : job.category
            return (
              <span style={{ padding: '2px 8px', fontSize: 10, background: 'var(--dimmer)', color: 'var(--text)' }}>
                {sector?.icon ? `${sector.icon} ` : ''}{displayName}
              </span>
            )
          })()}
          <span style={{ fontSize: 10, color: statusColor(job.status) }}>● {job.status.charAt(0).toUpperCase() + job.status.slice(1).replace(/_/g, ' ')}</span>
          <span style={{ fontSize: 10, color: 'var(--dim)' }}>· {timeAgo}</span>
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>{job.title}</div>

        {/* Sector deliverable hint */}
        {job.category && (() => {
          const sector = getSector(job.category)
          const customHint = job.sectorConfig?.details?.deliverableFormat
            ? `Expected: ${job.sectorConfig.details.deliverableFormat}`
            : null
          const hint = customHint || sector?.deliverableHint
          if (!hint) return null
          return (
            <div style={{ fontSize: 11, color: 'var(--dim)', marginBottom: 12, padding: '6px 10px', border: '1px solid var(--dimmer)', display: 'inline-block' }}>
              {hint}
            </div>
          )
        })()}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, padding: '12px 0', borderTop: '1px solid var(--dimmer)', borderBottom: '1px solid var(--dimmer)', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--dim)', textTransform: 'uppercase' }}>Budget</div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>
              {job.finalBudget ? `${job.finalBudget} USDC` : job.budgetMin && job.budgetMax ? `${job.budgetMin} – ${job.budgetMax} USDC` : `${job.budgetMax || job.budgetMin || 'Open'} USDC`}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--dim)', textTransform: 'uppercase' }}>Deadline</div>
            <DeadlineCountdown fundedAt={job.fundedAt} createdAt={job.createdAt} deadlineHours={job.deadlineHours} status={job.status} />
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

      {/* Sector Details */}
      {job.sectorConfig?.details && Object.keys(job.sectorConfig.details).length > 0 && (() => {
        const sector = getSector(job.category || '')
        if (!sector) return null
        return (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>{sector.label} details</div>
            <div style={{ fontSize: 12, lineHeight: 1.6, padding: '12px 16px', border: '1px solid var(--dimmer)' }}>
              {Object.entries(job.sectorConfig.details).map(([key, value]) => {
                const field = sector.detailFields.find(f => f.key === key)
                return (
                  <div key={key} style={{ marginBottom: 4 }}>
                    <span style={{ color: 'var(--dim)', fontSize: 10, textTransform: 'uppercase' }}>{field?.label || key}: </span>
                    <span>{value}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

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
        {job.onChainTx && <> · <a href={`https://testnet.arcscan.app/tx/${job.onChainTx}`} target="_blank" style={{ color: 'var(--accent)' }}>On-chain ↗</a></>}
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
              <label style={{ display: 'block', marginBottom: 12 }}>
                <span style={{ fontSize: 11, color: 'var(--dim)' }}>Attach Files (optional)</span>
                <input
                  type="file"
                  multiple
                  onChange={(e) => {
                    const files = e.target.files ? Array.from(e.target.files) : []
                    setDeliverFiles(files)
                  }}
                  style={{
                    display: 'block', width: '100%', marginTop: 4, padding: 10,
                    background: 'var(--bg)', border: '1px solid var(--dimmer)', color: 'var(--text)',
                    fontFamily: 'var(--font)', fontSize: 12,
                  }}
                />
                {deliverFiles.length > 0 && (
                  <div style={{ marginTop: 6, fontSize: 11, color: 'var(--dim)' }}>
                    {deliverFiles.map((f, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <span>📄 {f.name}</span>
                        <span style={{ color: 'var(--dimmer)' }}>({(f.size / 1024).toFixed(1)} KB)</span>
                        <button
                          onClick={() => setDeliverFiles(files => files.filter((_, idx) => idx !== i))}
                          style={{ background: 'none', border: 'none', color: '#ff4444', cursor: 'pointer', fontSize: 11, padding: 0 }}
                        >✕</button>
                      </div>
                    ))}
                  </div>
                )}
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
                      {d.status === 'approved' ? '✓ Approved' : d.status === 'revision_requested' ? '⚠️ Revision Requested' : d.status === 'failed' ? '✗ Failed' : '● Submitted'}
                    </span>
                  </div>
                  {d.content ? (
                    <>
                      <div style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap', marginBottom: 8 }}>{d.content}</div>
                      {(() => {
                        // Audit fix T4: deliverable.link is agent-controlled.
                        const dLink = safeHref(d.link)
                        if (!dLink) return null
                        return (
                          <a href={dLink} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: 'var(--accent)' }}>{dLink} ↗</a>
                        )
                      })()}
                      {d.notes && <div style={{ fontSize: 12, color: 'var(--dim)', marginTop: 8 }}>{d.notes}</div>}
                    </>
                  ) : (
                    <div style={{ fontSize: 12, color: 'var(--dim)', padding: '12px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 12, height: 12, border: '2px solid var(--dimmer)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                      Deliverable submitted — awaiting evaluation
                    </div>
                  )}
                  {/* Files for this deliverable version */}
                  {files.filter(f => f.version === d.version).length > 0 && (
                    <div style={{ marginTop: 12, padding: '10px 12px', border: '1px solid var(--dimmer)', background: 'var(--bg)' }}>
                      <div style={{ fontSize: 10, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                        📎 Files ({files.filter(f => f.version === d.version).length})
                      </div>
                      {files.filter(f => f.version === d.version).map(f => {
                        const isExpired = f.expired
                        const expiryLabel = f.hoursUntilExpiry !== null && !isExpired
                          ? `${Math.floor(f.hoursUntilExpiry)}h ${Math.round((f.hoursUntilExpiry % 1) * 60)}m left`
                          : isExpired ? 'Expired' : null
                        const fileIcon = f.fileType === 'code' ? '💻' : f.fileType === 'document' ? '📄' : f.fileType === 'data' ? '📊' : f.fileType === 'image' ? '🖼️' : '📁'
                        return (
                          <div key={f.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--dimmer)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                              <span>{fileIcon}</span>
                              <span style={{ fontSize: 12, color: isExpired ? 'var(--dimmer)' : 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {f.filename}
                              </span>
                              <span style={{ fontSize: 10, color: 'var(--dimmer)' }}>
                                {(f.size / 1024).toFixed(1)} KB
                              </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                              {expiryLabel && (
                                <span style={{ fontSize: 10, color: isExpired ? '#ff4444' : 'var(--dim)' }}>
                                  ⏱ {expiryLabel}
                                </span>
                              )}
                              {f.downloadable && !isExpired ? (
                                <button
                                  onClick={() => handleDownloadFile(f.id, f.filename)}
                                  disabled={downloadingFileId === f.id}
                                  style={{
                                    fontSize: 11, padding: '4px 10px', background: 'var(--accent)', color: '#fff',
                                    border: 'none', cursor: downloadingFileId === f.id ? 'wait' : 'pointer',
                                    opacity: downloadingFileId === f.id ? 0.5 : 1,
                                  }}
                                >
                                  {downloadingFileId === f.id ? '...' : '↓ Download'}
                                </button>
                              ) : isExpired ? (
                                <span style={{ fontSize: 10, color: '#ff4444' }}>Deleted</span>
                              ) : (
                                <span style={{ fontSize: 10, color: 'var(--dimmer)' }}>⏳ Pending approval</span>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
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
                          <span style={{ fontSize: 10, color: 'var(--dim)' }}>Evaluation</span>
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

          {/* Revision counter
              Audit T13 (2026-06-15): previously filtered only status==='rejected',
              ignoring pre-validation 'failed' evaluations. A job that hit preval
              fails for v2 and v3 would still display "Revision 1/2" even after
              all attempts were consumed. Now count ALL non-approved evaluations
              (rejected | failed) so the UI reflects what the agent actually used. */}
          {job.status === 'revision_requested' && (() => {
            const strikesUsed = evaluations.filter(e => e.status === 'rejected' || e.status === 'failed').length
            const maxStrikes = (job.maxRevisions || 2) + 1
            return (
              <div style={{ fontSize: 11, color: '#ff9800', textAlign: 'center', marginTop: 8 }}>
                Attempt {strikesUsed} of {maxStrikes} used — waiting for provider to resubmit
              </div>
            )
          })()}

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

      {/* ═══ Standalone Evaluations (when no deliverables loaded but evaluations exist) ═══ */}
      {deliverables.length === 0 && evaluations.length > 0 && (
        <div style={{ borderTop: '1px solid var(--dimmer)', paddingTop: 24, marginBottom: 24 }}>
          <div style={{ fontSize: 11, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16 }}>
            Evaluation
          </div>
          {evaluations.map(ev => {
            const scoreColor = ev.score >= 70 ? '#4caf50' : ev.score >= 50 ? '#ff9800' : '#ff4444'
            const statusLabel = ev.status === 'approved' ? '✓ APPROVED' : ev.status === 'failed' ? '✗ FAILED' : '↻ REVISION NEEDED'
            const evStatusColor = ev.status === 'approved' ? '#4caf50' : ev.status === 'failed' ? '#ff4444' : '#ff9800'
            return (
              <div key={ev.id} style={{ padding: 16, border: `1px solid ${evStatusColor}33`, background: `${evStatusColor}08`, marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 10, color: 'var(--dim)' }}>Evaluation v{ev.version}</span>
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
          })}
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
                    {app.completedJobs} Jobs completed{app.agentId && <> · Agent #{app.agentId}</>}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  {app.proposedBudget && <div style={{ fontSize: 13, fontWeight: 700 }}>{app.proposedBudget} USDC</div>}
                  <div style={{ fontSize: 10, color: app.status === 'selected' ? '#4caf50' : 'var(--dim)' }}>
                    {app.status === 'selected' ? '✓ Selected' : app.status}
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

      {/* ═══ Evaluator Results + Deliverables (all in one unified section) — already rendered above in "Deliverables & Evaluation" */}

      {/* On-chain settlement (completed) */}
      {job.status === 'completed' && (
        <div style={{ borderTop: '1px solid var(--dimmer)', paddingTop: 24, marginBottom: 24 }}>
          <div style={{ fontSize: 11, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>On-chain Settlement</div>
          <div style={{ fontSize: 12, lineHeight: 2 }}>
            {job.onchainJobId && <div>Job ID: #{job.onchainJobId} · <a href={`https://testnet.arcscan.app/tx/${job.fundedTx}`} target="_blank" style={{ color: 'var(--accent)' }}>Fund TX ↗</a></div>}
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

  // Determine current step index based on status
  function getCurrentStep(): number {
    switch (job.status) {
      case 'open': return 0
      case 'assigned': return 1
      case 'funded': return 2
      case 'in_progress': return 3
      case 'delivered': return 3
      case 'evaluating': return 4
      case 'revision_requested': return 4
      case 'completed':
      case 'failed':
      case 'refunded':
      case 'expired': return 5
      default: return 0
    }
  }

  const currentStep = getCurrentStep()

  const steps = [
    { label: 'Posted', done: true, time: job.createdAt },
    { label: 'Agent Selected', done: doneStatuses.includes(job.status), detail: job.selectedApplicant ? `${job.selectedApplicant.slice(0, 8)}...` : undefined },
    { label: 'Funded', done: fundedStatuses.includes(job.status), time: job.fundedAt || undefined, detail: job.finalBudget ? `${job.finalBudget} USDC` : undefined },
    {
      label: 'Delivered',
      done: evalStatuses.includes(job.status) || job.status === 'delivered',
      detail: job.status === 'evaluating' ? 'Delivering to evaluator...' : job.status === 'delivered' ? 'Delivered' : undefined,
    },
    {
      label: 'Evaluating',
      done: ['completed', 'failed', 'refunded'].includes(job.status),
      detail: job.status === 'revision_requested' ? 'Revision requested' : job.status === 'evaluating' ? 'Evaluating...' : undefined,
    },
    {
      label: job.status === 'failed' ? 'Failed' : job.status === 'refunded' ? 'Refunded' : job.status === 'expired' ? 'Expired' : 'Completed',
      done: ['completed', 'failed', 'refunded', 'expired'].includes(job.status),
      time: job.completedAt || job.refundedAt || undefined,
      detail: job.status === 'refunded' && job.refundTx ? `tx: ${job.refundTx.slice(0, 10)}...` : job.status === 'completed' && job.completedTx ? `tx: ${job.completedTx.slice(0, 10)}...` : undefined,
      txUrl: job.status === 'refunded' && job.refundTx ? `https://testnet.arcscan.app/tx/${job.refundTx}` : job.status === 'completed' && job.completedTx ? `https://testnet.arcscan.app/tx/${job.completedTx}` : undefined,
    },
  ]

  return (
    <div style={{ marginBottom: 24, padding: '16px 0' }}>
      {steps.map((step, i) => {
        const isActive = i === currentStep && !step.done
        const isDone = step.done
        const dotColor = isActive ? '#ffffff' : isDone ? 'var(--text)' : 'var(--dimmer)'
        const textColor = isActive ? '#ffffff' : isDone ? 'var(--text)' : 'var(--dim)'
        return (
          <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: i < steps.length - 1 ? 4 : 0 }}>
            <div style={{ width: 16, textAlign: 'center', fontSize: 11, lineHeight: '18px', color: dotColor }}>
              {isDone ? '●' : isActive ? '◉' : '○'}
            </div>
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: 12, color: textColor, fontWeight: isActive ? 700 : 400 }}>{step.label}</span>
              {step.detail && (
                <span style={{ fontSize: 11, color: isActive ? 'rgba(255,255,255,0.7)' : 'var(--dim)', marginLeft: 8 }}>
                  — {step.txUrl ? (
                    <a href={step.txUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>{step.detail} ↗</a>
                  ) : step.detail}
                </span>
              )}
              {step.time && <span style={{ fontSize: 10, color: 'var(--dim)', marginLeft: 8 }}>({getTimeAgo(step.time)})</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function statusColor(status: string): string {
  switch (status) {
    case 'open': return '#4a9ead'
    case 'assigned': return '#ff9800'
    case 'funded': return '#2196f3'
    case 'in_progress': return '#2196f3'
    case 'delivered': return '#9c27b0'
    case 'completed': return '#4caf50'
    case 'cancelled': return '#ff4444'
    case 'expired': return '#ff4444'
    case 'refunded': return '#4caf50'
    case 'failed': return '#ff4444'
    default: return 'var(--dim)'
  }
}

function DeadlineCountdown({ fundedAt, createdAt, deadlineHours, status }: { fundedAt: string | null; createdAt: string; deadlineHours: number; status: string }) {
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(interval)
  }, [])

  // Terminal statuses — deadline no longer relevant
  if (['completed', 'failed', 'refunded', 'expired', 'cancelled', 'rejected'].includes(status)) {
    return <div style={{ fontSize: 13, color: 'var(--dim)' }}>{deadlineHours}h (ended)</div>
  }

  // Calculate deadline from fundedAt (or createdAt if not funded yet)
  const startTime = fundedAt ? new Date(fundedAt).getTime() : new Date(createdAt).getTime()
  const deadlineMs = startTime + deadlineHours * 3600 * 1000
  const remaining = deadlineMs - now

  if (remaining <= 0) {
    return <div style={{ fontSize: 13, color: '#ff4444' }}>Deadline passed</div>
  }

  const totalMins = Math.floor(remaining / 60000)
  const hours = Math.floor(totalMins / 60)
  const mins = totalMins % 60

  const color = hours < 1 ? '#ff4444' : hours < 6 ? '#ff9800' : 'var(--text)'

  return (
    <div style={{ fontSize: 13, color }}>
      {hours > 0 && `${hours}h `}{mins}m Remaining
    </div>
  )
}

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
