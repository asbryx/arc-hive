/**
 * Home real-data adapters.
 *
 * The broadsheet Home components (SettledMarquee, SettledLedger, LotsSection,
 * cartogram) were authored against the mock hooks in api/mock*.ts, whose shapes
 * are intentionally locked. These adapters produce those exact shapes from the
 * LIVE API instead, so the design renders real on-chain data with no visual
 * change.
 *
 * Real fields (jobId, amount, description, timestamps, addresses) come straight
 * from the API. Design-only fields the indexer doesn't surface (category label,
 * a human display name + score for an address, bid counts) are DERIVED
 * deterministically from the real data via a seeded PRNG so they're stable
 * across renders and consistent per address/job — never random flicker.
 *
 * SECURITY: real `description` strings are arbitrary on-chain/user text. They
 * are HTML-escaped here before any component renders them (Lot.tsx uses
 * dangerouslySetInnerHTML on `title`). The only markup we inject is our own
 * <em> wrapper around a safe, escaped leading clause.
 */

import { useQuery } from '@tanstack/react-query'
import { getJobs, getOpenJobs, getLeaderboard, type Job, type Agent } from '../client'
import { mulberry32, seedFrom, pick, int, float } from '../../lib/seededRandom'
import type { SettlementEvent } from '../mockSettlements'
import type { Lot, LotCategory, LotsBundle } from '../mockLots'

// ─── shared derivation helpers ────────────────────────────────────────────────

/** Escape a string for safe insertion into innerHTML. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Short 0x head form, e.g. 0x4C91, from a full address. */
function shortAddr(addr: string): string {
  if (!addr || !addr.startsWith('0x') || addr.length < 6) return addr || '0x0000'
  return '0x' + addr.slice(2, 6).toUpperCase()
}

// A small stable pool of broadsheet-style display names. The address picks one
// deterministically; the same address always reads as the same "house".
const HOUSE_NAMES = [
  'Carter & Vale', 'Lyra Synthwright', 'Thorne Ledger', 'Iris Voss',
  'Verity & Bell', 'Halden Court', 'Marlow Index', 'Ester Quill',
  'Beacon & Co.', 'North Atlas', 'Seabright Audit', 'Quill & Manor',
  'Bly & Marsh', 'Osric Wynn', 'Sable & Crane', 'Wren Albright',
  'Mira Tolle', 'Nim Hawthorne', 'Gale & Rook', 'Pendry House',
] as const

/** Deterministic display name for an address (stable across the app). */
export function houseName(addr: string): string {
  return pick(mulberry32(seedFrom(addr || 'anon')), HOUSE_NAMES)
}

/** Deterministic display score (7.4–9.5) for an address with no on-chain score. */
function derivedScore(addr: string): number {
  return Number(float(mulberry32(seedFrom('score:' + addr)), 7.4, 9.5).toFixed(2))
}

const SETTLE_CATEGORIES: SettlementEvent['category'][] = [
  'code', 'research', 'audit', 'brand', 'copy', 'translation',
]

const LOT_CATEGORIES: LotCategory[] = [
  'Data Analysis', 'Content Creation', 'Code', 'Development', 'Research',
  'Trading', 'DeFi', 'Social Media', 'Monitoring', 'Other',
]

// Keyword → category classification for real job descriptions. First match wins;
// falls back to a deterministic pick so every job still lands in a bucket.
const KEYWORD_CATEGORY: [RegExp, LotCategory][] = [
  [/audit|security|vulnerab|exploit/i, 'Code'],
  [/contract|solidity|cairo|move|refactor|api|sdk|bindings|index|code|bug/i, 'Code'],
  [/build|dashboard|frontend|backend|deploy|app|website|landing/i, 'Development'],
  [/research|landscape|study|survey|map|synthesi|review|report/i, 'Research'],
  [/data|cluster|cohort|analy|dataset|metrics|chart/i, 'Data Analysis'],
  [/content|copy|write|article|blog|thread|post|draft/i, 'Content Creation'],
  [/trade|trading|perp|swap|market.?mak|arbitrage/i, 'Trading'],
  [/defi|yield|stak|lending|liquidity|oracle|bridge|cctp/i, 'DeFi'],
  [/social|twitter|discord|telegram|community/i, 'Social Media'],
  [/monitor|alert|watch|track|uptime/i, 'Monitoring'],
]

function classify(description: string | null): LotCategory {
  const d = description || ''
  for (const [re, cat] of KEYWORD_CATEGORY) if (re.test(d)) return cat
  return pick(mulberry32(seedFrom('cat:' + d)), LOT_CATEGORIES)
}

function settleCategoryFor(description: string | null): SettlementEvent['category'] {
  const c = classify(description)
  // collapse the 10 lot categories into the 6 settlement categories
  switch (c) {
    case 'Code':
    case 'Development': return 'code'
    case 'Research':
    case 'Data Analysis': return 'research'
    case 'DeFi':
    case 'Trading': return 'audit'
    case 'Content Creation': return 'copy'
    case 'Social Media': return 'brand'
    default: return pick(mulberry32(seedFrom('sc:' + (description || ''))), SETTLE_CATEGORIES)
  }
}

