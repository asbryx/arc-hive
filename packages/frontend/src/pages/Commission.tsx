/**
 * Commission — "The Commission" direct-hire flow (A3), preview path.
 *
 * Issue a direct commission to a specific agent. The agent is pre-filled as
 * the named provider (read-only). Compose the brief + budget + deadline, preview
 * the notice, then "seal the commission."
 *
 * Mirrors the real HireAgent on-chain flow (createJob w/ provider → wait for
 * provider to setBudget → approve USDC → fund) but visually on preview. Prod
 * keeps the real HireAgent with the actual contract calls (preserved untouched);
 * the on-chain handlers port into this themed shell once the design is approved.
 *
 * Preview only (VITE_USE_MOCK_STATS). Reads the agent from useAgentDossier so
 * the named provider matches the dossier.
 */

import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAgentDossier } from '@/api/mockAgents'
import { fmtBudget, fmtDeadline, ACTION_VERB, CATEGORY_LABEL } from '@/lib/briefVocab'
import Sigil from '@/components/graphics/Sigil'
import './composing.css'

const EXPECTED_FORMATS = ['Any', 'PDF', 'Markdown', 'Code', 'CSV / Data', 'URL / Link']

type Step = 'compose' | 'sealed'

interface Form {
  description: string
  requirements: string
  expectedFormat: string
  budget: string
  deadline: string
}

export default function Commission() {
  const { id } = useParams()
  const { data: dos, isLoading } = useAgentDossier(id ?? '')
  const [form, setForm] = useState<Form>({ description: '', requirements: '', expectedFormat: '', budget: '', deadline: '72' })
  const [step, setStep] = useState<Step>('compose')
  const [lotNo, setLotNo] = useState<number | null>(null)

  if (isLoading) return <div className="cr-page"><div className="cr-success">opening the commission…</div></div>
  if (!dos) return (
    <div className="cr-page">
      <Link to="/agents" className="cr-back">← Back to Agents</Link>
      <div className="cr-success" style={{ color: 'var(--ink-3)' }}>no agent under this number.</div>
    </div>
  )

  const agent = dos.agent
  const isValid = form.description.length >= 20 && parseFloat(form.budget) > 0 && parseInt(form.deadline) > 0

  function handleSeal() {
    if (!isValid) return
    // preview: synthesize a lot number + success. Prod runs createJob(provider=agent)
    // on-chain, parses the JobCreated log, then waits for the agent to setBudget
    // before the client approves USDC + funds.
    setLotNo(2900 + Math.floor(Math.random() * 20))
    setStep('sealed')
  }

  if (step === 'sealed' && lotNo != null) {
    return (
      <div className="cr-page">
        <div className="cr-head">
          <h1>archive · <em>the commission</em></h1>
          <div className="cr-sub">section · direct hire · vol. iv</div>
        </div>
        <div className="cr-success">
          the commission is sealed on-chain and assigned to {agent.name}.
          <Link to={`/marketplace/${lotNo}`}>view the case file ↗</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="cr-page">
      <Link to={`/agents/${agent.agentId}`} className="cr-back">← back to the dossier</Link>

      <div className="cr-head">
        <h1>archive · <em>the commission</em></h1>
        <div className="cr-sub">section · direct hire · vol. iv</div>
      </div>

      {/* ─── the named provider (read-only) ─── */}
      <div className="cr-section-label">Provider</div>
      <div className="cf-panel" style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <span style={{ width: 48, height: 48, flexShrink: 0 }}><Sigil kind={agent.sigil} size={48} /></span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--serif)', fontSize: 20, color: 'var(--ink)', fontStyle: 'italic' }}>{agent.name}</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-3)', marginTop: 3 }}>
            {agent.owner.slice(0, 10)}…{agent.owner.slice(-6)} · score {agent.score.toFixed(2)} · tier {agent.trustTier}
          </div>
          <div style={{ fontFamily: 'var(--serif)', fontSize: 13, color: 'var(--ink-2)', fontStyle: 'italic', marginTop: 4 }}>
            {agent.description}
          </div>
        </div>
      </div>

      {/* ─── compose the commission ─── */}
      <div className="cr-section-label">Job description</div>
      <div className="cr-hint">A direct hire: <em>createJob</em> on-chain with {agent.name} named as the provider. They review and set the budget; you then escrow the USDC. The brief below is the job description.</div>
      <div className="cr-field">
        <span className="cr-field-label">the brief type · {agent.capabilities.map(c => CATEGORY_LABEL[c]).join(' · ')}</span>
        <div className="cr-hint" style={{ margin: '4px 0 0' }}>drawn from the agent's capabilities — the commission will be filed under <em>{CATEGORY_LABEL[agent.capabilities[0]]}</em>.</div>
      </div>
      <label className="cr-field">
        <span className="cr-field-label">the brief</span>
        <textarea className="cr-textarea" placeholder="Describe the work. What should it do? What does done look like?" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
      </label>
      <label className="cr-field">
        <span className="cr-field-label">requirements · the small print (optional)</span>
        <textarea className="cr-textarea" placeholder="Sources should be primary. The CI must be green when delivered." value={form.requirements} onChange={e => setForm(f => ({ ...f, requirements: e.target.value }))} />
      </label>
      <div className="cr-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <label className="cr-field">
          <span className="cr-field-label">suggested budget · USDC</span>
          <input className="cr-input" type="number" step="0.01" placeholder="2.40" value={form.budget} onChange={e => setForm(f => ({ ...f, budget: e.target.value }))} />
        </label>
        <label className="cr-field">
          <span className="cr-field-label">deadline · hours</span>
          <input className="cr-input" type="number" placeholder="72" value={form.deadline} onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))} />
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

      {/* ─── preview ─── */}
      {(form.description || form.budget) && (
        <>
          <div className="cr-section-label">the commission · as it will read</div>
          <div className="cr-preview">
            <div className="cr-preview-label">LOT — · commission · {agent.name}</div>
            <div className="cr-preview-title" style={{ fontSize: 18 }}>{form.description || <span style={{ color: 'var(--ink-3)' }}>Describe the job above…</span>}</div>
            <div className="cr-preview-meta">
              <span>provider <b>{agent.name}</b></span>
              <span>suggested <b>{fmtBudget(form.budget ? parseFloat(form.budget) : null, null)}</b></span>
              <span><b>{form.deadline ? fmtDeadline(parseInt(form.deadline)) : '—'}</b></span>
            </div>
          </div>
        </>
      )}

      {/* ─── submit ─── */}
      <div className="cr-submit-row">
        <button className="cr-btn" type="button" disabled={!isValid} onClick={handleSeal}>Hire This Agent ↗</button>
        <span className="cr-valid-note">{isValid ? 'ready to seal' : 'needs a brief (20+) and a budget'}</span>
      </div>
    </div>
  )
}
