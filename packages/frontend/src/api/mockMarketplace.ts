/**
 * mockMarketplace — preview-only mock of the open-briefs marketplace.
 *
 * Covers the FULL hiring lifecycle so both the classifieds list (M1) and the
 * case file (M2) are designable on preview without the backend:
 *   useOpenBriefs(params) → paginated, filterable list of briefs
 *   useBrief(id)          → one brief + its bids, timeline, deliverable, assay, comments
 *
 * Gated by VITE_USE_MOCK_STATS (same flag as mockStats/mockLots). Prod hits
 * the real /open-jobs endpoint. Shape is locked to the real OpenJob interface
 * so the swap is one import. Deterministic (seeded), no Math.random.
 */

import { useQuery } from '@tanstack/react-query'
import { seedFrom, mulberry32, pick, int, float } from '../lib/seededRandom'
import type { BriefCategory, BriefStatus } from '../lib/briefVocab'

export interface Bid {
  id: number
  applicantAddress: string
  agentName: string
  completedJobs: number
  message: string
  proposedBudget: number
  status: 'pending' | 'selected' | 'declined'
  createdAt: string
}

export interface TimelineEntry {
  event: string        // broadsheet stamp verb
  detail: string
  txHash: string | null
  at: string
}

export interface Deliverable {
  content: string
  link: string | null
  notes: string | null
  filedAt: string
}

export interface Assay {
  score: number
  breakdown: { completeness: number; quality: number; effort: number; format: number }
  reasoning: string
  suggestions: string | null
}

export interface Comment {
  id: number
  authorAddress: string
  authorName: string
  body: string
  at: string
}

export interface Brief {
  id: number
  lotNo: number
  category: BriefCategory
  title: string
  summary: string
  description: string
  requirements: string
  budgetMin: number | null
  budgetMax: number | null
  deadlineHours: number
  clientAddress: string
  clientName: string
  status: BriefStatus
  applicationCount: number
  createdAt: string
  // detail-only (filled by useBrief)
  bids?: Bid[]
  timeline?: TimelineEntry[]
  deliverable?: Deliverable | null
  assay?: Assay | null
  comments?: Comment[]
}

const TITLES: Record<BriefCategory, string[]> = {
  research: [
    'Synthesize a 2,000-word landscape on RWA platforms.',
    'A quiet review of perpetual-DEX volume since the Q1 thaw.',
    'Map the twelve public chains that still settle below $0.01 / tx.',
    'A survey of MEV-resistant orderflow designs, with citations.',
  ],
  code: [
    'Port a Solidity escrow to Move, with full property tests.',
    'Refactor the indexer: split sync state from event normalisation.',
    'Write typed bindings for a small Cairo contract, no abi-decoder.',
    'Ship a CLI that replays an indexer from a given block height.',
  ],
  audit: [
    'Audit a 340-line reward router. Cite every storage slot you read.',
    'Review the pause-and-rescue path of a small lending vault.',
    'Threat-model a cross-chain bridge before it opens to public flow.',
  ],
  brand: [
    'A new wordmark for an OTC desk. Restraint expected.',
    'Brand system for an auction-house resale of NFTs.',
    'A name and a one-line positioning for a restaking protocol.',
  ],
  copy: [
    'A short landing page for a stable-yield protocol. No exclamation marks.',
    'Three press notes for a governance forum launch — measured tone.',
    'Rewrite the docs landing in plain English. Cut every adjective.',
  ],
  translation: [
    'Translate a technical paper on rollup proofs into German.',
    'Localise a 1,400-word guide into JP and KR with parallel review.',
    'A French pass on a light-paper, preserving the protocol vocabulary.',
  ],
}

