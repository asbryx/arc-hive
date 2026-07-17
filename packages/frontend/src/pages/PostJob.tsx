import { authFetch } from '@/api/client'
import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { waitForTransactionReceipt } from '@wagmi/core'
import { useConnectModal } from '@rainbow-me/rainbowkit'
import { useGuardedWriteContract } from '@/hooks/useGuardedWriteContract'
import { zeroAddress } from 'viem'
import { AGENTIC_COMMERCE, AGENTIC_COMMERCE_ABI } from '@/lib/contracts'
import { arcTestnet, config } from '@/lib/wagmi'
import { SECTOR_LIST, getSector, type SectorConfig, type SectorDetailField } from '@/lib/sectors'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

const JOB_TEMPLATES = [
  {
    name: 'Data Analysis',
    icon: '📊',
    template: {
      title: 'Data Analysis: [Dataset/Topic]',
      description: 'Analyze the provided dataset and deliver:\n- Key insights and trends\n- Visualizations (charts, graphs)\n- Statistical summary\n- Actionable recommendations',
      category: 'Data Analysis',
      requirements: 'Experience with Python/R, data visualization tools, statistical analysis',
    }
  },
  {
    name: 'Code Review',
    icon: '🔍',
    template: {
      title: 'Code Review: [Repository/Module]',
      description: 'Review the codebase for:\n- Security vulnerabilities\n- Performance bottlenecks\n- Code quality and best practices\n- Documentation gaps',
      category: 'Code',
      requirements: 'Experience with the tech stack, security audit background preferred',
    }
  },
  {
    name: 'Content Writing',
    icon: '✍️',
    template: {
      title: 'Content Writing: [Topic] - [Number] Articles',
      description: 'Write [Number] articles about [Topic]:\n- SEO optimized\n- 1000-2000 words each\n- Original research and insights\n- Include relevant keywords',
      category: 'Content Creation',
      requirements: 'Native English, SEO experience, portfolio of published work',
    }
  },
  {
    name: 'Research Report',
    icon: '🔬',
    template: {
      title: 'Research Report: [Topic]',
      description: 'Conduct comprehensive research on [Topic]:\n- Literature review\n- Methodology description\n- Key findings with evidence\n- Conclusions and recommendations',
      category: 'Research',
      requirements: 'Academic writing experience, access to research databases',
    }
  },
  {
    name: 'Trading Strategy',
    icon: '📈',
    template: {
      title: 'Trading Strategy: [Token/Pair] on Arc DEX',
      description: 'Build and backtest a trading strategy:\n- Entry/exit rules\n- Risk management parameters\n- Backtesting results (min 30 days)\n- Performance metrics (Sharpe, max drawdown)',
      category: 'Trading',
      requirements: 'DeFi experience, backtesting tools, Arc ecosystem knowledge',
    }
  },
]

interface JobForm {
  title: string
  description: string
  category: string
  requirements: string
  expectedFormat: string
  budgetMin: string
  budgetMax: string
  deadlineHours: string
  sectorDetails: Record<string, any>
}

type Step = 'form' | 'preview' | 'submitting' | 'done'

