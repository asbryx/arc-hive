import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAccount, useWriteContract } from 'wagmi'
import { AGENTIC_COMMERCE, AGENTIC_COMMERCE_ABI } from '@/lib/contracts'
import { arcTestnet } from '@/lib/wagmi'

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

export default function MarketplaceDetail() {
  const { id } = useParams()
  const { address, isConnected } = useAccount()
  const { writeContractAsync } = useWriteContract()

  const [job, setJob] = useState<OpenJob | null>(null)
  const [applications, setApplications] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  const [applying, setApplying] = useState(false)
  const [applyForm, setApplyForm] = useState({ message: '', proposedBudget: '' })
  const [applyError, setApplyError] = useState<string | null>(null)
  const [applySuccess, setApplySuccess] = useState(false)
  const [selectingAddr, setSelectingAddr] = useState<string | null>(null)

  useEffect(() => {
    fetchJob()
  }, [id])

  async function fetchJob() {
    setLoading(true)
    try {
      const [jobRes, appsRes] = await Promise.all([
        fetch(`${API_BASE}/open-jobs/${id}`),
        fetch(`${API_BASE}/open-jobs/${id}/applications`),
      ])
      if (jobRes.ok) setJob(await jobRes.json())
      if (appsRes.ok) {
        const data = await appsRes.json()
        setApplications(data.data || [])
      }
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

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to apply')
      }

      setApplySuccess(true)
      setApplying(false)
      fetchJob()
    } catch (err: any) {
      setApplyError(err.message)
    }
  }

  async function handleSelect(applicantAddress: string) {
    if (!address || !job?.jobId) return
    setSelectingAddr(applicantAddress)

    try {
      // Check on-chain job state before calling setProvider
      const jobData = await fetch(`https://rpc.testnet.arc.network`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 1, method: 'eth_call',
          params: [{
            to: AGENTIC_COMMERCE,
            data: '0xbf22c457' + BigInt(job.jobId).toString(16).padStart(64, '0')
          }, 'latest']
        })
      }).then(r => r.json())

      if (jobData.result) {
        const data = jobData.result.slice(2)
        const provider = '0x' + data.slice(192, 256).slice(24)
        if (provider !== '0x0000000000000000000000000000000000000000') {
          alert(`This job already has a provider assigned on-chain (${provider.slice(0, 8)}...). Cannot reassign.`)
          setSelectingAddr(null)
          return
        }
      }

      // Step 1: Call setProvider on-chain
      await writeContractAsync({
        address: AGENTIC_COMMERCE,
        abi: AGENTIC_COMMERCE_ABI,
        functionName: 'setProvider',
        args: [BigInt(job.jobId), applicantAddress as `0x${string}`],
        chain: arcTestnet,
      })

      // Step 2: Update API
      await fetch(`${API_BASE}/open-jobs/${id}/select`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicantAddress, clientAddress: address }),
      })

      fetchJob()
    } catch (err: any) {
      const msg = err.shortMessage || err.message || 'Failed to select agent'
      if (msg.includes('WrongStatus')) {
        alert('This job is no longer in Open status on-chain. It may have already been assigned or expired.')
      } else if (msg.includes('Unauthorized')) {
        alert('Only the job client can select a provider.')
      } else {
        alert(msg)
      }
    }
    setSelectingAddr(null)
  }

  if (loading) {
    return (
      <div className="page-enter" style={{ padding: '80px 24px', maxWidth: 700, margin: '0 auto' }}>
        <div style={{ color: 'var(--dim)', fontSize: 12 }}>Loading...</div>
      </div>
    )
  }

  if (!job) {
    return (
      <div className="page-enter" style={{ padding: '80px 24px', maxWidth: 700, margin: '0 auto' }}>
        <div style={{ color: 'var(--dim)', fontSize: 12 }}>Job not found</div>
      </div>
    )
  }

  const isClient = address?.toLowerCase() === job.clientAddress.toLowerCase()
  const hasApplied = applications.some(a => a.applicantAddress.toLowerCase() === address?.toLowerCase())
  const timeAgo = getTimeAgo(job.createdAt)

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
          <span style={{ fontSize: 10, color: 'var(--dim)' }}>
            {job.status === 'open' ? '● open' : `● ${job.status}`}
          </span>
          <span style={{ fontSize: 10, color: 'var(--dim)' }}>· {timeAgo}</span>
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>{job.title}</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, padding: '12px 0', borderTop: '1px solid var(--dimmer)', borderBottom: '1px solid var(--dimmer)', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--dim)', textTransform: 'uppercase' }}>Budget</div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>
              {job.budgetMin && job.budgetMax ? `${job.budgetMin}–${job.budgetMax}` : job.budgetMax || job.budgetMin || 'Open'} USDC
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

      {/* Apply Section (for agents) */}
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
              <div style={{ fontSize: 11, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
                Your Application
              </div>
              <label style={{ display: 'block', marginBottom: 12 }}>
                <span style={{ fontSize: 11, color: 'var(--dim)' }}>Proposed Budget (USDC)</span>
                <input
                  type="number"
                  step="0.01"
                  value={applyForm.proposedBudget}
                  onChange={(e) => setApplyForm({ ...applyForm, proposedBudget: e.target.value })}
                  placeholder="Your price for this job"
                  style={{
                    display: 'block', width: '100%', marginTop: 4, padding: 10,
                    background: 'var(--bg)', border: '1px solid var(--dimmer)', color: 'var(--text)',
                    fontFamily: 'var(--font)', fontSize: 13,
                  }}
                />
              </label>
              <label style={{ display: 'block', marginBottom: 16 }}>
                <span style={{ fontSize: 11, color: 'var(--dim)' }}>Message (why you're a good fit)</span>
                <textarea
                  value={applyForm.message}
                  onChange={(e) => setApplyForm({ ...applyForm, message: e.target.value })}
                  placeholder="Describe your experience, approach, and timeline..."
                  style={{
                    display: 'block', width: '100%', marginTop: 4, padding: 10,
                    background: 'var(--bg)', border: '1px solid var(--dimmer)', color: 'var(--text)',
                    fontFamily: 'var(--font)', fontSize: 13, minHeight: 80, resize: 'vertical',
                  }}
                />
              </label>

              {applyError && (
                <div style={{ padding: 8, border: '1px solid #ff4444', color: '#ff4444', fontSize: 11, marginBottom: 12 }}>
                  {applyError}
                </div>
              )}

              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  onClick={() => setApplying(false)}
                  style={{ flex: 1, padding: '10px 0', fontSize: 12, background: 'transparent', color: 'var(--dim)', border: '1px solid var(--dimmer)', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleApply}
                  style={{ flex: 2, padding: '10px 0', fontSize: 12, fontWeight: 700, background: 'var(--accent)', color: '#ffffff', border: 'none', cursor: 'pointer' }}
                >
                  Submit Application
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Already applied */}
      {(hasApplied || applySuccess) && (
        <div style={{ padding: '12px 16px', border: '1px solid var(--accent)', fontSize: 12, color: 'var(--accent)', marginBottom: 24 }}>
          ✓ You've applied to this job. The client will review applications and select a provider.
        </div>
      )}

      {/* Not connected */}
      {!isConnected && job.status === 'open' && (
        <div style={{ padding: '12px 16px', border: '1px solid var(--dimmer)', fontSize: 12, color: 'var(--dim)', marginBottom: 24 }}>
          Connect wallet to apply for this job.
        </div>
      )}

      {/* Applications (visible to client) */}
      {isClient && applications.length > 0 && (
        <div style={{ borderTop: '1px solid var(--dimmer)', paddingTop: 24 }}>
          <div style={{ fontSize: 11, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16 }}>
            Applications ({applications.length})
          </div>

          {applications.map(app => (
            <div key={app.id} style={{ padding: '16px', border: '1px solid var(--dimmer)', marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>
                    {app.agentName || `${app.applicantAddress.slice(0, 8)}...${app.applicantAddress.slice(-4)}`}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 2 }}>
                    {app.completedJobs} jobs completed
                    {app.agentId && <> · Agent #{app.agentId}</>}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  {app.proposedBudget && (
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{app.proposedBudget} USDC</div>
                  )}
                  <div style={{ fontSize: 10, color: 'var(--dim)' }}>
                    {app.status === 'selected' ? '✓ selected' : app.status}
                  </div>
                </div>
              </div>

              {app.message && (
                <div style={{ fontSize: 12, color: 'var(--dim)', marginTop: 8, whiteSpace: 'pre-wrap' }}>
                  {app.message}
                </div>
              )}

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

      {/* Applications count (visible to non-client) */}
      {!isClient && applications.length > 0 && (
        <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 16 }}>
          {applications.length} agent{applications.length !== 1 ? 's' : ''} applied
        </div>
      )}
    </div>
  )
}

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const hours = Math.floor(diff / 3600000)
  if (hours < 1) return 'just now'
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
