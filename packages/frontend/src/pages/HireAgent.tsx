import { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAccount, useWriteContract } from 'wagmi'
import { parseUnits, zeroAddress } from 'viem'
import { useAgent } from '@/api/hooks'
import { AGENTIC_COMMERCE, USDC_ADDRESS, AGENTIC_COMMERCE_ABI, USDC_ABI } from '@/lib/contracts'
import { arcTestnet } from '@/lib/wagmi'

/**
 * Contract flow (verified on-chain):
 * 1. Client → createJob(provider, evaluator, expiredAt, description, hook)
 * 2. Provider → setBudget(jobId, amount, optParams)  ← provider must call this
 * 3. Client → approve USDC + fund(jobId, optParams)
 *
 * This page handles steps 1 and 3. Step 2 happens off-page (provider accepts).
 */

type Step = 'configure' | 'preview' | 'execute' | 'waiting' | 'fund' | 'funding' | 'confirm'

interface JobConfig {
  description: string
  budget: string
  deadline: number // hours from now
  evaluator: string // address or 'self'
}

export default function HireAgent() {
  const { id } = useParams()
  const { address, isConnected } = useAccount()
  const { data: agent } = useAgent(id!)

  const [step, setStep] = useState<Step>('configure')
  const [config, setConfig] = useState<JobConfig>({
    description: '',
    budget: '',
    deadline: 72,
    evaluator: 'self',
  })
  const [jobId, setJobId] = useState<bigint | null>(null)
  const [txStep, setTxStep] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [budgetSet, setBudgetSet] = useState(false)
  const [onChainBudget, setOnChainBudget] = useState<string | null>(null)

  const { writeContractAsync } = useWriteContract()

  // Poll for provider setBudget when in waiting state
  const pollBudget = useCallback(async () => {
    if (!jobId) return
    try {
      const res = await fetch('https://rpc.testnet.arc.network', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 1, method: 'eth_call',
          params: [{
            to: AGENTIC_COMMERCE,
            data: '0x5a3a05d9' + jobId.toString(16).padStart(64, '0') // jobHasBudget(uint256)
          }, 'latest']
        })
      })
      const data = await res.json()
      const hasBudget = data.result && BigInt(data.result) === 1n
      if (hasBudget) {
        // Read actual budget amount
        const jobRes = await fetch('https://rpc.testnet.arc.network', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0', id: 1, method: 'eth_call',
            params: [{
              to: AGENTIC_COMMERCE,
              data: '0x1e77b5c1' + jobId.toString(16).padStart(64, '0') // getJob(uint256)
            }, 'latest']
          })
        })
        const jobData = await jobRes.json()
        if (jobData.result) {
          // budget is at offset 5 (160 bytes = 320 hex chars from start of tuple data)
          // Tuple: id(32) + client(32) + provider(32) + evaluator(32) + description_offset(32) + budget(32)
          const budgetHex = jobData.result.slice(2 + 320, 2 + 384)
          const budgetRaw = BigInt('0x' + budgetHex)
          const budgetUsdc = Number(budgetRaw) / 1_000_000
          setOnChainBudget(budgetUsdc.toFixed(2))
        }
        setBudgetSet(true)
        setStep('fund')
      }
    } catch {
      // ignore polling errors
    }
  }, [jobId])

  useEffect(() => {
    if (step !== 'waiting') return
    const interval = setInterval(pollBudget, 3000)
    pollBudget() // immediate first check
    return () => clearInterval(interval)
  }, [step, pollBudget])

  if (!isConnected) {
    return (
      <div className="page-enter" style={{ padding: '80px 24px', maxWidth: 600, margin: '0 auto', textAlign: 'center', minHeight: 'calc(100vh - 160px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 14, color: 'var(--dim)', marginBottom: 16 }}>Connect wallet to hire an agent</div>
      </div>
    )
  }

  if (!agent) {
    return (
      <div className="page-enter" style={{ padding: '80px 24px', maxWidth: 600, margin: '0 auto' }}>
        <div style={{ color: 'var(--dim)' }}>Loading agent...</div>
      </div>
    )
  }

  const expiredAt = Math.floor(Date.now() / 1000) + config.deadline * 3600
  const evaluatorAddr = config.evaluator === 'self' ? address! : config.evaluator

  async function executeCreate() {
    setStep('execute')
    setError(null)
    setTxStep(0)

    try {
      // Step 1: createJob
      setTxStep(1)
      const createHash = await writeContractAsync({
        address: AGENTIC_COMMERCE,
        abi: AGENTIC_COMMERCE_ABI,
        functionName: 'createJob',
        args: [
          agent!.owner as `0x${string}`,
          evaluatorAddr as `0x${string}`,
          BigInt(expiredAt),
          config.description,
          zeroAddress,
        ],
        chain: arcTestnet,
      })

      const receipt = await waitForTx(createHash)

      // Parse jobId from JobCreated event log (topic[1] = jobId)
      // This is reliable even on busy chains (vs jobCounter race condition)
      const jobCreatedLog = receipt.logs?.find(
        (log: any) => log.topics?.[0] === '0xb0f0239bfdd96453e24733e18bfc24b70d8fadf123dd977473518dd577ee79b9'
      )
      const newJobId = jobCreatedLog
        ? BigInt(jobCreatedLog.topics[1])
        : await fetch('https://rpc.testnet.arc.network', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0', id: 1, method: 'eth_call',
              params: [{ to: AGENTIC_COMMERCE, data: '0x50355d76' }, 'latest']
            })
          }).then(r => r.json()).then(r => BigInt(r.result) - 1n)
      setJobId(newJobId)

      setStep('waiting')
    } catch (err: any) {
      setError(err.shortMessage || err.message || 'Transaction failed')
    }
  }

  async function executeFund() {
    setStep('funding')
    setError(null)
    setTxStep(0)

    try {
      const budgetAmount = onChainBudget
        ? parseUnits(onChainBudget, 6)
        : parseUnits(config.budget || '0', 6)

      // Step 1: approve USDC
      setTxStep(1)
      await writeContractAsync({
        address: USDC_ADDRESS,
        abi: USDC_ABI,
        functionName: 'approve',
        args: [AGENTIC_COMMERCE, budgetAmount],
        chain: arcTestnet,
      })

      // Step 2: fund
      setTxStep(2)
      await writeContractAsync({
        address: AGENTIC_COMMERCE,
        abi: AGENTIC_COMMERCE_ABI,
        functionName: 'fund',
        args: [jobId!, '0x'],
        chain: arcTestnet,
      })

      setStep('confirm')
    } catch (err: any) {
      setError(err.shortMessage || err.message || 'Transaction failed')
      setStep('fund')
    }
  }

  return (
    <div className="page-enter" style={{ padding: '80px 24px', maxWidth: 600, margin: '0 auto' }}>
      <div style={{ fontSize: 11, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 24 }}>
        // hire agent
      </div>

      {/* Agent info */}
      <div style={{ padding: '16px 0', borderBottom: '1px solid var(--dimmer)', marginBottom: 24 }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>{agent.name || `agent-${agent.agentId}`}</div>
        <div style={{ fontSize: 12, color: 'var(--dim)', marginTop: 4 }}>
          ID #{agent.agentId} · {agent.jobs.completed} jobs completed · score {agent.score.average?.toFixed(1) || '—'}
        </div>
      </div>

      {/* Step: Configure */}
      {step === 'configure' && (
        <div>
          <label style={{ display: 'block', marginBottom: 16 }}>
            <span style={{ fontSize: 11, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: 1 }}>Job Description</span>
            <textarea
              value={config.description}
              onChange={(e) => setConfig({ ...config, description: e.target.value })}
              placeholder="Describe what you need this agent to do..."
              style={{
                display: 'block', width: '100%', marginTop: 8, padding: 12,
                background: 'var(--bg)', border: '1px solid var(--dimmer)', color: 'var(--text)',
                fontFamily: 'var(--font)', fontSize: 13, minHeight: 100, resize: 'vertical',
              }}
            />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <label>
              <span style={{ fontSize: 11, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: 1 }}>Suggested Budget (USDC)</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={config.budget}
                onChange={(e) => setConfig({ ...config, budget: e.target.value })}
                placeholder="1.00"
                style={{
                  display: 'block', width: '100%', marginTop: 8, padding: 10,
                  background: 'var(--bg)', border: '1px solid var(--dimmer)', color: 'var(--text)',
                  fontFamily: 'var(--font)', fontSize: 13,
                }}
              />
            </label>

            <label>
              <span style={{ fontSize: 11, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: 1 }}>Deadline (hours)</span>
              <input
                type="number"
                min="1"
                value={config.deadline}
                onChange={(e) => setConfig({ ...config, deadline: parseInt(e.target.value) || 72 })}
                style={{
                  display: 'block', width: '100%', marginTop: 8, padding: 10,
                  background: 'var(--bg)', border: '1px solid var(--dimmer)', color: 'var(--text)',
                  fontFamily: 'var(--font)', fontSize: 13,
                }}
              />
            </label>
          </div>

          <div style={{ fontSize: 11, color: 'var(--dim)', marginBottom: 16, padding: '8px 12px', border: '1px solid var(--dimmer)' }}>
            Budget is suggested — the provider (agent) sets the final price. You fund after they accept.
          </div>

          <label style={{ display: 'block', marginBottom: 24 }}>
            <span style={{ fontSize: 11, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: 1 }}>Evaluator</span>
            <select
              value={config.evaluator === 'self' ? 'self' : 'custom'}
              onChange={(e) => setConfig({ ...config, evaluator: e.target.value === 'self' ? 'self' : '' })}
              style={{
                display: 'block', width: '100%', marginTop: 8, padding: 10,
                background: 'var(--bg)', border: '1px solid var(--dimmer)', color: 'var(--text)',
                fontFamily: 'var(--font)', fontSize: 13,
              }}
            >
              <option value="self">Self (you approve/reject)</option>
              <option value="custom">Custom address</option>
            </select>
            {config.evaluator !== 'self' && (
              <input
                type="text"
                value={config.evaluator}
                onChange={(e) => setConfig({ ...config, evaluator: e.target.value })}
                placeholder="0x..."
                style={{
                  display: 'block', width: '100%', marginTop: 8, padding: 10,
                  background: 'var(--bg)', border: '1px solid var(--dimmer)', color: 'var(--text)',
                  fontFamily: 'var(--font)', fontSize: 13,
                }}
              />
            )}
          </label>

          <button
            onClick={() => setStep('preview')}
            disabled={!config.description || !config.budget || parseFloat(config.budget) <= 0}
            style={{
              width: '100%', padding: '12px 0', fontSize: 13, fontWeight: 700,
              background: 'var(--accent)', color: '#ffffff', border: 'none', cursor: 'pointer',
              opacity: (!config.description || !config.budget) ? 0.4 : 1,
            }}
          >
            Preview →
          </button>
        </div>
      )}

      {/* Step: Preview */}
      {step === 'preview' && (
        <div>
          <div style={{ fontSize: 12, marginBottom: 24 }}>
            <div style={{ padding: '12px 0', borderBottom: '1px solid var(--dimmer)' }}>
              <span style={{ color: 'var(--dim)' }}>Description:</span> {config.description}
            </div>
            <div style={{ padding: '12px 0', borderBottom: '1px solid var(--dimmer)' }}>
              <span style={{ color: 'var(--dim)' }}>Suggested budget:</span> {config.budget} USDC
            </div>
            <div style={{ padding: '12px 0', borderBottom: '1px solid var(--dimmer)' }}>
              <span style={{ color: 'var(--dim)' }}>Deadline:</span> {config.deadline}h from now
            </div>
            <div style={{ padding: '12px 0', borderBottom: '1px solid var(--dimmer)' }}>
              <span style={{ color: 'var(--dim)' }}>Evaluator:</span> {config.evaluator === 'self' ? 'You' : config.evaluator}
            </div>
            <div style={{ padding: '12px 0', borderBottom: '1px solid var(--dimmer)' }}>
              <span style={{ color: 'var(--dim)' }}>Provider:</span> {agent.name || `agent-${agent.agentId}`} ({agent.owner.slice(0, 6)}...{agent.owner.slice(-4)})
            </div>
          </div>

          <div style={{ fontSize: 11, color: 'var(--dim)', marginBottom: 16 }}>
            This will create the job on-chain (1 transaction). The provider sets the final budget, then you fund.
          </div>
          <div style={{ fontSize: 12, marginBottom: 24 }}>
            <div style={{ padding: '6px 0' }}>1. createJob — register job on-chain with provider assigned</div>
            <div style={{ padding: '6px 0', color: 'var(--dim)' }}>2. wait — provider reviews and sets budget</div>
            <div style={{ padding: '6px 0', color: 'var(--dim)' }}>3. approve + fund — you deposit USDC into escrow</div>
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <button
              onClick={() => setStep('configure')}
              style={{
                flex: 1, padding: '12px 0', fontSize: 13,
                background: 'transparent', color: 'var(--dim)', border: '1px solid var(--dimmer)', cursor: 'pointer',
              }}
            >
              ← Back
            </button>
            <button
              onClick={executeCreate}
              style={{
                flex: 2, padding: '12px 0', fontSize: 13, fontWeight: 700,
                background: 'var(--accent)', color: '#ffffff', border: 'none', cursor: 'pointer',
              }}
            >
              Create Job
            </button>
          </div>
        </div>
      )}

      {/* Step: Execute (creating) */}
      {step === 'execute' && (
        <div>
          <div style={{ fontSize: 12, marginBottom: 24 }}>
            <div style={{
              padding: '10px 0',
              borderBottom: '1px solid var(--dimmer)',
              color: txStep >= 1 ? 'var(--text)' : 'var(--dimmer)',
            }}>
              {txStep > 1 ? '✓' : '◌'} Creating job...
              {txStep === 1 && <span style={{ color: 'var(--dim)', marginLeft: 8 }}>confirm in wallet</span>}
            </div>
          </div>

          {error && (
            <div style={{ padding: 12, border: '1px solid #ff4444', color: '#ff4444', fontSize: 12, marginBottom: 16 }}>
              {error}
              <button
                onClick={() => { setError(null); setStep('preview') }}
                style={{ display: 'block', marginTop: 8, color: 'var(--dim)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 11 }}
              >
                ← Back to preview
              </button>
            </div>
          )}
        </div>
      )}

      {/* Step: Waiting for provider */}
      {step === 'waiting' && (
        <div>
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Job #{jobId?.toString()} Created</div>
            <div style={{ fontSize: 12, color: 'var(--dim)', marginBottom: 24 }}>
              Waiting for provider to set budget...
            </div>
            <div style={{ margin: '0 auto', width: 24, height: 24, border: '2px solid var(--dimmer)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
            <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 24 }}>
              Suggested budget: {config.budget} USDC · Polling every 3s
            </div>
            <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 8 }}>
              You can close this page — fund from <Link to="/dashboard" style={{ color: 'var(--accent)' }}>My Jobs</Link> later.
            </div>
          </div>
        </div>
      )}

      {/* Step: Fund (provider set budget) */}
      {step === 'fund' && (
        <div>
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Provider Accepted</div>
            <div style={{ fontSize: 12, color: 'var(--dim)', marginBottom: 8 }}>
              Job #{jobId?.toString()} · Budget set to {onChainBudget} USDC
            </div>
            <div style={{ fontSize: 11, color: 'var(--dim)', marginBottom: 24 }}>
              Approve and fund to start the job.
            </div>

            {error && (
              <div style={{ padding: 12, border: '1px solid #ff4444', color: '#ff4444', fontSize: 12, marginBottom: 16, textAlign: 'left' }}>
                {error}
              </div>
            )}

            <button
              onClick={executeFund}
              style={{
                padding: '12px 32px', fontSize: 13, fontWeight: 700,
                background: 'var(--accent)', color: '#ffffff', border: 'none', cursor: 'pointer',
              }}
            >
              Approve & Fund ({onChainBudget} USDC)
            </button>
          </div>
        </div>
      )}

      {/* Step: Funding in progress */}
      {step === 'funding' && (
        <div>
          <div style={{ fontSize: 12, marginBottom: 24 }}>
            <div style={{
              padding: '10px 0',
              borderBottom: '1px solid var(--dimmer)',
              color: txStep >= 1 ? 'var(--text)' : 'var(--dimmer)',
            }}>
              {txStep > 1 ? '✓' : txStep === 1 ? '◌' : '○'} Approving USDC...
              {txStep === 1 && <span style={{ color: 'var(--dim)', marginLeft: 8 }}>confirm in wallet</span>}
            </div>
            <div style={{
              padding: '10px 0',
              borderBottom: '1px solid var(--dimmer)',
              color: txStep >= 2 ? 'var(--text)' : 'var(--dimmer)',
            }}>
              {txStep > 2 ? '✓' : txStep === 2 ? '◌' : '○'} Funding escrow...
              {txStep === 2 && <span style={{ color: 'var(--dim)', marginLeft: 8 }}>confirm in wallet</span>}
            </div>
          </div>
        </div>
      )}

      {/* Step: Confirm */}
      {step === 'confirm' && (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 24, marginBottom: 16 }}>✓</div>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Job Funded</div>
          <div style={{ fontSize: 12, color: 'var(--dim)', marginBottom: 24 }}>
            Job #{jobId?.toString()} · {onChainBudget || config.budget} USDC in escrow
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <Link
              to={`/jobs/${jobId?.toString()}`}
              style={{
                padding: '10px 20px', fontSize: 12,
                background: 'var(--accent)', color: '#ffffff', textDecoration: 'none',
              }}
            >
              View Job
            </Link>
            <Link
              to="/dashboard"
              style={{
                padding: '10px 20px', fontSize: 12,
                border: '1px solid var(--dimmer)', color: 'var(--dim)', textDecoration: 'none',
              }}
            >
              My Jobs
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}

// Helper: wait for tx receipt
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
