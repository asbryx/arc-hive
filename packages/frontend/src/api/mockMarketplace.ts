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

export interface DeliverableFile {
  filename: string
  fileType: 'code' | 'doc' | 'data' | 'image' | 'archive' | 'other'
  mimeType: string
  sizeKb: number
  expiresAt: string | null       // ISO; null = expired/deleted
  hoursUntilExpiry: number | null
  downloadable: boolean
}

/** evaluation / assay — the full evaluator result, per deliverable version. */
export interface Evaluation {
  status: 'approved' | 'revision_needed' | 'failed'
  score: number                  // /100
  breakdown: { completeness: number; quality: number; effort: number; format: number }  // /10 each
  reasoning: string
  suggestions: string | null
  llmModel: string               // e.g. "qwen-max · l4"
  evalTxHash: string | null
  at: string
}

/** a single submitted return, with its files + (optional) evaluation. */
export interface DeliverableVersion {
  version: number
  status: 'submitted' | 'approved' | 'revision_requested' | 'failed'
  content: string
  link: string | null
  notes: string | null
  filedAt: string
  clientFeedback: string | null  // shown when revision_requested/failed
  files: DeliverableFile[]
  evaluation: Evaluation | null  // null = still under review ("awaiting assay")
}

/** legacy alias kept for any existing importers. */
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

export interface Settlement {
  onchainJobId: number
  fundTx: string                  // escrow funding tx
  paymentTx: string | null        // payment released to provider (settled)
  completedTx: string | null      // job completed on-chain
  paymentTo: string               // provider address
}

export interface Refund {
  refundTx: string
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
  deadlineAt: string              // ISO — for the live countdown
  expectedFormat: string | null
  maxRevisions: number            // strikes = maxRevisions + 1
  clientAddress: string
  clientName: string
  status: BriefStatus
  applicationCount: number
  createdAt: string
  // detail-only (filled by useBrief)
  bids?: Bid[]
  timeline?: TimelineEntry[]
  deliverable?: Deliverable | null         // legacy single — kept; superseded by versions
  deliverableVersions?: DeliverableVersion[]
  assay?: Assay | null                     // legacy single
  comments?: Comment[]
  settlement?: Settlement | null
  refund?: Refund | null
  failed?: { reason: string; at: string } | null
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
    const deadlineHours = int(rng, 12, 120)
    const postedMinAgo = int(rng, 3, 240)
    const createdAt = new Date(Date.now() - postedMinAgo * 60000).toISOString()
    const deadlineAt = new Date(new Date(createdAt).getTime() + deadlineHours * 3600000).toISOString()
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
      deadlineHours,
      deadlineAt,
      expectedFormat: pick(rng, ['PDF', 'Markdown', 'Code', 'CSV / Data', 'URL / Link', null, null]),
      maxRevisions: int(rng, 1, 3),
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

  // ── deliverable versions + files + evaluations ──
  // Each filed/assayed/settled brief gets 1–3 versioned returns. Later versions
  // exist when an earlier one was returned for revision. The agent who filed is
  // the awarded bidder (or a stand-in).
  const provider = bids.find(x => x.status === 'selected') ?? bids[0] ?? { agentName: pick(rng, AGENT_NAMES), applicantAddress: fakeAddr(`prov-${b.id}`) }
  const fileTypes: DeliverableFile['fileType'][] = ['code', 'doc', 'data', 'image', 'archive', 'other']
  const mimeFor: Record<DeliverableFile['fileType'], string> = {
    code: 'text/x-python', doc: 'application/pdf', data: 'text/csv', image: 'image/png', archive: 'application/zip', other: 'application/octet-stream',
  }
  const fileSuffix: Record<DeliverableFile['fileType'], string> = {
    code: '.py', doc: '.pdf', data: '.csv', image: '.png', archive: '.zip', other: '.bin',
  }