export default function PostJob() {
  const navigate = useNavigate()
  const { address, isConnected } = useAccount()
  const { openConnectModal } = useConnectModal()
  const { writeContractAsync } = useGuardedWriteContract()

  const [step, setStep] = useState<Step>('form')
  const [showDetails, setShowDetails] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<number | null>(null)
  const [form, setForm] = useState<JobForm>({
    title: '',
    description: '',
    category: '',
    requirements: '',
    expectedFormat: '',
    budgetMin: '',
    budgetMax: '',
    deadlineHours: '72',
    sectorDetails: {},
  })
  const [error, setError] = useState<string | null>(null)
  const [jobId, setJobId] = useState<bigint | null>(null)
  const [openJobId, setOpenJobId] = useState<number | null>(null)
  const [recommendedAgents, setRecommendedAgents] = useState<any[]>([])

  // Fetch recommended agents when category changes
  useEffect(() => {
    if (form.category) {
      fetch(`${API_BASE}/agents?capability=${form.category}&sort=score_desc&limit=5`)
        .then(r => r.json())
        .then(data => setRecommendedAgents(data.agents || data.data || []))
        .catch(() => {})
    }
  }, [form.category])

  // Fade orbital lines while on PostJob page
  useEffect(() => {
    window.dispatchEvent(new Event('arcs:clear'))
    return () => {
      window.dispatchEvent(new Event('arcs:restore'))
    }
  }, [])

  if (!isConnected) {
    return (
      <div className="page-enter" style={{ padding: '80px 24px', maxWidth: 700, margin: '0 auto', textAlign: 'center', minHeight: 'calc(100vh - 160px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 11, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 48 }}>
          // post open job
        </div>
        <div style={{ fontSize: 14, color: 'var(--dim)', marginBottom: 24 }}>Connect wallet to post a job</div>
        <button
          onClick={() => openConnectModal?.()}
          style={{ padding: '12px 32px', fontSize: 12, fontWeight: 700, background: 'var(--accent)', color: '#ffffff', border: 'none', cursor: 'pointer', letterSpacing: 1 }}
        >
          CONNECT WALLET
        </button>
      </div>
    )
  }

  const sector = getSector(form.category)
  const isValid = form.title.length >= 5 && form.description.length >= 20 && form.category && (form.budgetMin || form.budgetMax) && parseInt(form.deadlineHours) > 0

  function updateDetail(key: string, value: any) {
    setForm({ ...form, sectorDetails: { ...form.sectorDetails, [key]: value } })
  }

  async function handleSubmit() {
    setStep('submitting')
    setError(null)

    try {
      const deadlineH = parseInt(form.deadlineHours) || 72
      const expiredAt = BigInt(Math.floor(Date.now() / 1000) + deadlineH * 3600)
      const evaluatorAddr = '0xC1FEf538dc6357435372CEb69970D4078F4d3528' as `0x${string}`
      const onChainDesc = `[OPEN] ${form.title} | Budget: ${form.budgetMin || '?'} – ${form.budgetMax || '?'} USDC`

      const createHash = await writeContractAsync({
        address: AGENTIC_COMMERCE,
        abi: AGENTIC_COMMERCE_ABI,
        functionName: 'createJob',
        args: [
          zeroAddress,
          evaluatorAddr,
          expiredAt,
          onChainDesc,
          zeroAddress,
        ],
        chain: arcTestnet,
      })

      const receipt = await waitForTransactionReceipt(config, { hash: createHash })

      const jobCreatedLog = receipt.logs?.find(
        (log: any) => log.topics?.[0] === '0xb0f0239bfdd96453e24733e18bfc24b70d8fadf123dd977473518dd577ee79b9'
      )

      if (!jobCreatedLog || !jobCreatedLog.topics?.[1]) {
        console.error('[PostJob] JobCreated event not found in receipt', receipt)
        throw new Error(
          'JobCreated event not found in transaction receipt. The on-chain job was created but could not be linked. Please contact support with tx hash: ' + createHash
        )
      }

      const newJobId = BigInt(jobCreatedLog.topics[1])
      setJobId(newJobId)

      // Build sector_config from filled details only
      const sectorConfig: Record<string, any> = {}
      if (sector) {
        sectorConfig.sector = sector.id
        const filledDetails: Record<string, string> = {}
        for (const field of sector.detailFields) {
          const val = form.sectorDetails[field.key]
          if (val !== undefined && val !== '' && val !== false) {
            filledDetails[field.key] = typeof val === 'boolean' ? 'yes' : String(val)
          }
        }
        // Include expected format if set
        if (form.expectedFormat) {
          filledDetails['expectedFormat'] = form.expectedFormat
        }
        if (Object.keys(filledDetails).length > 0) {
          sectorConfig.details = filledDetails
        }
      }

      try {
        const res = await authFetch(`/open-jobs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jobId: newJobId.toString(),
            title: form.title,
            description: form.description,
            category: form.category,
            requirements: form.requirements || null,
            budgetMin: form.budgetMin || null,
            budgetMax: form.budgetMax || null,
            deadlineHours: form.deadlineHours,
            clientAddress: address,
            onChainTx: createHash,
            sectorConfig: Object.keys(sectorConfig).length > 0 ? sectorConfig : null,
          }),
        })

        if (!res.ok) {
          console.error('[PostJob] API call failed after on-chain creation', res.status)
          // Still show success since on-chain job exists
        } else {
          const { id } = await res.json()
          setOpenJobId(id)
        }
      } catch (apiErr) {
        console.error('[PostJob] API call error after on-chain creation:', apiErr)
        // Still show success since on-chain job exists
      }

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
    fontSize: 11, color: 'var(--dim)', textTransform: 'uppercase' as const, letterSpacing: 1, fontWeight: 500,
  }

  // ─── Sector Selector ───
  const sectorCardStyle = (active: boolean) => ({
    padding: '10px 12px',
    border: `1px solid ${active ? 'var(--accent)' : 'var(--dimmer)'}`,
    background: active ? 'rgba(39,63,79,0.15)' : 'transparent',
    color: active ? 'var(--text)' : 'var(--dim)',
    cursor: 'pointer' as const,
    fontSize: 12,
    fontFamily: 'var(--font)',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    transition: 'all 0.15s',
  })

  function renderDetailField(field: SectorDetailField) {
    const value = form.sectorDetails[field.key]

    if (field.type === 'checkbox') {
      return (
        <label key={field.key} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 16 }}>
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => updateDetail(field.key, e.target.checked)}
            style={{ accentColor: 'var(--accent)' }}
          />
          <span style={{ fontSize: 12, color: 'var(--text)' }}>{field.label}</span>
        </label>
      )
    }

    if (field.type === 'select') {
      return (
        <label key={field.key} style={{ display: 'block', marginBottom: 16 }}>
          <span style={labelStyle}>{field.label}</span>
          <select
            value={value || ''}
            onChange={(e) => updateDetail(field.key, e.target.value)}
            style={inputStyle}
          >
            <option value="">Any / No preference</option>
            {field.options?.map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </label>
      )
    }

    if (field.type === 'multiselect') {
      const selected: string[] = Array.isArray(value) ? value : []
      return (
        <div key={field.key} style={{ marginBottom: 16 }}>
          <span style={labelStyle}>{field.label}</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {field.options?.map(opt => {
              const isActive = selected.includes(opt)
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => {
                    const next = isActive
                      ? selected.filter(s => s !== opt)
                      : [...selected, opt]
                    updateDetail(field.key, next)
                  }}
                  style={{
                    padding: '5px 10px',
                    fontSize: 11,
                    fontFamily: 'var(--font)',
                    border: `1px solid ${isActive ? 'var(--accent)' : 'var(--dimmer)'}`,
                    background: isActive ? 'rgba(39,63,79,0.15)' : 'transparent',
                    color: isActive ? 'var(--text)' : 'var(--dim)',
                    cursor: 'pointer',
                  }}
                >
                  {opt}
                </button>
              )
            })}
          </div>
        </div>
      )
    }

    // text (default)
    return (
      <label key={field.key} style={{ display: 'block', marginBottom: 16 }}>
        <span style={labelStyle}>{field.label}</span>
        <input
          type="text"
          value={value || ''}
          onChange={(e) => updateDetail(field.key, e.target.value)}
          placeholder={field.placeholder}
          style={inputStyle}
        />
      </label>
    )
  }

  return (
    <div className="page-enter" style={{ padding: '80px 24px', maxWidth: 700, margin: '0 auto' }}>
      <div style={{ fontSize: 11, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 24 }}>
        // post open job
      </div>

      {/* Form */}
      {step === 'form' && (
        <div>
          {/* Template Selector */}
          <div style={{ marginBottom: '2rem' }}>
            <h3 style={{ marginBottom: '1rem', color: '#999', fontSize: '0.85rem' }}>START FROM TEMPLATE</h3>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              {JOB_TEMPLATES.map((t, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setSelectedTemplate(i)
                    // Pre-fill form fields
                    setForm(prev => ({
                      ...prev,
                      title: t.template.title,
                      description: t.template.description,
                      category: t.template.category,
                      requirements: t.template.requirements,
                    }))
                  }}
                  style={{
                    padding: '0.75rem 1rem',
                    background: selectedTemplate === i ? '#273F4F' : '#111',
                    border: `1px solid ${selectedTemplate === i ? '#273F4F' : '#333'}`,
                    color: 'white',
                    cursor: 'pointer',
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: '0.8rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}
                >
                  <span>{t.icon}</span> {t.name}
                </button>
              ))}
            </div>
          </div>

          {/* Sector Selector */}
          <div style={{ marginBottom: 24 }}>
            <span style={labelStyle}>Sector *</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 8 }}>
              {SECTOR_LIST.map(s => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setForm({ ...form, category: s.id, sectorDetails: {} })
                    setShowDetails(false)
                  }}
                  style={sectorCardStyle(form.category === s.id)}
                >
                  <span style={{ fontSize: 14 }}>{s.icon}</span>
                  <span>{s.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <label style={{ display: 'block', marginBottom: 20 }}>
            <span style={labelStyle}>Job title *</span>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Analyze token holder distribution for XYZ protocol"
              maxLength={200}
              style={inputStyle}
            />
          </label>

          {/* Description — dynamic placeholder */}
          <label style={{ display: 'block', marginBottom: 20 }}>
            <span style={labelStyle}>Description * (what needs to be done)</span>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder={sector?.descriptionPlaceholder || 'Describe the task in detail. What\'s the expected output? What data sources should be used?'}
              style={{ ...inputStyle, minHeight: 140, resize: 'vertical' as const }}
            />
            <div style={{ fontSize: 10, color: 'var(--dim)', marginTop: 4 }}>
              {form.description.length}/2000 · Min 20 characters
            </div>
          </label>

          {/* Sector Details — optional, collapsed */}
          {sector && sector.detailFields.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <button
                type="button"
                onClick={() => setShowDetails(!showDetails)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  background: 'none',
                  border: 'none',
                  color: 'var(--dim)',
                  cursor: 'pointer',
                  fontFamily: 'var(--font)',
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                  padding: 0,
                }}
              >
                <span style={{ transform: showDetails ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s', fontSize: 10 }}>▶</span>
                {sector.label} details (optional)
              </button>

              {showDetails && (
                <div style={{
                  marginTop: 12,
                  padding: '16px',
                  border: '1px solid var(--dimmer)',
                  background: 'rgba(39,63,79,0.04)',
                }}>
                  <div style={{ fontSize: 11, color: 'var(--dim)', marginBottom: 16 }}>
                    These fields help agents understand your needs better. All optional — skip any you don't need.
                  </div>
                  {sector.detailFields.map(field => renderDetailField(field))}
                </div>
              )}
            </div>
          )}

          {/* Expected Format (optional) */}
          <label style={{ display: 'block', marginBottom: 20 }}>
            <span style={labelStyle}>Expected format (optional)</span>
            <div style={{ marginTop: 8 }}>
              {['', 'PDF', 'Markdown', 'Code', 'CSV / Data', 'URL / Link'].map(fmt => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => setForm({ ...form, expectedFormat: fmt })}
                  style={{
                    padding: '6px 12px', marginRight: 8, marginBottom: 4,
                    fontSize: 11, fontFamily: 'var(--font)',
                    border: `1px solid ${form.expectedFormat === fmt ? 'var(--accent)' : 'var(--dimmer)'}`,
                    background: form.expectedFormat === fmt ? 'rgba(39,63,79,0.15)' : 'transparent',
                    color: form.expectedFormat === fmt ? 'var(--text)' : 'var(--dim)',
                    cursor: 'pointer',
                  }}
                >
                  {fmt || 'Any / No preference'}
                </button>
              ))}
            </div>
          </label>

          {/* Requirements */}
          <label style={{ display: 'block', marginBottom: 20 }}>
            <span style={labelStyle}>Requirements (skills, tools, access needed)</span>
            <textarea
              value={form.requirements}
              onChange={(e) => setForm({ ...form, requirements: e.target.value })}
              placeholder="e.g. Must have access to Dune Analytics API. Experience with ERC-20 token analysis."
              style={{ ...inputStyle, minHeight: 80, resize: 'vertical' as const }}
            />
          </label>

          {/* Budget */}
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

          {/* Deadline */}
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

          {/* Info box */}
          <div style={{ padding: '12px 16px', border: '1px solid var(--dimmer)', marginBottom: 24, fontSize: 11, color: 'var(--dim)' }}>
            Open jobs are visible to all agents. Agents apply with a proposed budget and message. You pick the best applicant, then fund the job. An AI evaluator reviews deliverables automatically.
          </div>

          {/* Recommended Agents */}
          {recommendedAgents.length > 0 && (
            <div style={{ marginTop: '2rem', padding: '1rem', border: '1px solid #222', background: '#0a0a0a' }}>
              <h3 style={{ color: '#273F4F', fontSize: '0.85rem', marginBottom: '1rem' }}>
                🤖 RECOMMENDED AGENTS FOR {form.category?.toUpperCase()}
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {recommendedAgents.map((agent: any) => (
                  <div key={agent.id} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0.5rem',
                    border: '1px solid #222',
                  }}>
                    <div>
                      <span style={{ color: 'white' }}>{agent.name || `Agent #${agent.agent_id}`}</span>
                      <span style={{ color: '#666', marginLeft: '0.5rem', fontSize: '0.75rem' }}>
                        Score: {agent.composite_score || 0} · {agent.completed_jobs || 0} jobs
                      </span>
                    </div>
                    <span style={{ color: '#273F4F', fontSize: '0.75rem' }}>
                      {agent.trust_tier || 'Unverified'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

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
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'inline-block', padding: '2px 8px', fontSize: 10, background: 'var(--dimmer)', color: 'var(--text)' }}>
                {sector?.icon} {form.sectorDetails.sectorLabel || form.category}
              </div>
              {(() => {
                const hint = form.sectorDetails.deliverableFormat
                  ? `Expected: ${form.sectorDetails.deliverableFormat}`
                  : sector?.deliverableHint
                return hint ? <div style={{ fontSize: 10, color: 'var(--dim)' }}>{hint}</div> : null
              })()}
            </div>

            <div style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 16, whiteSpace: 'pre-wrap' }}>
              {form.description}
            </div>

            {/* Sector details preview */}
            {sector && Object.keys(form.sectorDetails).length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: 'var(--dim)', textTransform: 'uppercase', marginBottom: 6 }}>{sector.label} details</div>
                <div style={{ fontSize: 12, padding: '10px 12px', border: '1px solid var(--dimmer)' }}>
                  {sector.detailFields
                    .filter(f => {
                      const v = form.sectorDetails[f.key]
                      return v !== undefined && v !== '' && v !== false && (!Array.isArray(v) || v.length > 0)
                    })
                    .map(f => {
                      const v = form.sectorDetails[f.key]
                      const display = typeof v === 'boolean' ? 'Yes' : Array.isArray(v) ? v.join(', ') : String(v)
                      return (
                        <div key={f.key} style={{ marginBottom: 4 }}>
                          <span style={{ color: 'var(--dim)', fontSize: 10, textTransform: 'uppercase' }}>{f.label}: </span>
                          <span>{display}</span>
                        </div>
                      )
                    })
                  }
                </div>
              </div>
            )}

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
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 8 }}>
            <span style={{ display: 'inline-block', padding: '2px 8px', fontSize: 10, background: 'var(--dimmer)', color: 'var(--text)' }}>
              {sector?.icon} {form.category}
            </span>
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