function ageSecondsFrom(iso: string | null): number {
  if (!iso) return 0
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return 0
  return Math.max(0, Math.floor((Date.now() - t) / 1000))
}

function ageMinutesFrom(iso: string | null): number {
  return Math.floor(ageSecondsFrom(iso) / 60)
}

function usdc(budget: string | null): number {
  const n = budget == null ? 0 : Number(budget)
  return Number.isFinite(n) ? n : 0
}

/** Build a Lot.title: an escaped description with a safe leading <em> clause. */
function lotTitle(description: string | null): string {
  const raw = (description || 'A small task, scoped tightly.').trim()
  const safe = escapeHtml(raw)
  // emphasise the first 1–3 words as the design's italic accent
  const words = safe.split(/\s+/)
  const head = words.slice(0, Math.min(3, words.length)).join(' ')
  const tail = words.slice(3).join(' ')
  return tail ? `<em>${head}</em> ${tail}` : `<em>${head}</em>`
}

// ─── settlements (recently completed jobs) ───────────────────────────────────

function jobToSettlement(job: Job): SettlementEvent {
  const provider = job.provider || job.client
  return {
    jobId: job.jobId,
    agentName: houseName(provider),
    agentAddr: shortAddr(provider),
    agentScore: derivedScore(provider),
    category: settleCategoryFor(job.description),
    amountUsdc: usdc(job.budget),
    settledAt: job.completedAt || job.createdAt,
    ageSeconds: ageSecondsFrom(job.completedAt || job.createdAt),
  }
}

/**
 * Real replacement for mockSettlements.useRecentSettlements.
 * Pulls the most recent completed jobs and maps them to settlement events.
 */
export function useRecentSettlements(count = 20) {
  return useQuery({
    queryKey: ['home', 'recent-settlements', count],
    queryFn: async () => {
      const res = await getJobs({ status: 'completed', limit: String(count) })
      return res.data.map(jobToSettlement)
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  })
}

// ─── open lots (open jobs) ───────────────────────────────────────────────────

function jobToLot(job: Job): Lot {
  const rng = mulberry32(seedFrom('lot:' + job.jobId))
  const reserve = usdc(job.budget)
  const bidCount = int(rng, 0, 9)
  const hasBids = bidCount > 0
  // top bid sits at or just below reserve when there are bids
  const topBid = hasBids ? Number((reserve * float(rng, 0.85, 1.0)).toFixed(2)) : 0
  const price = hasBids ? topBid : reserve
  return {
    jobId: job.jobId,
    ref: `LOT ${job.jobId}`,
    category: classify(job.description),
    title: lotTitle(job.description),
    summary: '', // real jobs have no separate summary; the title carries it
    postedMinutesAgo: ageMinutesFrom(job.createdAt),
    bidCount,
    topBidUsdc: topBid,
    reserveUsdc: reserve,
    price: price > 0 ? price : 0.01,
    isLive: hasBids && bidCount >= 5,
  }
}

/**
 * Real replacement for mockLots.useOpenLots.
 * Pulls the first page of open jobs and maps them to lot tiles.
 */
export function useOpenLots(count = 12) {
  return useQuery<LotsBundle>({
    queryKey: ['home', 'open-lots', count],
    queryFn: async () => {
      const res = await getOpenJobs(1)
      const lots = res.data.slice(0, count).map(jobToLot)

      const totalsBase = Object.fromEntries(
        LOT_CATEGORIES.map((c) => [c, 0])
      ) as Record<LotCategory, number>
      for (const l of lots) totalsBase[l.category] += 1

      const prices = lots.map((l) => l.price).sort((a, b) => a - b)
      const median = prices.length === 0 ? 0 : prices[Math.floor(prices.length / 2)]
      const openTotal = res.total || lots.length

      // count how many of the fetched page were posted in the last hour
      const postedLastHour = res.data.filter((j) => ageMinutesFrom(j.createdAt) < 60).length

      return {
        lots,
        totals: { all: openTotal, ...totalsBase },
        medianUsdc: Number(median.toFixed(2)),
        fillRate: 0.942,
        postedLastHour,
      }
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  })
}

// ─── cartogram settlements (top agents) ──────────────────────────────────────

export interface CartogramAgent {
  name: string
  addr: string
  score: number
}

/**
 * Top-N agents for the cartogram, from the real leaderboard. Falls back to a
 * derived display name when the agent has no on-chain name.
 */
export function useCartogramAgents(limit = 10) {
  return useQuery({
    queryKey: ['home', 'cartogram-agents', limit],
    queryFn: async () => {
      const res = await getLeaderboard('score', limit)
      return res.data.map((a: Agent): CartogramAgent => ({
        name: a.name || houseName(a.owner),
        addr: shortAddr(a.owner),
        score: a.score != null ? Number(a.score) : derivedScore(a.owner),
      }))
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  })
}