  function makeFiles(seedKey: string, n: number): DeliverableFile[] {
    const out: DeliverableFile[] = []
    for (let j = 0; j < n; j++) {
      const ft = pick(rng, fileTypes)
      const hoursLeft = pick(rng, [3, 7, 14, 22, null])   // null = expired
      const expired = hoursLeft == null
      out.push({
        filename: `return-v${seedKey}-${j}${fileSuffix[ft]}`,
        fileType: ft,
        mimeType: mimeFor[ft],
        sizeKb: int(rng, 2, 4800),
        expiresAt: expired ? null : new Date(Date.now() + hoursLeft! * 3600000).toISOString(),
        hoursUntilExpiry: hoursLeft,
        downloadable: !expired,
      })
    }
    return out
  }

  const llmModels = ['qwen-max · l4', 'claude-sonnet · l3', 'deepseek-v3 · l4', 'gpt-4o · l3']

  function makeEval(seedKey: string, verdict: Evaluation['status']): Evaluation {
    const base = verdict === 'approved' ? [78, 96] : verdict === 'revision_needed' ? [45, 64] : [22, 39]
    const clamp = (n: number) => Math.max(0, Math.min(10, n))
    return {
      status: verdict,
      score: int(rng, base[0], base[1] + 1),
      breakdown: {
        completeness: clamp(int(rng, verdict === 'approved' ? 8 : 4, 11)),
        quality: clamp(int(rng, verdict === 'approved' ? 7 : 4, 11)),
        effort: clamp(int(rng, 6, 11)),
        format: clamp(int(rng, verdict === 'approved' ? 7 : 3, 11)),
      },
      reasoning: verdict === 'approved'
        ? 'Meets the stated requirements with care. Citations are primary where required. One minor formatting gap; otherwise a clean return.'
        : verdict === 'revision_needed'
        ? 'Substantive but incomplete. Two sections lack the primary citations the brief required; the methodology needs a second pass before approval.'
        : 'Falls short of the brief on multiple axes. The return does not address the stated deliverable; recommend the client reclaim escrow.',
      suggestions: verdict === 'approved'
        ? 'a short glossary annex would tighten the next pass.'
        : 'resubmit with primary citations on §3 and §5, and tighten the methodology note.',
      llmModel: pick(rng, llmModels),
      evalTxHash: fakeTx(`eval-${seedKey}`),
      at: new Date(new Date(b.createdAt).getTime() + 90000000).toISOString(),
    }
  }

  const deliverableVersions: DeliverableVersion[] = []
  if (['filed', 'assayed', 'settled'].includes(b.status)) {
    // filed = v1 submitted, under review (no eval yet)
    // assayed = v1 evaluated; settled = v1 approved OR a later version approved
    // For a richer story, settled briefs get an approved final version; assayed
    // briefs get a revision_needed or failed v1 to show that branch.
    if (b.status === 'filed') {
      deliverableVersions.push({
        version: 1, status: 'submitted',
        content: `Return filed per the brief. ${b.summary} See the attached link for the full return.`,
        link: `https://example.com/returns/${b.id}-v1`,
        notes: 'Two passes done. Open to one revision round if needed.',
        filedAt: new Date(new Date(b.createdAt).getTime() + 86400000).toISOString(),
        clientFeedback: null,
        files: makeFiles(`v1`, int(rng, 1, 3)),
        evaluation: null,   // still under review
      })
    } else if (b.status === 'assayed') {
      // show the revision branch: v1 returned, v2 under review
      deliverableVersions.push({
        version: 1, status: 'revision_requested',
        content: `First pass filed per the brief.`,
        link: `https://example.com/returns/${b.id}-v1`,
        notes: 'Initial return.',
        filedAt: new Date(new Date(b.createdAt).getTime() + 86400000).toISOString(),
        clientFeedback: 'Two sections need primary citations; methodology needs a second pass.',
        files: makeFiles(`v1`, 2),
        evaluation: makeEval(`v1`, 'revision_needed'),
      })
      deliverableVersions.push({
        version: 2, status: 'submitted',
        content: `Revised return — citations added to §3 and §5, methodology tightened.`,
        link: `https://example.com/returns/${b.id}-v2`,
        notes: 'Second pass, addressing the revision notes.',
        filedAt: new Date(new Date(b.createdAt).getTime() + 158400000).toISOString(),
        clientFeedback: null,
        files: makeFiles(`v2`, 2),
        evaluation: null,   // awaiting assay
      })
    } else { // settled
      deliverableVersions.push({
        version: 1, status: 'approved',
        content: `Final return filed and approved. ${b.summary}`,
        link: `https://example.com/returns/${b.id}-final`,
        notes: 'Delivered per the brief. One revision round incorporated.',
        filedAt: new Date(new Date(b.createdAt).getTime() + 158400000).toISOString(),
        clientFeedback: null,
        files: makeFiles(`vfinal`, int(rng, 1, 3)),
        evaluation: makeEval(`vfinal`, 'approved'),
      })
    }
  }

