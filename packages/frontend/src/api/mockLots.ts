/**
 * mockLots — fake open-lot tiles for section iii.
 *
 * The real /jobs/open endpoint returns a paginated Job[] but the design
 * requires per-lot fields the indexer doesn't yet surface (category,
 * activity bid count, descriptive title with italic accents, summary
 * text, USDC price). We model those here, deterministically, so layout
 * looks production-quality. When the indexer adds them, swap this for a
 * real useOpenLots that pulls from /jobs/open.
 *
 * Tile sizing is decided by the squarified treemap (see
 * lib/squarifiedTreemap.ts) at render time using each lot's `price`.
 * No fixed bento; no row-template planner. The right and bottom edges
 * are flush by construction.
 */

import { useQuery } from '@tanstack/react-query'
import { useStats } from './hooks'
import { mulberry32, seedFrom, pick, int, float } from '../lib/seededRandom'

export type LotCategory = 'code' | 'research' | 'audit' | 'brand' | 'copy' | 'translation'

export interface Lot {
  jobId: number
  ref: string                    // 'LOT 2840'
  category: LotCategory
  title: string                  // may contain <em>...</em> markers
  summary: string
  postedMinutesAgo: number
  bidCount: number
  topBidUsdc: number
  reserveUsdc: number
  /** rendering price (top bid if any, else reserve). Treemap weights by this. */
  price: number
  isLive: boolean                // true if live + ≥ 5 bids
}

interface TitleSeed {
  text: string
  category: LotCategory
}

const TITLES: TitleSeed[] = [
  { category: 'research', text: 'Synthesize a <em>2,000-word</em> landscape on RWA platforms.' },
  { category: 'research', text: 'A <em>quiet</em> review of perpetual-DEX volume since the Q1 thaw.' },
  { category: 'research', text: 'Map the <em>twelve</em> public chains that still settle below $0.01 / tx.' },
  { category: 'code',     text: 'Port a <em>Solidity</em> escrow to Move, with full property tests.' },
  { category: 'code',     text: 'Refactor the <em>indexer</em>: split sync state from event normalisation.' },
  { category: 'code',     text: 'Write <em>typed</em> bindings for a small Cairo contract, no abi-decoder.' },
  { category: 'audit',    text: 'Audit a <em>340-line</em> reward router. Cite every storage slot you read.' },
  { category: 'audit',    text: 'Review the <em>pause-and-rescue</em> path of a small lending vault.' },
  { category: 'brand',    text: 'A new <em>wordmark</em> for an OTC desk. Restraint expected.' },
  { category: 'brand',    text: 'Brand system for an <em>auction-house</em> resale of NFTs.' },
  { category: 'copy',     text: 'A short <em>landing page</em> for a stable-yield protocol. No exclamation marks.' },
  { category: 'copy',     text: 'Three press notes for a <em>governance forum</em> launch — measured tone.' },
  { category: 'translation', text: 'Translate a <em>technical paper</em> on rollup proofs into German.' },
  { category: 'translation', text: 'Localise a <em>1,400-word</em> guide into JP and KR with parallel review.' },
]

const SUMMARIES: Record<LotCategory, string[]> = {
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

/**
 * Build N raw lots. Prices are spread across a roughly log-normal-ish
 * range so the treemap produces visible hierarchy: a couple of loud
 * briefs, several mid-priced, lots of small. Deterministic per seed.
 */
function makeLots(seedKey: string, count: number): Lot[] {
  const rng = mulberry32(seedFrom(seedKey))
  const out: Lot[] = []
  for (let i = 0; i < count; i++) {
    const t = TITLES[i % TITLES.length]
    const cat = t.category
    const bids = int(rng, 0, 14)

    // price tiers: ~10% loud (8–14 USDC), ~25% mid (2.5–6), rest small (0.4–2.2)
    const tier = rng()
    let reserve: number
    if (tier < 0.1) reserve = float(rng, 8, 14)
    else if (tier < 0.35) reserve = float(rng, 2.5, 6)
    else reserve = float(rng, 0.4, 2.2)
    reserve = Number(reserve.toFixed(2))

    const topBid = Number(float(rng, reserve * 0.6, reserve * 1.4).toFixed(2))
    const price  = bids > 0 ? topBid : reserve

    out.push({
      jobId: 2900 - i,
      ref: `LOT ${2900 - i}`,
      category: cat,
      title: t.text,
      summary: pick(rng, SUMMARIES[cat]),
      postedMinutesAgo: int(rng, 3, 180),
      bidCount: bids,
      topBidUsdc: topBid,
      reserveUsdc: reserve,
      price,
      isLive: bids >= 5,
    })
  }
  return out
}

export interface LotsBundle {
  lots: Lot[]
  totals: { all: number } & Record<LotCategory, number>
  medianUsdc: number
  fillRate: number
  postedLastHour: number
}

export function useOpenLots(count = 18) {
  const { data: stats } = useStats()
  const totalJobs = stats?.totalJobs ?? 0
  return useQuery<LotsBundle>({
    queryKey: ['mock', 'open-lots', count, totalJobs],
    queryFn: async () => {
      const lots = makeLots(`lots-${totalJobs}-${count}`, count)
      const totalsBase: Record<LotCategory, number> = {
        code: 0, research: 0, audit: 0, brand: 0, copy: 0, translation: 0,
      }
      for (const l of lots) totalsBase[l.category] += 1
      // grossed-up category totals (the page implies more lots than visible)
      const open = Math.max(stats?.totalJobs ? Math.min(stats.totalJobs, 200) : 128, count)
      const prices = lots.map(l => l.price).sort((a, b) => a - b)
      const median = prices.length === 0 ? 0 : prices[Math.floor(prices.length / 2)]
      return {
        lots,
        totals: { all: open, ...totalsBase },
        medianUsdc: Number(median.toFixed(2)),
        fillRate: 0.942,
        postedLastHour: 8 + (totalJobs % 9),
      }
    },
    staleTime: Infinity,
  })
}
