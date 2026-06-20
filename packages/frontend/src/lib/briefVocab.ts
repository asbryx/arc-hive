/**
 * briefVocab — the shared broadsheet vocabulary for the marketplace.
 *
 * One source of truth across the classifieds list (M1), the case file (M2),
 * the composing room (M3), and my desk (M4). The 6 categories match the home
 * page's lots grid exactly (see api/mockLots.ts LotCategory) so the whole
 * publication speaks one language.
 *
 * On-chain open_jobs statuses are remapped to broadsheet "stamps" — the
 * printed-record voice that makes the on-chain lifecycle legible.
 */

export type BriefCategory =
  | 'Data Analysis' | 'Content Creation' | 'Code' | 'Development' | 'Research'
  | 'Trading' | 'DeFi' | 'Social Media' | 'Monitoring' | 'Other'

export const CATEGORIES: BriefCategory[] = [
  'Data Analysis', 'Content Creation', 'Code', 'Development', 'Research',
  'Trading', 'DeFi', 'Social Media', 'Monitoring', 'Other',
]

/** display label (identity — the sector string is its own label). */
export const CATEGORY_LABEL: Record<BriefCategory, string> = {
  'Data Analysis':    'Data Analysis',
  'Content Creation': 'Content Creation',
  'Code':             'Code',
  'Development':      'Development',
  'Research':        'Research',
  'Trading':         'Trading',
  'DeFi':            'DeFi',
  'Social Media':     'Social Media',
  'Monitoring':      'Monitoring',
  'Other':           'Other',
}

/** slug for CSS class names / data attributes (no spaces). */
export function categorySlug(cat: string): string {
  return cat.toLowerCase().replace(/\s+/g, '-')
}

/** the real on-chain/marketplace status → broadsheet stamp. */
export type BriefStatus =
  | 'open' | 'bidding' | 'awarded' | 'escrowed'
  | 'filed' | 'assayed' | 'settled' | 'rejected' | 'expired'

export const STATUS_STAMP: Record<BriefStatus, string> = {
  open:      'Open',
  bidding:   'Open',
  awarded:   'Assigned',
  escrowed:  'Funded',
  filed:     'Submitted',
  assayed:   'Evaluating',
  settled:   'Completed',
  rejected:  'Revision Requested',
  expired:   'Expired',
}

/** the state color for a stamp (matches the cartogram phase colors). */
export const STATUS_COLOR: Record<BriefStatus, string> = {
  open:      'var(--ink-2)',
  bidding:   'var(--ink-2)',
  awarded:   'var(--hot)',
  escrowed:  'var(--ochre)',
  filed:     'var(--marsh)',
  assayed:   'var(--marsh)',
  settled:   'var(--marsh)',
  rejected:  'var(--hot)',
  expired:   'var(--slate)',
}

/** standard verbs for the on-chain actions (buttons / timeline entries). */
export const ACTION_VERB = {
  post:      'Post Job',
  bid:       'Apply',
  award:     'Select',
  escrow:    'Fund Job',
  file:      'Submit Deliverable',
  assay:     'Evaluation',
  approve:   'Approve',
  reject:    'Reject',
  comment:   'Discussion',
} as const

/** format a budget range in the broadsheet voice (always low→high). */
export function fmtBudget(min: number | null, max: number | null): string {
  if (min == null && max == null) return '—'
  if (min != null && max != null) {
    const lo = Math.min(min, max), hi = Math.max(min, max)
    return lo === hi ? `${lo.toFixed(2)} USDC` : `${lo.toFixed(2)}–${hi.toFixed(2)} USDC`
  }
  const v = (max ?? min)!
  return `${v.toFixed(2)} USDC`
}

/** format a deadline (hours from now) as a broadsheet phrase. */
export function fmtDeadline(hours: number): string {
  if (hours < 24) return `${hours}h to file`
  const d = Math.round(hours / 24)
  return `${d}d to file`
}

/** short elapsed-time label ("2h ago", "3d ago"). */
export function fmtAgo(iso: string): string {
  const mins = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (mins < 60) return `${mins}m ago`
  const h = Math.floor(mins / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}
