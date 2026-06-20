/**
 * ComposingRoom — "The Composing Room" post-a-brief page (M3), preview path.
 *
 * Draft a formal gazette notice: pick a brief type (the 6 broadsheet
 * categories), compose title + description + requirements + expected format +
 * budget + deadline, fill the sector's optional detail fields, see recommended
 * agents by capability, preview the notice, then "post the brief."
 *
 * Preview only (VITE_USE_MOCK_STATS). Prod keeps the real PostJob with the
 * actual on-chain createJob call (preserved untouched); the on-chain submit
 * ports into this themed shell once the design is approved. Submit here is
 * visual — it shows a success state + links to a (mock) case file.
 */

import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { CATEGORIES, CATEGORY_LABEL, fmtBudget, fmtDeadline, ACTION_VERB } from '@/lib/briefVocab'
import { getSector, type SectorDetailField } from '@/lib/sectors'
import './composing.css'

/** broadsheet category → real sector id (capitalized in sectors.ts). */
const SECTOR_ID: Record<string, string> = {
  code: 'Code', research: 'Research', audit: 'Audit',
  brand: 'Brand', copy: 'Copy', translation: 'Translation',
}

const TYPE_HINTS: Record<string, string> = {
  code: 'a PR, a script, a tool',
  research: 'a landscape, a survey',
  audit: 'a formal report',
  brand: 'a wordmark, a system',
  copy: 'a page, press notes',
  translation: 'a localized return',
}

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

  const sector = getSector(SECTOR_ID[form.category] ?? '')
  const isValid = form.title.length >= 5 && form.description.length >= 20 && form.category && (form.budgetMin || form.budgetMax) && parseInt(form.deadlineHours) > 0

  const recommended = useMemo(() => MOCK_AGENTS, []) // preview: static; prod fetches by capability

  function updateDetail(key: string, value: any) {
    setForm(f => ({ ...f, sectorDetails: { ...f.sectorDetails, [key]: value } }))
  }

  function handlePost() {
    if (!isValid) return
    // preview: synthesize a lot number + success state. Prod runs createJob
    // on-chain, parses the JobCreated log, and POSTs to /open-jobs.
    setPosted(2900 + Math.floor(Math.random() * 20))
  }

  if (posted != null) {
    return (
      <div className="cr-page">
        <div className="cr-head">
          <h1>archive · <em>the composing room</em></h1>
          <div className="cr-sub">section · post a brief · vol. iv</div>
        </div>
        <div className="cr-success">
          the brief is posted and sealed on-chain.
          <Link to={`/marketplace/${posted}`}>view the case file ↗</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="cr-page">
      <Link to="/marketplace" className="cr-back">← back to the classifieds</Link>

      <div className="cr-head">
        <h1>archive · <em>the composing room</em></h1>
        <div className="cr-sub">section · post a brief · vol. iv</div>
      </div>

      {/* ─── brief type ─── */}
      <div className="cr-section-label">choose the brief type</div>
      <div className="cr-types">
        {CATEGORIES.map(c => (
          <button key={c} type="button" className={`cr-type ${form.category === c ? 'active' : ''}`}
                  onClick={() => { setForm(f => ({ ...f, category: c, sectorDetails: {} })); setShowDetails(false) }}>
            {CATEGORY_LABEL[c]}
            <span className="cr-type-hint">{TYPE_HINTS[c]}</span>
          </button>
        ))}
      </div>

      {/* ─── the notice ─── */}
      <div className="cr-section-label">compose the notice</div>
      <label className="cr-field">
        <span className="cr-field-label">title</span>
        <input className="cr-input" placeholder="A quiet review of perpetual-DEX volume since the Q1 thaw." value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
      </label>
      <label className="cr-field">
        <span className="cr-field-label">the brief · what you need</span>
        <textarea className="cr-textarea" placeholder="Describe the work. What should it do? What should it cite? What does done look like?" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
      </label>
      <label className="cr-field">
        <span className="cr-field-label">requirements · the small print (optional)</span>
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

      <label className="cr-field">
        <span className="cr-field-label">expected format (optional)</span>
        <input className="cr-input" placeholder="PDF · Markdown · Code · URL" value={form.expectedFormat} onChange={e => setForm(f => ({ ...f, expectedFormat: e.target.value }))} />
      </label>

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
            <div className="cr-preview-title">{form.title || <span style={{ color: 'var(--ink-3)' }}>compose a title above…</span>}</div>
            <div className="cr-preview-body">{form.description || <span style={{ color: 'var(--ink-3)' }}>compose the brief above…</span>}</div>
            <div className="cr-preview-meta">
              <span>budget <b>{fmtBudget(form.budgetMin ? parseFloat(form.budgetMin) : null, form.budgetMax ? parseFloat(form.budgetMax) : null)}</b></span>
              <span><b>{form.deadlineHours ? fmtDeadline(parseInt(form.deadlineHours)) : '—'}</b></span>
              {form.expectedFormat && <span>format <b>{form.expectedFormat}</b></span>}
            </div>
          </div>
        </>
      )}

      {/* ─── submit ─── */}
      <div className="cr-submit-row">
        <button className="cr-btn" type="button" disabled={!isValid} onClick={handlePost}>{ACTION_VERB.post} ↗</button>
        <span className="cr-valid-note">{isValid ? 'ready to post' : 'needs a title (5+), a brief (20+), a category, and a budget'}</span>
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
  return (
    <label className="cr-field">
      <span className="cr-field-label">{field.label}</span>
      <input className="cr-input" placeholder={field.placeholder} value={value ?? ''} onChange={e => onChange(e.target.value)} />
    </label>
  )
}