  // legacy single deliverable/assay (kept for back-compat) — derived from v1
  const firstVer = deliverableVersions[0] ?? null
  const deliverable: Deliverable | null = firstVer ? {
    content: firstVer.content, link: firstVer.link, notes: firstVer.notes, filedAt: firstVer.filedAt,
  } : null
  const assay: Assay | null = firstVer?.evaluation ? {
    score: firstVer.evaluation.score / 10,
    breakdown: firstVer.evaluation.breakdown,
    reasoning: firstVer.evaluation.reasoning,
    suggestions: firstVer.evaluation.suggestions,
  } : null

  // ── settlement / refund / failed ──
  let settlement: Settlement | null = null
  let refund: Refund | null = null
  let failed: { reason: string; at: string } | null = null
  if (['escrowed', 'filed', 'assayed', 'settled'].includes(b.status)) {
    settlement = {
      onchainJobId: int(rng, 4000, 9000),
      fundTx: fakeTx(`fund-${b.id}`),
      paymentTx: b.status === 'settled' ? fakeTx(`pay-${b.id}`) : null,
      completedTx: b.status === 'settled' ? fakeTx(`done-${b.id}`) : null,
      paymentTo: provider.applicantAddress,
    }
  }
  // a subset of 'assayed' briefs show the FAILED/exhausted-revisions + refund path
  if (b.status === 'assayed' && (b.id % 7 === 0)) {
    failed = { reason: 'All revision attempts exhausted — the return never met the brief.', at: new Date(new Date(b.createdAt).getTime() + 176400000).toISOString() }
    refund = { refundTx: fakeTx(`refund-${b.id}`), at: new Date(new Date(b.createdAt).getTime() + 180000000).toISOString() }
  }
  const revisionCount = deliverableVersions.filter(v => v.status !== 'approved').length

  const comments: Comment[] = []
  if (b.status !== 'open') {
    comments.push({
      id: 1,
      authorAddress: b.clientAddress,
      authorName: b.clientName,
      body: 'A clarification: the window is firm. Please only bid if you can file in time.',
      at: new Date(new Date(b.createdAt).getTime() + 1800000).toISOString(),
    })
    if (provider) {
      comments.push({
        id: 2,
        authorAddress: provider.applicantAddress,
        authorName: provider.agentName,
        body: 'Understood. Estimate reflects the window. Will cite every line.',
        at: new Date(new Date(b.createdAt).getTime() + 5400000).toISOString(),
      })
    }
  }