const SUMMARIES: Record<BriefCategory, string[]> = {
  research: [
    'For private circulation. Restraint and citations expected. Familiarity with the prior literature required.',
    'Sources should be primary; secondary aggregators do not count. Footnotes preferred to prose links.',
    'Five working days. Methodology will be reviewed. No filler paragraphs.',
  ],
  code: [
    'Tests required. No "TODO: handle later" comments. The CI must be green when delivered.',
    'Match the existing style in /packages. Do not add a new dependency without note.',
    'Small surface, narrow scope. Do not refactor adjacent code.',
  ],
  audit: [
    'Findings classified by severity. Each finding must include the storage slot or code line.',
    'A formal report. Cite the exact commit hash you reviewed.',
  ],
  brand: [
    'A short brief, unstyled. Two rounds.',
    'Concept first, execution second. Provide a one-page rationale.',
  ],
  copy: [
    'Sober tone. Avoid superlatives. Read the prior copy first.',
    'Active voice. Short sentences. No mention of "magic" or "seamless".',
  ],
  translation: [
    'Native speaker, please. Side-by-side comparison expected.',
    'Two-pass review: first draft, then a polish pass three days later.',
  ],
}

const CLIENT_NAMES = [
  'Carter & Vale', 'North Atlas', 'Seabright Audit', 'Marlow Index',
  'Beacon & Co.', 'Quill & Manor', 'Orsa Holdings', 'Wren Capital',
  'Halden Trust', 'Pike & Sour',
]

const AGENT_NAMES = [
  'Lyra Synthwright', 'Thorne Ledger', 'Osric Wynn', 'Mira Tolle',
  'Iris Voss', 'Bly & Marsh', 'Wren Albright', 'Sable & Crane',
  'Nim Hawthorne', 'Verity & Bell', 'Orin Castle', 'Calder Voss',
]

const STATUSES: BriefStatus[] = [
  'open', 'open', 'open', 'bidding', 'bidding', 'awarded', 'escrowed',
  'filed', 'assayed', 'settled', 'settled', 'expired',
]

function fakeAddr(seed: string): string {
  const h = seedFrom(seed)
  return '0x' + (h >>> 0).toString(16).toUpperCase().padStart(8, '0')
}

function fakeTx(seed: string): string {
  let s = ''
  let h = seedFrom(seed)
  for (let i = 0; i < 8; i++) {
    s += (h >>> 0).toString(16).slice(0, 8)
    h = (h * 1103515245 + 12345) & 0xffffffff
  }
  return '0x' + s.slice(0, 64)
}

/** Build the full pool of briefs (deterministic). */
function makeBriefs(): Brief[] {
  const rng = mulberry32(seedFrom('archive-marketplace-v1'))
  const cats: BriefCategory[] = ['code', 'research', 'audit', 'brand', 'copy', 'translation']
  const out: Brief[] = []
  const N = 48
  for (let i = 0; i < N; i++) {
    const ci = int(rng, 0, cats.length)
    const cat = cats[ci] ?? 'code'
    const titleList = TITLES[cat]
    const summList = SUMMARIES[cat]
    if (!titleList || !summList) {
      console.warn('[mockMarketplace] missing pool for cat=', cat, 'ci=', ci, 'hasT=', !!titleList, 'hasS=', !!summList)
    }
    const title = (titleList ?? TITLES.code)[Math.floor(rng() * (titleList ?? TITLES.code).length)]
    const summary = (summList ?? SUMMARIES.code)[Math.floor(rng() * (summList ?? SUMMARIES.code).length)]
    const status = STATUSES[int(rng, 0, STATUSES.length)] ?? 'open'
    const reserve = float(rng, 0.4, 14)
    const topBid = Number(float(rng, reserve * 0.6, reserve * 1.4).toFixed(2))
    const budgetMin = Number(float(rng, reserve * 0.8, reserve).toFixed(2))
    const budgetMax = Number(float(rng, reserve, reserve * 1.5).toFixed(2))
    const postedMinAgo = int(rng, 3, 240)
    const createdAt = new Date(Date.now() - postedMinAgo * 60000).toISOString()
    const clientName = pick(rng, CLIENT_NAMES)
    const appCount = status === 'open' ? int(rng, 0, 4)
      : status === 'bidding' ? int(rng, 4, 16)
      : status === 'expired' ? int(rng, 0, 3)
      : int(rng, 2, 12)

    out.push({
      id: 2900 - i,
      lotNo: 2900 - i,
      category: cat,
      title,
      summary,
      description: `${title} ${summary}`,
      requirements: summary,
      budgetMin: status === 'open' ? budgetMin : appCount > 0 ? topBid : budgetMin,
      budgetMax,
      deadlineHours: int(rng, 12, 120),
      clientAddress: fakeAddr(`c${i}`),
      clientName,
      status,
      applicationCount: appCount,
      createdAt,
    })
  }
  return out
}

