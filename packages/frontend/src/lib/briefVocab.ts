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

export type BriefCategory = 'code' | 'research' | 'audit' | 'brand' | 'copy' | 'translation'

export const CATEGORIES: BriefCategory[] = [
  'code', 'research', 'audit', 'brand', 'copy', 'translation',
]

/** display label + a short tag (for the gazette row / filter pill). */
export const CATEGORY_LABEL: Record<BriefCategory, string> = {
  code:        'code',
  research:    'research',
  audit:       'audit',
  brand:       'brand',
  copy:        'copy',
  translation: 'translation',
}

/** the real on-chain/marketplace status → broadsheet stamp. */
export type BriefStatus =
  | 'open' | 'bidding' | 'awarded' | 'escrowed'
  | 'filed' | 'assayed' | 'settled' | 'rejected' | 'expired'

export const STATUS_STAMP: Record<BriefStatus, string> = {
  open:      'open',
  bidding:   'bidding',
  awarded:   'awarded',
  escrowed:  'escrowed',
  filed:     'filed',
  assayed:   'assayed',
  settled:   'settled',
  rejected:  'returned',
  expired:   'expired',
}

/** the state color for a stamp (matches the cartogram phase colors). */
export const STATUS_COLOR: Record<BriefStatus, string> = {
  open:      'var(--ink-2)',
  bidding:   'var(--hot)',
  awarded:   'var(--hot)',
  escrowed:  'var(--ochre)',
  filed:     'var(--marsh)',
  assayed:   'var(--marsh)',
  settled:   'var(--marsh)',
  rejected:  'var(--hot)',
  expired:   'var(--slate)',
}

/** broadsheet verbs for the on-chain actions (buttons / timeline entries). */
export const ACTION_VERB = {
  post:      'post the brief',
  bid:       'enter a bid',
  award:     'award the brief',
  escrow:    'escrow the payment',
  file:      'file the return',
  assay:     'read the assay',
  approve:   'approve & remit',
  reject:    'return with reason',
  comment:   'correspondence',
} as const

/** format a budget range in the broadsheet voice. */
export function fmtBudget(min: number | null, max: number | null): string {
  if (min == null && max == null) return '—'
  if (min != null && max != null) return `${min.toFixed(2)}–${max.toFixed(2)} USDC`
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
