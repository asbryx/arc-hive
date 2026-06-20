/**
 * ComposingRoom — "The Composing Room" post-a-brief page (M3), preview path.
 *
 * Draft a formal gazette notice: pick a brief type (the 6 broadsheet
 * categories), compose title + description + requirements + expected format +
 * budget + deadline, fill the sector's optional detail fields, see recommended
 * agents by capability, preview the notice, then "post the brief."
 *
 * actual on-chain createJob call (preserved untouched); the on-chain submit
 * ports into this themed shell once the design is approved. Submit here is
 * visual — it shows a success state + links to a (mock) case file.
 */

import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { useConnectModal } from '@rainbow-me/rainbowkit'
import { zeroAddress } from 'viem'
import { waitForTransactionReceipt } from '@wagmi/core'
import { authFetch } from '@/api/client'
import { useGuardedWriteContract } from '@/hooks/useGuardedWriteContract'
import { AGENTIC_COMMERCE, AGENTIC_COMMERCE_ABI } from '@/lib/contracts'
import { arcTestnet, config as wagmiConfig } from '@/lib/wagmi'
import { CATEGORIES, CATEGORY_LABEL, fmtBudget, fmtDeadline, ACTION_VERB, type BriefCategory } from '@/lib/briefVocab'
import { getSector, type SectorDetailField } from '@/lib/sectors'
import './composing.css'

const EVALUATOR_ADDR = '0xC1FEf538dc6357435372CEb69970D4078F4d3528' as `0x${string}`
const JOB_CREATED_TOPIC = '0xb0f0239bfdd96453e24733e18bfc24b70d8fadf123dd977473518dd577ee79b9'

/** broadsheet category → real sector id (capitalized in sectors.ts). */
/** categories are now the OG sector ids directly (e.g. 'Code', 'Data Analysis'),
 *  so getSector takes the category as-is. */
const SECTOR_ID: Record<string, string> = {
  'Data Analysis': 'Data Analysis', 'Content Creation': 'Content Creation',
  'Code': 'Code', 'Development': 'Development', 'Research': 'Research',
  'Trading': 'Trading', 'DeFi': 'DeFi', 'Social Media': 'Social Media',
  'Monitoring': 'Monitoring', 'Other': 'Other',
}

const TYPE_HINTS: Record<string, string> = {
  'Data Analysis': 'clusters, cohorts, charts',
  'Content Creation': 'copy, a wordmark, a page',
  'Code': 'a PR, a script, a tool',
  'Development': 'an app, an API, a contract',
  'Research': 'a landscape, a survey',
  'Trading': 'a strategy, a backtest',
  'DeFi': 'a vault, a pool, a route',
  'Social Media': 'posts, a calendar, a voice',
  'Monitoring': 'alerts, a dashboard, a feed',
  'Other': 'describe it yourself',
}

/** broadsheet templates — prefab notices that prefill the form (mirrors the real
 *  PostJob template selector, themed). */
const TEMPLATES: Array<{ name: string; category: BriefCategory; title: string; description: string; requirements: string }> = [
  { name: 'code review', category: 'Code', title: 'Code Review: [Repository / Module]', description: 'Review the codebase for:\n- security vulnerabilities\n- performance bottlenecks\n- code quality and best practices\n- documentation gaps', requirements: 'Familiar with the stack; security-audit background preferred. Cite the exact commit reviewed.' },
  { name: 'research report', category: 'Research', title: 'Research Report: [Topic]', description: 'Conduct comprehensive research on [Topic]:\n- literature review\n- methodology\n- key findings with evidence\n- conclusions and recommendations', requirements: 'Primary sources only. Footnotes preferred to prose links.' },
  { name: 'data analysis', category: 'Data Analysis', title: 'Data Analysis: [Dataset]', description: 'Analyze the dataset for:\n- summary statistics\n- clusters / cohorts\n- key trends with evidence\n- charts and a short write-up', requirements: 'Reproducible notebook preferred. Cite the data source.' },
  { name: 'content / copy', category: 'Content Creation', title: 'Content: [Project]', description: 'Write the copy for [Project]:\n- landing page\n- a short post\n- a one-line positioning\n- tone of voice notes', requirements: 'Two rounds. Voice should match the brand brief.' },
  { name: 'other', category: 'Other', title: 'Custom: [Describe]', description: 'Describe the work in your own words. What should it do? What does done look like?', requirements: 'Be specific about the deliverable and the deadline.' },
]

