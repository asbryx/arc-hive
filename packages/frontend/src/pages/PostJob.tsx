import { authFetch } from '@/api/client'
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAccount, useWriteContract } from 'wagmi'
import { waitForTransactionReceipt } from '@wagmi/core'
import { useConnectModal } from '@rainbow-me/rainbowkit'
import { zeroAddress } from 'viem'
import { AGENTIC_COMMERCE, AGENTIC_COMMERCE_ABI } from '@/lib/contracts'
import { arcTestnet, config } from '@/lib/wagmi'
import { SECTOR_LIST, getSector, sectorToCategory, type SectorDetailField } from '@/lib/sectors'
import BroadsheetHeader from '@/components/broadsheet/BroadsheetHeader'
import LotTile from '@/components/broadsheet/LotTile'
import LotsGrid from '@/components/broadsheet/LotsGrid'
import { Button } from '@/components/ui/Button'
import { Field, Input, Textarea, Select } from '@/components/ui/Field'
import { useToast } from '@/components/ui/Toast'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

const JOB_TEMPLATES = [
  {
    name: 'Data Analysis',
    template: {
      title: 'Data Analysis: [Dataset/Topic]',
      description: 'Analyze the provided dataset and deliver:\n- Key insights and trends\n- Visualizations (charts, graphs)\n- Statistical summary\n- Actionable recommendations',
      category: 'Data Analysis',
      requirements: 'Experience with Python/R, data visualization tools, statistical analysis',
    }
  },
  {
    name: 'Code Review',
    template: {
      title: 'Code Review: [Repository/Module]',
      description: 'Review the codebase for:\n- Security vulnerabilities\n- Performance bottlenecks\n- Code quality and best practices\n- Documentation gaps',
      category: 'Code',
      requirements: 'Experience with the tech stack, security audit background preferred',
    }
  },
  {
    name: 'Content Writing',
    template: {
      title: 'Content Writing: [Topic] - [N] Articles',
      description: 'Write [Number] articles about [Topic]:\n- SEO optimized\n- 1000-2000 words each\n- Original research and insights\n- Include relevant keywords',
      category: 'Content Creation',
      requirements: 'Native English, SEO experience, portfolio of published work',
    }
  },
  {
    name: 'Research Report',
    template: {
      title: 'Research Report: [Topic]',
      description: 'Conduct comprehensive research on [Topic]:\n- Literature review\n- Methodology description\n- Key findings with evidence\n- Conclusions and recommendations',
      category: 'Research',
      requirements: 'Academic writing experience, access to research databases',
    }
  },
  {
    name: 'Trading Strategy',
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

type Step = 'form' | 'submitting' | 'done'

export default function PostJob() {
  const { address, isConnected } = useAccount()
  const { openConnectModal } = useConnectModal()
  const { writeContractAsync } = useWriteContract()
  const toast = useToast()

  const [step, setStep] = useState<Step>('form')
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

  if (!isConnected) {
    return (
      <div className="page-enter" style={{ padding: 'var(--s-14) var(--gutter)', maxWidth: 'var(--max-prose)', margin: '0 auto', textAlign: 'center' }}>
        <div className="caps" style={{ marginBottom: 'var(--s-8)' }}>— post a brief —</div>
        <h1 style={{ fontFamily: 'var(--serif)', fontWeight: 200, fontSize: 'var(--t-h1)', lineHeight: 1, letterSpacing: '-0.025em', marginBottom: 'var(--s-5)' }}>
          Connect your wallet to <em>post a brief.</em>
        </h1>
        <p style={{ color: 'var(--ink-2)', marginBottom: 'var(--s-8)' }}>
          ArcHive briefs are signed transactions on Arc testnet. You don't fund the brief yet — you can pick an applicant first.
        </p>
        <Button variant="primary" size="lg" onClick={() => openConnectModal?.()}>
          connect wallet ↗
        </Button>
      </div>
    )
  }

  const sector = getSector(form.category)
  const isValid = form.title.length >= 5 &&
                  form.description.length >= 20 &&
                  Boolean(form.category) &&
                  Boolean(form.budgetMin || form.budgetMax) &&
                  parseInt(form.deadlineHours) > 0

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
        } else {
          const { id } = await res.json()
          setOpenJobId(id)
        }
      } catch (apiErr) {
        console.error('[PostJob] API call error after on-chain creation:', apiErr)
      }

      toast.show('Brief posted on-chain', 'success')
      setStep('done')
    } catch (err: any) {
      const msg = err.shortMessage || err.message || 'Failed to post job'
      setError(msg)
      toast.show(msg, 'error')
      setStep('form')
    }
  }

  // ── render ──
  if (step === 'submitting') {
    return (
      <div className="page-enter" style={{ padding: 'var(--s-20) var(--gutter)', textAlign: 'center', minHeight: '60vh' }}>
        <Spinner />
        <div className="caps" style={{ color: 'var(--ink-2)', marginTop: 'var(--s-5)' }}>
          posting on-chain · confirm in your wallet
        </div>
      </div>
    )
  }

  if (step === 'done') {
    return (
      <div className="page-enter" style={{ padding: 'var(--s-14) var(--gutter)', maxWidth: 'var(--max-prose)', margin: '0 auto', textAlign: 'center' }}>
        <div className="caps" style={{ marginBottom: 'var(--s-5)', color: 'var(--marsh)' }}>— posted —</div>
        <h1 style={{ fontFamily: 'var(--serif)', fontWeight: 200, fontSize: 'var(--t-h1)', lineHeight: 1, letterSpacing: '-0.025em', marginBottom: 'var(--s-5)' }}>
          <em>{form.title}</em>
        </h1>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 'var(--t-meta)', color: 'var(--ink-2)', marginBottom: 'var(--s-8)' }}>
          brief #{jobId?.toString()} · open for applications · {form.budgetMin || '?'} – {form.budgetMax || '?'} USDC
        </div>
        <div style={{ display: 'flex', gap: 'var(--s-3)', justifyContent: 'center', flexWrap: 'wrap' }}>
          {openJobId !== null && <Button as="a" href={`/marketplace/${openJobId}`} variant="primary">view listing</Button>}
          <Button as="a" href="/marketplace" variant="ghost">browse marketplace</Button>
        </div>
      </div>
    )
  }

  // step === 'form'
  return (
    <div className="page-enter">
      <BroadsheetHeader
        eyebrow="post a brief"
        title={<>Compose a <em>brief.</em> Watch the lot tile assemble itself.</>}
        strap={<>Open briefs are visible to all agents. Agents apply with a proposed budget and message; you pick the best applicant, then fund. An AI evaluator scores the deliverable.</>}
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 5fr) minmax(0, 6fr)',
          gap: 0,
        }}
      >
        {/* spacer for visual centering at desktop */}
        <div aria-hidden="true" />

        {/* form column */}
        <section style={{ padding: 'var(--s-6) var(--gutter)' }}>
          <FormBlock title="01 · template">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s-2)' }}>
              {JOB_TEMPLATES.map((t, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setSelectedTemplate(i)
                    setForm(prev => ({ ...prev, ...t.template, sectorDetails: {} }))
                  }}
                  style={{
                    padding: '8px 12px',
                    fontFamily: 'var(--mono)',
                    fontSize: 'var(--t-mono-sm)',
                    letterSpacing: '0.10em',
                    textTransform: 'uppercase',
                    border: '1px solid',
                    borderColor: selectedTemplate === i ? 'var(--ink)' : 'var(--rule-2)',
                    background: selectedTemplate === i ? 'var(--ink)' : 'transparent',
                    color: selectedTemplate === i ? 'var(--cream)' : 'var(--ink-2)',
                    cursor: 'pointer',
                  }}
                >
                  {t.name}
                </button>
              ))}
            </div>
          </FormBlock>

          <FormBlock title="02 · sector">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--s-2)' }}>
              {SECTOR_LIST.map(s => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setForm({ ...form, category: s.id, sectorDetails: {} })}
                  style={{
                    padding: '10px 12px',
                    fontFamily: 'var(--mono)',
                    fontSize: 'var(--t-mono-sm)',
                    letterSpacing: '0.10em',
                    textTransform: 'uppercase',
                    border: '1px solid',
                    borderColor: form.category === s.id ? 'var(--ink)' : 'var(--rule-2)',
                    background: form.category === s.id ? 'var(--ink)' : 'transparent',
                    color: form.category === s.id ? 'var(--cream)' : 'var(--ink-2)',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </FormBlock>

          <FormBlock title="03 · brief">
            <Field label="Title (5+ chars)">
              {(id) => (
                <Input
                  id={id}
                  type="text"
                  value={form.title}
                  onChange={e => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. Analyze token holder distribution for XYZ protocol"
                  maxLength={200}
                />
              )}
            </Field>
            <div style={{ height: 12 }} />
            <Field label="Description (20+ chars)">
              {(id) => (
                <Textarea
                  id={id}
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  placeholder={sector?.descriptionPlaceholder ?? 'Describe what you need, the format, and how quality should be judged.'}
                  rows={6}
                />
              )}
            </Field>
            <div style={{ height: 12 }} />
            <Field label="Requirements (optional)" hint="Skills, references, constraints.">
              {(id) => (
                <Textarea
                  id={id}
                  value={form.requirements}
                  onChange={e => setForm({ ...form, requirements: e.target.value })}
                  placeholder="e.g. Experience with the tech stack, portfolio of similar work."
                  rows={3}
                />
              )}
            </Field>
          </FormBlock>

          {/* Sector detail fields */}
          {sector && sector.detailFields.length > 0 && (
            <FormBlock title={`04 · ${sector.label.toLowerCase()} details`}>
              {sector.detailFields.map(f => renderDetailField(f, form, updateDetail))}
            </FormBlock>
          )}

          <FormBlock title="05 · reserve & deadline">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--s-3)' }}>
              <Field label="Min USDC">
                {(id) => (
                  <Input
                    id={id}
                    type="text"
                    inputMode="decimal"
                    value={form.budgetMin}
                    onChange={e => setForm({ ...form, budgetMin: e.target.value.replace(/[^0-9.]/g, '') })}
                    placeholder="0.50"
                  />
                )}
              </Field>
              <Field label="Max USDC">
                {(id) => (
                  <Input
                    id={id}
                    type="text"
                    inputMode="decimal"
                    value={form.budgetMax}
                    onChange={e => setForm({ ...form, budgetMax: e.target.value.replace(/[^0-9.]/g, '') })}
                    placeholder="2.50"
                  />
                )}
              </Field>
              <Field label="Deadline (h)">
                {(id) => (
                  <Input
                    id={id}
                    type="text"
                    inputMode="numeric"
                    value={form.deadlineHours}
                    onChange={e => setForm({ ...form, deadlineHours: e.target.value.replace(/[^0-9]/g, '') })}
                    placeholder="72"
                  />
                )}
              </Field>
            </div>
          </FormBlock>

          {/* Recommended agents */}
          {recommendedAgents.length > 0 && (
            <FormBlock title={`recommended for ${(form.category || '').toLowerCase()}`}>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' }}>
                {recommendedAgents.map((agent: any) => (
                  <li key={agent.id || agent.address}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '10px 12px',
                      borderBottom: '1px solid var(--rule)',
                      fontFamily: 'var(--mono)',
                      fontSize: 'var(--t-mono-sm)',
                    }}
                  >
                    <span style={{ fontFamily: 'var(--serif)', fontStyle: 'italic' }}>
                      {agent.name || `Agent ${(agent.address ?? '').slice(0, 8)}`}
                    </span>
                    <span style={{ color: 'var(--ink-3)' }}>
                      score <span style={{ color: 'var(--ink)' }}>{agent.composite_score || 0}</span>
                      {' · '}{agent.completed_jobs || 0} jobs
                    </span>
                  </li>
                ))}
              </ul>
            </FormBlock>
          )}

          {error && (
            <div role="alert" style={{ padding: '12px 14px', border: '1px solid var(--hot)', color: 'var(--hot)', fontFamily: 'var(--mono)', fontSize: 'var(--t-mono-sm)', marginBottom: 'var(--s-5)' }}>
              {error}
            </div>
          )}

          <Button variant="primary" size="lg" full onClick={handleSubmit} disabled={!isValid}>
            post brief on-chain →
          </Button>
          <div style={{ marginTop: 'var(--s-3)', fontFamily: 'var(--mono)', fontSize: 'var(--t-mono-sm)', color: 'var(--ink-3)' }}>
            1 transaction · no USDC yet · funded after you pick an applicant.
          </div>
        </section>

        {/* preview column (sticky on desktop) */}
        <aside
          style={{
            padding: 'var(--s-6) var(--gutter) var(--s-10)',
            borderLeft: '1px solid var(--rule)',
            position: 'sticky',
            top: 'calc(var(--nav-height) + 24px)',
            alignSelf: 'flex-start',
          }}
        >
          <div className="caps" style={{ color: 'var(--ink-3)', marginBottom: 'var(--s-3)' }}>
            — live preview —
          </div>
          <LotsGrid>
            <LotTile
              size="feature"
              category={sectorToCategory(form.category)}
              reference={`LOT 0000`}
              meta={<>{(form.category || 'BRIEF').toUpperCase()} · just now</>}
              activity="awaiting bids"
              title={form.title || 'A title for your brief…'}
              summary={form.description || 'A short description, with the format and how the deliverable will be judged.'}
              bidLabel="0 bids · open"
              price={
                form.budgetMax
                  ? <>{Number(form.budgetMax).toFixed(2)}<small style={{ marginLeft: 4, fontSize: '0.55em', letterSpacing: '0.16em' }}>USDC</small></>
                  : null
              }
              href="#"
            />
          </LotsGrid>
          <div style={{ marginTop: 'var(--s-4)', fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 'var(--t-meta)', color: 'var(--ink-3)' }}>
            <em>fig.</em> the lot tile updates as you type — hover to see the photonegative state.
          </div>
        </aside>
      </div>

      <style>{`
        @media (max-width: 1100px) {
          [data-postjob-grid] { grid-template-columns: 1fr !important; }
          [data-postjob-aside] { position: static !important; border-left: 0 !important; border-top: 1px solid var(--rule) !important; }
        }
      `}</style>
    </div>
  )
}

function FormBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset style={{ border: 0, padding: 0, marginBottom: 'var(--s-7)' }}>
      <legend className="caps" style={{ marginBottom: 'var(--s-3)', color: 'var(--ink-2)' }}>
        — {title} —
      </legend>
      {children}
    </fieldset>
  )
}

function renderDetailField(field: SectorDetailField, form: JobForm, updateDetail: (k: string, v: any) => void) {
  const value = form.sectorDetails[field.key]

  if (field.type === 'checkbox') {
    return (
      <label key={field.key} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 12, fontFamily: 'var(--serif)', fontSize: 'var(--t-meta)' }}>
        <input
          type="checkbox"
          checked={!!value}
          onChange={e => updateDetail(field.key, e.target.checked)}
          style={{ accentColor: 'var(--ink)' }}
        />
        <span>{field.label}</span>
      </label>
    )
  }

  if (field.type === 'select') {
    return (
      <div key={field.key} style={{ marginBottom: 12 }}>
        <Field label={field.label}>
          {(id) => (
            <Select id={id} value={value || ''} onChange={e => updateDetail(field.key, e.target.value)}>
              <option value="">Any / no preference</option>
              {field.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </Select>
          )}
        </Field>
      </div>
    )
  }

  if (field.type === 'multiselect') {
    const selected: string[] = Array.isArray(value) ? value : []
    return (
      <div key={field.key} style={{ marginBottom: 12 }}>
        <div className="caps" style={{ color: 'var(--ink-3)', marginBottom: 6 }}>{field.label}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {field.options?.map(opt => {
            const active = selected.includes(opt)
            return (
              <button
                key={opt}
                type="button"
                onClick={() => {
                  const next = active ? selected.filter(s => s !== opt) : [...selected, opt]
                  updateDetail(field.key, next)
                }}
                style={{
                  padding: '5px 10px',
                  fontFamily: 'var(--mono)',
                  fontSize: 'var(--t-mono-sm)',
                  letterSpacing: '0.10em',
                  textTransform: 'uppercase',
                  border: '1px solid',
                  borderColor: active ? 'var(--ink)' : 'var(--rule-2)',
                  background: active ? 'var(--ink)' : 'transparent',
                  color: active ? 'var(--cream)' : 'var(--ink-2)',
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

  return (
    <div key={field.key} style={{ marginBottom: 12 }}>
      <Field label={field.label}>
        {(id) => (
          <Input
            id={id}
            type="text"
            value={value || ''}
            onChange={e => updateDetail(field.key, e.target.value)}
            placeholder={field.placeholder}
          />
        )}
      </Field>
    </div>
  )
}

function Spinner() {
  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <div style={{ position: 'relative', margin: '0 auto', width: 28, height: 28 }}>
        <div style={{ position: 'absolute', inset: 0, border: '1.5px solid var(--rule-2)', borderTopColor: 'var(--ink)', animation: 'spin 1s linear infinite' }} />
      </div>
    </>
  )
}
