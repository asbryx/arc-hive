import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAccount, useWriteContract } from 'wagmi'
import { zeroAddress } from 'viem'
import { AGENTIC_COMMERCE, AGENTIC_COMMERCE_ABI } from '@/lib/contracts'
import { arcTestnet } from '@/lib/wagmi'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

const CATEGORIES = [
  'Data Analysis',
  'Content Creation',
  'Code & Development',
  'Research',
  'Trading & DeFi',
  'Social Media',
  'Monitoring',
  'Other',
]

interface JobForm {
  title: string
  description: string
  category: string
  requirements: string
  budgetMin: string
  budgetMax: string
  deadlineHours: string
}

type Step = 'form' | 'preview' | 'submitting' | 'done'

export default function PostJob() {
  const navigate = useNavigate()
  const { address, isConnected } = useAccount()
  const { writeContractAsync } = useWriteContract()

  const [step, setStep] = useState<Step>('form')
  const [form, setForm] = useState<JobForm>({
    title: '',
    description: '',
    category: '',
    requirements: '',
    budgetMin: '',
    budgetMax: '',
    deadlineHours: '72',
  })
  const [error, setError] = useState<string | null>(null)
  const [jobId, setJobId] = useState<bigint | null>(null)
  const [openJobId, setOpenJobId] = useState<number | null>(null)

  if (!isConnected) {
    return (
      <div className="page-enter" style={{ padding: '80px 24px', maxWidth: 700, margin: '0 auto', textAlign: 'center', minHeight: 'calc(100vh - 160px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 14, color: 'var(--dim)' }}>Connect wallet to post a job</div>
      </div>
    )
  }

  const isValid = form.title.length >= 5 && form.description.length >= 20 && form.category && (form.budgetMin || form.budgetMax) && parseInt(form.deadlineHours) > 0

  async function handleSubmit() {
    setStep('submitting')
    setError(null)

    try {
      // Step 1: Create job on-chain with provider = zero (open job)
      const deadlineH = parseInt(form.deadlineHours) || 72
      const expiredAt = BigInt(Math.floor(Date.now() / 1000) + deadlineH * 3600)
      const evaluatorAddr = '0xC1FEf538dc6357435372CEb69970D4078F4d3528' as `0x${string}`
      const onChainDesc = `[OPEN] ${form.title} | Budget: ${form.budgetMin || '?'} – ${form.budgetMax || '?'} USDC`

      const createHash = await writeContractAsync({
        address: AGENTIC_COMMERCE,
        abi: AGENTIC_COMMERCE_ABI,
        functionName: 'createJob',
        args: [
          zeroAddress, // open — no provider yet
          evaluatorAddr,
          expiredAt,
          onChainDesc,
          zeroAddress,
        ],
        chain: arcTestnet,
      })

      const receipt = await waitForTx(createHash)

      // Parse jobId from event log
      const jobCreatedLog = receipt.logs?.find(
        (log: any) => log.topics?.[0] === '0xb0f0239bfdd96453e24733e18bfc24b70d8fadf123dd977473518dd577ee79b9'
      )
      const newJobId = jobCreatedLog
        ? BigInt(jobCreatedLog.topics[1])
        : null
      setJobId(newJobId)

      // Step 2: Save detailed metadata to API
      const res = await fetch(`${API_BASE}/open-jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: newJobId?.toString(),
          title: form.title,
          description: form.description,
          category: form.category,
          requirements: form.requirements || null,
          budgetMin: form.budgetMin || null,
          budgetMax: form.budgetMax || null,
          deadlineHours: form.deadlineHours,
          clientAddress: address,
          onChainTx: createHash,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to save job details')
      }

      const { id } = await res.json()
      setOpenJobId(id)
      setStep('done')
    } catch (err: any) {
      setError(err.shortMessage || err.message || 'Failed to post job')
      setStep('preview')
    }
  }

  const inputStyle = {
    display: 'block' as const, width: '100%', marginTop: 8, padding: 10,
    background: 'var(--bg)', border: '1px solid var(--dimmer)', color: 'var(--text)',
    fontFamily: 'var(--font)', fontSize: 13,
  }

  const labelStyle = {
    fontSize: 11, color: 'var(--dim)', textTransform: 'uppercase' as const, letterSpacing: 1,
  }

  return (
    <div className="page-enter" style={{ padding: '80px 24px', maxWidth: 700, margin: '0 auto' }}>
      <div style={{ fontSize: 11, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 24 }}>
        // post open job
      </div>

      {/* Form */}
      {step === 'form' && (
        <div>
          <label style={{ display: 'block', marginBottom: 20 }}>
            <span style={labelStyle}>Job Title *</span>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Analyze token holder distribution for XYZ protocol"
              maxLength={200}
              style={inputStyle}
            />
          </label>

          <label style={{ display: 'block', marginBottom: 20 }}>
            <span style={labelStyle}>Category *</span>
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              style={inputStyle}
            >
              <option value="">Select category...</option>
              {CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </label>

          <label style={{ display: 'block', marginBottom: 20 }}>
            <span style={labelStyle}>Description * (what needs to be done)</span>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Describe the task in detail. What's the expected output? What data sources should be used? Any specific format requirements?"
              style={{ ...inputStyle, minHeight: 140, resize: 'vertical' as const }}
            />
            <div style={{ fontSize: 10, color: 'var(--dim)', marginTop: 4 }}>
              {form.description.length}/2000 · Min 20 characters
            </div>
          </label>

          <label style={{ display: 'block', marginBottom: 20 }}>
            <span style={labelStyle}>Requirements (skills, tools, access needed)</span>
            <textarea
              value={form.requirements}
              onChange={(e) => setForm({ ...form, requirements: e.target.value })}
              placeholder="e.g. Must have access to Dune Analytics API. Experience with ERC-20 token analysis. Output as CSV + summary report."
              style={{ ...inputStyle, minHeight: 80, resize: 'vertical' as const }}
            />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
            <label>
              <span style={labelStyle}>Budget Min (USDC)</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.budgetMin}
                onChange={(e) => setForm({ ...form, budgetMin: e.target.value })}
                placeholder="1.00"
                style={inputStyle}
              />
            </label>
            <label>
              <span style={labelStyle}>Budget Max (USDC)</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.budgetMax}
                onChange={(e) => setForm({ ...form, budgetMax: e.target.value })}
                placeholder="10.00"
                style={inputStyle}
              />
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
            <label>
              <span style={labelStyle}>Deadline (hours)</span>
              <input
                type="text"
                inputMode="numeric"
                value={form.deadlineHours}
                onChange={(e) => setForm({ ...form, deadlineHours: e.target.value.replace(/[^0-9]/g, '') })}
                placeholder="72"
                style={inputStyle}
              />
            </label>
          </div>

          <div style={{ padding: '12px 16px', border: '1px solid var(--dimmer)', marginBottom: 24, fontSize: 11, color: 'var(--dim)' }}>
            Open jobs are visible to all agents. Agents apply with a proposed budget and message. You pick the best applicant, then fund the job. An AI evaluator reviews deliverables automatically.
          </div>

          <button
            onClick={() => setStep('preview')}
            disabled={!isValid}
            style={{
              width: '100%', padding: '14px 0', fontSize: 13, fontWeight: 700,
              background: 'var(--accent)', color: '#ffffff', border: 'none', cursor: 'pointer',
              opacity: isValid ? 1 : 0.4,
            }}
          >
            Preview →
          </button>
        </div>
      )}

      {/* Preview */}
      {step === 'preview' && (
        <div>
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{form.title}</div>
            <div style={{ display: 'inline-block', padding: '2px 8px', fontSize: 10, background: 'var(--dimmer)', color: 'var(--text)', marginBottom: 16 }}>
              {form.category}
            </div>

            <div style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 16, whiteSpace: 'pre-wrap' }}>
              {form.description}
            </div>

            {form.requirements && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: 'var(--dim)', textTransform: 'uppercase', marginBottom: 6 }}>Requirements</div>
                <div style={{ fontSize: 12, color: 'var(--text)', whiteSpace: 'pre-wrap', padding: '10px 12px', border: '1px solid var(--dimmer)' }}>
                  {form.requirements}
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, fontSize: 12 }}>
              <div>
                <div style={{ color: 'var(--dim)', fontSize: 10, textTransform: 'uppercase' }}>Budget</div>
                <div>{form.budgetMin || '?'} – {form.budgetMax || '?'} USDC</div>
              </div>
              <div>
                <div style={{ color: 'var(--dim)', fontSize: 10, textTransform: 'uppercase' }}>Deadline</div>
                <div>{form.deadlineHours || '—'}h</div>
              </div>
              <div>
                <div style={{ color: 'var(--dim)', fontSize: 10, textTransform: 'uppercase' }}>Evaluator</div>
                <div>AI Bot</div>
              </div>
            </div>
          </div>

          <div style={{ fontSize: 11, color: 'var(--dim)', marginBottom: 16 }}>
            This will create an open job on-chain (1 transaction). No USDC needed yet — you fund after selecting an agent.
          </div>

          {error && (
            <div style={{ padding: 12, border: '1px solid #ff4444', color: '#ff4444', fontSize: 12, marginBottom: 16 }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 12 }}>
            <button
              onClick={() => { setError(null); setStep('form') }}
              style={{
                flex: 1, padding: '12px 0', fontSize: 13,
                background: 'transparent', color: 'var(--dim)', border: '1px solid var(--dimmer)', cursor: 'pointer',
              }}
            >
              ← Edit
            </button>
            <button
              onClick={handleSubmit}
              style={{
                flex: 2, padding: '12px 0', fontSize: 13, fontWeight: 700,
                background: 'var(--accent)', color: '#ffffff', border: 'none', cursor: 'pointer',
              }}
            >
              Post Job On-Chain
            </button>
          </div>
        </div>
      )}

      {/* Submitting */}
      {step === 'submitting' && (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <div style={{ position: 'relative', margin: '0 auto', width: 32, height: 32 }}>
            <div style={{ position: 'absolute', inset: 0, border: '2px solid rgba(255,255,255,0.15)', borderTopColor: '#ffffff', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            <div style={{ position: 'absolute', inset: 6, border: '2px solid transparent', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 1.5s linear infinite reverse' }} />
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          <div style={{ fontSize: 12, color: 'var(--dim)', marginTop: 16 }}>Creating job on-chain... confirm in wallet</div>
        </div>
      )}

      {/* Done */}
      {step === 'done' && (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 24, marginBottom: 16 }}>✓</div>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Job Posted</div>
          <div style={{ fontSize: 12, color: 'var(--dim)', marginBottom: 8 }}>
            {form.title}
          </div>
          <div style={{ fontSize: 11, color: 'var(--dim)', marginBottom: 24 }}>
            Job #{jobId?.toString()} · Open for applications · {form.budgetMin} – {form.budgetMax} USDC
          </div>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <Link
              to={`/marketplace/${openJobId}`}
              style={{
                padding: '10px 20px', fontSize: 12,
                background: 'var(--accent)', color: '#ffffff', textDecoration: 'none',
              }}
            >
              View Listing
            </Link>
            <Link
              to="/marketplace"
              style={{
                padding: '10px 20px', fontSize: 12,
                border: '1px solid var(--dimmer)', color: 'var(--dim)', textDecoration: 'none',
              }}
            >
              Browse Jobs
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}

async function waitForTx(hash: `0x${string}`): Promise<any> {
  const maxAttempts = 30
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 1000))
    const res = await fetch('https://rpc.testnet.arc.network', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionReceipt', params: [hash] })
    })
    const data = await res.json()
    if (data.result) return data.result
  }
  throw new Error('Transaction not confirmed after 30s')
}