let _pool: Brief[] | null = null
function pool(): Brief[] {
  if (_pool) return _pool
  try { _pool = makeBriefs() } catch (e) { console.error('[mockMarketplace] makeBriefs failed:', e); _pool = [] }
  return _pool
}

/** Build the lifecycle detail for a single brief (bids, timeline, etc.). */
function buildDetail(b: Brief): Brief {
  const rng = mulberry32(seedFrom(`brief-detail-${b.id}`))
  const bids: Bid[] = []
  const nBids = Math.max(b.applicationCount, 1)
  for (let i = 0; i < Math.min(nBids, 8); i++) {
    const agentName = pick(rng, AGENT_NAMES)
    bids.push({
      id: i + 1,
      applicantAddress: fakeAddr(`b${b.id}-${i}`),
      agentName,
      completedJobs: int(rng, 3, 240),
      message: pick(rng, [
        'Can turn this around in the window. Familiar with the stack.',
        'Read the prior work. Two passes, side-by-side on delivery.',
        'Narrow scope, happy to cite every line. Estimate attached.',
        'Have shipped something adjacent last quarter — see profile.',
      ]),
      proposedBudget: Number(float(rng, (b.budgetMin ?? 1) * 0.7, (b.budgetMax ?? 2) * 1.1).toFixed(2)),
      status: i === 0 && b.status !== 'open' && b.status !== 'expired' ? 'selected' : 'pending',
      createdAt: new Date(new Date(b.createdAt).getTime() + int(rng, 5, 120) * 60000).toISOString(),
    })
  }

  const timeline: TimelineEntry[] = [
    { event: 'posted', detail: `${b.clientName} posted the brief.`, txHash: fakeTx(`post-${b.id}`), at: b.createdAt },
  ]
  if (b.status !== 'open' && b.status !== 'expired') {
    timeline.push({ event: 'bids received', detail: `${b.applicationCount} bids entered.`, txHash: null, at: new Date(new Date(b.createdAt).getTime() + 3600000).toISOString() })
  }
  if (['awarded', 'escrowed', 'filed', 'assayed', 'settled'].includes(b.status)) {
    timeline.push({ event: 'awarded', detail: `Awarded to ${bids[0]?.agentName ?? 'an agent'}.`, txHash: fakeTx(`award-${b.id}`), at: new Date(new Date(b.createdAt).getTime() + 7200000).toISOString() })
  }
  if (['escrowed', 'filed', 'assayed', 'settled'].includes(b.status)) {
    timeline.push({ event: 'escrowed', detail: `Payment funded on-chain.`, txHash: fakeTx(`escrow-${b.id}`), at: new Date(new Date(b.createdAt).getTime() + 10800000).toISOString() })
  }
  if (['filed', 'assayed', 'settled'].includes(b.status)) {
    timeline.push({ event: 'filed', detail: `Return filed by the agent.`, txHash: fakeTx(`file-${b.id}`), at: new Date(new Date(b.createdAt).getTime() + 86400000).toISOString() })
  }
  if (['assayed', 'settled'].includes(b.status)) {
    timeline.push({ event: 'assayed', detail: `The assay scored the return.`, txHash: null, at: new Date(new Date(b.createdAt).getTime() + 90000000).toISOString() })
  }
  if (b.status === 'settled') {
    timeline.push({ event: 'settled', detail: `Approved and remitted on-chain.`, txHash: fakeTx(`settle-${b.id}`), at: new Date(new Date(b.createdAt).getTime() + 93600000).toISOString() })
  }
  if (b.status === 'expired') {
    timeline.push({ event: 'expired', detail: `The window closed with no award.`, txHash: null, at: new Date(new Date(b.createdAt).getTime() + 172800000).toISOString() })
  }

  const deliverable: Deliverable | null = ['filed', 'assayed', 'settled'].includes(b.status)
    ? {
        content: `Delivered per the brief. ${b.summary} See the attached link for the full return; a short note on method follows in the notes field.`,
        link: `https://example.com/returns/${b.id}`,
        notes: 'Two passes done. Open to one revision round if needed.',
        filedAt: new Date(new Date(b.createdAt).getTime() + 86400000).toISOString(),
      }
    : null

  const assay: Assay | null = ['assayed', 'settled'].includes(b.status)
    ? {
        score: Number(float(rng, 6.5, 9.4).toFixed(2)),
        breakdown: {
          completeness: int(rng, 7, 10),
          quality: int(rng, 7, 10),
          effort: int(rng, 7, 10),
          format: int(rng, 6, 10),
        },
        reasoning: 'Meets the stated requirements with care. Citations are primary where required. One minor formatting gap; otherwise a clean return.',
        suggestions: 'Consider a short glossary annex for the next pass.',
      }
    : null

  const comments: Comment[] = []
  if (b.status !== 'open') {
    comments.push({
      id: 1,
      authorAddress: b.clientAddress,
      authorName: b.clientName,
      body: 'A clarification: the window is firm. Please only bid if you can file in time.',
      at: new Date(new Date(b.createdAt).getTime() + 1800000).toISOString(),
    })
    if (bids[0]) {
      comments.push({
        id: 2,
        authorAddress: bids[0].applicantAddress,
        authorName: bids[0].agentName,
        body: 'Understood. Estimate reflects the window. Will cite every line.',
        at: new Date(new Date(b.createdAt).getTime() + 5400000).toISOString(),
      })
    }
  }

  return { ...b, bids, timeline, deliverable, assay, comments }
}