const EXPECTED_FORMATS = ['Any', 'PDF', 'Markdown', 'Code', 'CSV / Data', 'URL / Link']

interface Form {
  category: string
  title: string; description: string; requirements: string; expectedFormat: string
  budgetMin: string; budgetMax: string; deadlineHours: string; sectorDetails: Record<string, any>
}

const MOCK_AGENTS: Array<{ name: string; score: number; jobs: number; addr: string }> = [
  { name: 'Lyra Synthwright', score: 9.42, jobs: 241, addr: '0xA8C3' },
  { name: 'Carter & Vale',    score: 8.71, jobs: 298, addr: '0x4C91' },
  { name: 'Thorne Ledger',    score: 8.43, jobs: 176, addr: '0x12FA' },
  { name: 'Bly & Marsh',      score: 8.34, jobs: 142, addr: '0x3D8E' },
  { name: 'Osric Wynn',       score: 8.22, jobs: 188, addr: '0x1F44' },
]

export default function ComposingRoom() {
  const [form, setForm] = useState<Form>({
    category: '',
    title: '', description: '', requirements: '', expectedFormat: '',
    budgetMin: '', budgetMax: '', deadlineHours: '72', sectorDetails: {},
  })
  const [showDetails, setShowDetails] = useState(false)
  const [posted, setPosted] = useState<number | null>(null)
  const [postingMsg, setPostingMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { address, isConnected } = useAccount()
  const { openConnectModal } = useConnectModal()
  // Audit fix T7: refuses to broadcast on-chain tx while the backend mirror is offline.
  const { writeContractAsync } = useGuardedWriteContract()

  const sector = getSector(SECTOR_ID[form.category] ?? '')
  const isValid = form.title.length >= 5 && form.description.length >= 20 && !!form.category && (!!form.budgetMin || !!form.budgetMax) && parseInt(form.deadlineHours) > 0

  const recommended = useMemo(() => MOCK_AGENTS, []) // surfaced as a hint; the real list is on /agents

  function updateDetail(key: string, value: any) {
    setForm(f => ({ ...f, sectorDetails: { ...f.sectorDetails, [key]: value } }))
  }

  async function handlePost() {
    if (!isValid || postingMsg) return
    if (!isConnected) { openConnectModal?.(); return }
    setError(null)
    setPostingMsg('confirm createJob in your wallet…')
    try {
      const deadlineH = parseInt(form.deadlineHours) || 72
      const expiredAt = BigInt(Math.floor(Date.now() / 1000) + deadlineH * 3600)
      const onChainDesc = `[OPEN] ${form.title} | Budget: ${form.budgetMin || '?'} – ${form.budgetMax || '?'} USDC`

      // Step 1: createJob on-chain (open post → provider = zeroAddress).
      const createHash = await writeContractAsync({
        address: AGENTIC_COMMERCE,
        abi: AGENTIC_COMMERCE_ABI,
        functionName: 'createJob',
        args: [zeroAddress, EVALUATOR_ADDR, expiredAt, onChainDesc, zeroAddress],
        chain: arcTestnet,
      })

      setPostingMsg('waiting for the chain to confirm…')
      const receipt = await waitForTransactionReceipt(wagmiConfig, { hash: createHash })
      const log = receipt.logs?.find((l: any) => l.topics?.[0] === JOB_CREATED_TOPIC)
      if (!log || !log.topics?.[1]) {
        throw new Error('Job created on-chain but the JobCreated event could not be read. Tx: ' + createHash)
      }
      const newJobId = BigInt(log.topics[1])

      // Build sector_config from filled detail fields.
      const sectorConfig: Record<string, any> = {}
      if (sector) {
        sectorConfig.sector = sector.id
        const filled: Record<string, string> = {}
        for (const field of sector.detailFields) {
          const val = form.sectorDetails[field.key]
          if (val !== undefined && val !== '' && val !== false) {
            filled[field.key] = typeof val === 'boolean' ? 'yes' : String(val)
          }
        }
        if (form.expectedFormat) filled['expectedFormat'] = form.expectedFormat
        if (Object.keys(filled).length > 0) sectorConfig.details = filled
      }

      // Step 2: file the off-chain brief so it appears in the marketplace.
      setPostingMsg('filing the brief…')
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
      // The on-chain job exists regardless; prefer the marketplace row id for the link.
      let lot = Number(newJobId)
      if (res.ok) {
        const body = await res.json().catch(() => null)
        if (body?.id != null) lot = body.id
      }
      setPosted(lot)
    } catch (e: any) {
      setError(e?.shortMessage || e?.message || 'The brief could not be posted.')
    } finally {
      setPostingMsg(null)
    }
  }

  if (posted != null) {
    return (
      <div className="cr-page">
        <div className="cr-head">
          <h1>archive · <em>the composing room</em></h1>
          <div className="cr-sub">section · post a job · vol. iv</div>
        </div>
        <div className="cr-success">
          Job posted successfully. A new LOT has been opened — agents can now apply.
          <Link to={`/marketplace/${posted}`}>view the case file ↗</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="cr-page">
      <Link to="/marketplace" className="cr-back">← Back to Marketplace</Link>

      <div className="cr-head">
        <h1>archive · <em>the composing room</em></h1>
        <div className="cr-sub">section · post a brief · vol. iv</div>
      </div>

      {/* ─── brief type ─── */}
      <div className="cr-section-label">Sector</div>
      <div className="cr-types">
        {CATEGORIES.map(c => (
          <button key={c} type="button" className={`cr-type ${form.category === c ? 'active' : ''}`}
                  onClick={() => { setForm(f => ({ ...f, category: c, sectorDetails: {} })); setShowDetails(false) }}>
            {CATEGORY_LABEL[c]}
            <span className="cr-type-hint">{TYPE_HINTS[c]}</span>
          </button>
        ))}
      </div>

      {/* ─── start from a template ─── */}
      <div className="cr-section-label">start from a template</div>
      <div className="cr-types">
        {TEMPLATES.map(t => (
          <button key={t.name} type="button" className={`cr-type ${form.title === t.title ? 'active' : ''}`}
                  onClick={() => { setForm(f => ({ ...f, category: t.category, title: t.title, description: t.description, requirements: t.requirements, sectorDetails: {} })); setShowDetails(false) }}>
            {t.name}
          </button>
        ))}
      </div>

      {/* ─── the notice ─── */}
      <div className="cr-section-label">Job details</div>
      <label className="cr-field">
        <span className="cr-field-label">Job title</span>
        <input className="cr-input" placeholder="A quiet review of perpetual-DEX volume since the Q1 thaw." value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
      </label>
      <label className="cr-field">
        <span className="cr-field-label">Description <span style={{ color: 'var(--ink-3)', marginLeft: 8 }}>{form.description.length} / 2000</span></span>
        <textarea className="cr-textarea" maxLength={2000} placeholder="Describe the work. What should it do? What should it cite? What does done look like?" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
      </label>
      <label className="cr-field">
        <span className="cr-field-label">Requirements (optional)</span>
        <textarea className="cr-textarea" placeholder="Sources should be primary. No filler paragraphs. The CI must be green when delivered." value={form.requirements} onChange={e => setForm(f => ({ ...f, requirements: e.target.value }))} />
      </label>

      <div className="cr-row">
        <label className="cr-field">
          <span className="cr-field-label">budget min · USDC</span>
          <input className="cr-input" type="number" step="0.01" placeholder="0.80" value={form.budgetMin} onChange={e => setForm(f => ({ ...f, budgetMin: e.target.value }))} />
        </label>
        <label className="cr-field">
          <span className="cr-field-label">budget max · USDC</span>
          <input className="cr-input" type="number" step="0.01" placeholder="2.40" value={form.budgetMax} onChange={e => setForm(f => ({ ...f, budgetMax: e.target.value }))} />
        </label>
        <label className="cr-field">
          <span className="cr-field-label">deadline · hours</span>
          <input className="cr-input" type="number" placeholder="72" value={form.deadlineHours} onChange={e => setForm(f => ({ ...f, deadlineHours: e.target.value }))} />
        </label>
      </div>

      <div className="cr-field">
        <span className="cr-field-label">expected format</span>
        <div className="cr-types" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))' }}>
          {EXPECTED_FORMATS.map(fmt => (
            <button key={fmt} type="button" className={`cr-type ${form.expectedFormat === fmt ? 'active' : ''}`}
                    onClick={() => setForm(f => ({ ...f, expectedFormat: fmt === 'Any' ? '' : fmt }))}>
              {fmt.toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {/* evaluator notice */}
      <div className="cr-hint" style={{ marginTop: 14 }}>
        <em>The AI evaluator</em> — an automated assay — scores every filed return on completeness, quality, effort, and format. It can approve, request a revision, or fail the return. You set the revision allowance below.
      </div>

      {/* ─── sector detail fields (optional, collapsible) ─── */}
      {sector && sector.detailFields.length > 0 && (
        <>
          <div className="cr-section-label">detail fields · optional</div>
          <div className="cr-hint">These help agents understand the work. All optional — skip any you don't need.</div>
          <button type="button" className="cr-btn ghost" onClick={() => setShowDetails(s => !s)}>{showDetails ? 'hide detail fields' : 'show detail fields'}</button>
          {showDetails && (
            <div className="cr-details" style={{ marginTop: 12 }}>
              {sector.detailFields.map(field => (
                <DetailField key={field.key} field={field} value={form.sectorDetails[field.key]} onChange={v => updateDetail(field.key, v)} />
              ))}
            </div>
          )}
        </>
      )}

      {/* ─── recommended agents ─── */}
      {form.category && (
        <>
          <div className="cr-section-label">recommended agents · {form.category ? CATEGORY_LABEL[form.category as keyof typeof CATEGORY_LABEL] : '—'}</div>
          <div className="cr-agents">
            {recommended.map(a => (
              <div key={a.addr} className="cr-agent">
                <div className="cr-agent-name">{a.name}</div>
                <div className="cr-agent-meta">{a.addr} · {a.score.toFixed(2)} · {a.jobs} settled</div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ─── preview ─── */}
      {(form.title || form.description) && (
        <>
          <div className="cr-section-label">the notice · as it will read</div>
          <div className="cr-preview">
            <div className="cr-preview-label">LOT — · {form.category ? CATEGORY_LABEL[form.category as keyof typeof CATEGORY_LABEL] : '—'} · open</div>
            <div className="cr-preview-title">{form.title || <span style={{ color: 'var(--ink-3)' }}>Enter a job title above…</span>}</div>
            <div className="cr-preview-body">{form.description || <span style={{ color: 'var(--ink-3)' }}>Describe the job above…</span>}</div>
            <div className="cr-preview-meta">
              <span>budget <b>{fmtBudget(form.budgetMin ? parseFloat(form.budgetMin) : null, form.budgetMax ? parseFloat(form.budgetMax) : null)}</b></span>
              <span><b>{form.deadlineHours ? fmtDeadline(parseInt(form.deadlineHours)) : '—'}</b></span>
              {form.expectedFormat && <span>format <b>{form.expectedFormat}</b></span>}
            </div>
          </div>
        </>
      )}

      {/* ─── submit ─── */}
      {error && <div className="cr-hint" style={{ color: 'var(--hot)' }}>{error}</div>}
      <div className="cr-submit-row">
        <button className="cr-btn" type="button" disabled={!isValid || !!postingMsg} onClick={handlePost}>
          {postingMsg ? postingMsg : !isConnected ? `Connect wallet to ${ACTION_VERB.post.toLowerCase()} ↗` : `${ACTION_VERB.post} ↗`}
        </button>
        <span className="cr-valid-note">{postingMsg ? 'do not close this tab' : isValid ? 'ready to post' : 'needs a title (5+), a brief (20+), a category, and a budget'}</span>
      </div>
    </div>
  )
}

function DetailField({ field, value, onChange }: { field: SectorDetailField; value: any; onChange: (v: any) => void }) {
  if (field.type === 'checkbox') {
    return (
      <label className="cr-field cr-check">
        <input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)} />
        {field.label}
      </label>
    )
  }
  if (field.type === 'select') {
    return (
      <label className="cr-field">
        <span className="cr-field-label">{field.label}</span>
        <select className="cr-select" value={value ?? ''} onChange={e => onChange(e.target.value)}>
          <option value="">— select —</option>
          {field.options?.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </label>
    )
  }
  if (field.type === 'multiselect') {
    const arr: string[] = Array.isArray(value) ? value : []
    const toggle = (o: string) => onChange(arr.includes(o) ? arr.filter(x => x !== o) : [...arr, o])
    return (
      <div className="cr-field">
        <span className="cr-field-label">{field.label}</span>
        <div className="cr-types" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))' }}>
          {field.options?.map(o => (
            <button key={o} type="button" className={`cr-type ${arr.includes(o) ? 'active' : ''}`} onClick={() => toggle(o)}>{o.toLowerCase()}</button>
          ))}
        </div>
      </div>
    )
  }
  return (
    <label className="cr-field">
      <span className="cr-field-label">{field.label}</span>
      <input className="cr-input" placeholder={field.placeholder} value={value ?? ''} onChange={e => onChange(e.target.value)} />
    </label>
  )
}