  return { ...b, bids, timeline, deliverable, deliverableVersions, assay, comments, settlement, refund, failed }
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

export type DeskTab = 'posted' | 'bidding' | 'in_progress' | 'settled'

/** useMyDesk — the connected wallet's own briefs, split by role/state (M4).
 *  Preview: deterministically assigns a subset of the pool as "yours" so the
 *  desk always has content. Prod filters /open-jobs by client/provider addr. */
export function useMyDesk() {
  return useQuery<{ posted: Brief[]; bidding: Brief[]; inProgress: Brief[]; settled: Brief[] }>({
    queryKey: ['mock', 'my-desk'],
    queryFn: async () => {
      const all = pool()
      // deterministic "ownership": every 3rd brief is one you posted, every
      // 4th is one you're bidding on, etc. Stable per build, no wallet needed.
      const posted = all.filter((_, i) => i % 3 === 0)
      const bidding = all.filter((_, i) => i % 4 === 1).filter(b => b.status === 'open' || b.status === 'bidding')
      const inProgress = all.filter((_, i) => i % 5 === 2).filter(b => ['awarded', 'escrowed', 'filed', 'assayed'].includes(b.status))
      // settled: take settled briefs from the pool, then top up with any
      // remaining settled ones so the tab always has a closed ledger to show.
      const settledAll = all.filter(b => b.status === 'settled')
      const settled = settledAll.slice(0, Math.max(6, settledAll.filter((_, i) => i % 2 === 0).length))
      return { posted, bidding, inProgress, settled }
    },
    staleTime: Infinity,
    enabled: USE_MOCK,
  })
}

/* ─── The Ledger (D1) — wallet-scoped full account book ─── */

export interface WalletStats {
  // as client
  posted: number
  activeAsClient: number
  completedAsClient: number
  spent: number          // USDC
  // as provider
  activeAsProvider: number
  completedAsProvider: number
  earned: number         // USDC
  applications: number
}

export interface EarningRow {
  lotNo: number
  title: string
  category: BriefCategory
  amount: number
  assayScore: number
  settledDaysAgo: number
  role: 'client' | 'provider'
}

export type BookView = 'client' | 'provider'

/** useMyLedger — the connected wallet's full books (D1 dashboard).
 *  Preview: deterministic ownership (client briefs = i%3, provider briefs =
 *  i%5) so the ledger always has content without a connected wallet. Mirrors
 *  the real WalletStats split + an earnings list. Prod uses /stats/wallet +
 *  /open-jobs/my-active-all + /open-jobs/my-history. */
export function useMyLedger() {
  return useQuery<{
    stats: WalletStats
    clientActive: Brief[]; clientHistory: Brief[]
    providerActive: Brief[]; providerHistory: Brief[]
    earnings: EarningRow[]
  }>({
    queryKey: ['mock', 'my-ledger'],
    queryFn: async () => {
      const all = pool()
      const rng = mulberry32(seedFrom('ledger-v1'))
      const asClient = all.filter((_, i) => i % 3 === 0)
      const asProvider = all.filter((_, i) => i % 5 === 2)
      const activeOf = (bs: Brief[]) => bs.filter(b => b.status !== 'settled' && b.status !== 'expired')
      const histOf = (bs: Brief[]) => bs.filter(b => b.status === 'settled' || b.status === 'expired')
      const clientActive = activeOf(asClient)
      const clientHistory = histOf(asClient)
      const providerActive = activeOf(asProvider)
      const providerHistory = histOf(asProvider)
      const settledForEarnings = [...clientHistory, ...providerHistory].filter(b => b.status === 'settled')
      const earnings: EarningRow[] = settledForEarnings.slice(0, 12).map(b => ({
        lotNo: b.lotNo,
        title: b.title,
        category: b.category,
        amount: Number(float(rng, (b.budgetMin ?? 1) * 0.9, (b.budgetMax ?? 2) * 1.05).toFixed(2)),
        assayScore: Number(float(rng, 6.8, 9.4).toFixed(2)),
        settledDaysAgo: int(rng, 1, 70),
        role: asClient.includes(b) ? 'client' : 'provider',
      }))
      const sumEarned = earnings.filter(e => e.role === 'provider').reduce((s, e) => s + e.amount, 0)
      const sumSpent = earnings.filter(e => e.role === 'client').reduce((s, e) => s + e.amount, 0)
      const stats: WalletStats = {
        posted: asClient.length,
        activeAsClient: clientActive.length,
        completedAsClient: clientHistory.filter(b => b.status === 'settled').length,
        spent: Number(sumSpent.toFixed(2)),
        activeAsProvider: providerActive.length,
        completedAsProvider: providerHistory.filter(b => b.status === 'settled').length,
        earned: Number(sumEarned.toFixed(2)),
        applications: int(rng, 8, 60),
      }
      return { stats, clientActive, clientHistory, providerActive, providerHistory, earnings }
    },
    staleTime: Infinity,
    enabled: USE_MOCK,
  })
}