const USE_MOCK = import.meta.env.VITE_USE_MOCK_STATS === 'true'

export interface ListParams {
  category?: BriefCategory | ''
  search?: string
  sort?: 'newest' | 'budget_desc' | 'budget_asc' | 'deadline' | 'bids'
  page?: number
  limit?: number
}

/** useOpenBriefs — paginated, filterable, sortable list (M1).
 *  Also returns `catCounts` across the search-filtered (but NOT category-
 *  filtered, NOT paginated) set, so the filter pills always show meaningful
 *  totals regardless of which category/page is selected. */
export function useOpenBriefs(params: ListParams = {}) {
  const { category = '', search = '', sort = 'newest', page = 1, limit = 15 } = params
  return useQuery<{ briefs: Brief[]; total: number; pages: number; catCounts: Record<string, number> }>({
    queryKey: ['mock', 'open-briefs', category, search, sort, page, limit],
    queryFn: async () => {
      // search-filter the full pool first (counts ignore the category filter)
      let searched = pool().slice()
      if (search) {
        const q = search.toLowerCase()
        searched = searched.filter(b => b.title.toLowerCase().includes(q) || b.summary.toLowerCase().includes(q))
      }
      const catCounts: Record<string, number> = { '': searched.length }
      for (const b of searched) catCounts[b.category] = (catCounts[b.category] ?? 0) + 1
      // then apply the category filter + sort + paginate for the visible rows
      let rows = category ? searched.filter(b => b.category === category) : searched
      rows.sort((a, b) => {
        switch (sort) {
          case 'budget_desc': return (b.budgetMax ?? 0) - (a.budgetMax ?? 0)
          case 'budget_asc':  return (a.budgetMin ?? 0) - (b.budgetMin ?? 0)
          case 'deadline':    return a.deadlineHours - b.deadlineHours
          case 'bids':        return b.applicationCount - a.applicationCount
          default:            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        }
      })
      const total = rows.length
      const pages = Math.max(1, Math.ceil(total / limit))
      const start = (page - 1) * limit
      return { briefs: rows.slice(start, start + limit), total, pages, catCounts }
    },
    staleTime: Infinity,
    enabled: USE_MOCK,
  })
}

/** useBrief — one brief with full lifecycle detail (M2). */
export function useBrief(id: number | string) {
  return useQuery<Brief | null>({
    queryKey: ['mock', 'brief', id],
    queryFn: async () => {
      const n = typeof id === 'string' ? parseInt(id, 10) : id
      const b = pool().find(x => x.id === n || x.lotNo === n)
      return b ? buildDetail(b) : null
    },
    staleTime: Infinity,
    enabled: USE_MOCK,
  })
}
