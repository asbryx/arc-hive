/**
 * mockLots — fake open-lot tiles for section iii.
 *
 * The real /jobs/open endpoint returns a paginated Job[] but the design
 * requires per-lot fields the indexer doesn't yet surface (category,
 * activity bid count, descriptive title with italic accents, summary
 * text). We model those here, deterministically, so layout looks
 * production-quality. When the indexer adds them, swap this for a real
 * useOpenLots that pulls from /jobs/open.
 */

import { useQuery } from '@tanstack/react-query'
import { useStats } from './hooks'
import { mulberry32, seedFrom, pick, int, float } from '../lib/seededRandom'

export type LotCategory = 'code' | 'research' | 'audit' | 'brand' | 'copy' | 'translation'
export type LotSize = 'feature' | 'standard' | 'compact' | 'tall' | 'thin'

export interface Lot {
  jobId: number
  ref: string                    // 'LOT 2840'
  category: LotCategory
  size: LotSize
  title: string                  // may contain <em>...</em> markers
  summary: string
  postedMinutesAgo: number
  bidCount: number
  topBidUsdc: number
  reserveUsdc: number
  isLive: boolean                // true if live + ≥ 5 bids
}

const CATS: LotCategory[] = ['code', 'research', 'audit', 'brand', 'copy', 'translation']

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
 * Layout discipline:
 *
 * The grid is 12 columns wide. To guarantee a flush right edge with no
 * holes, every tile spans either 4 or 8 columns. Three sizes only:
 *
 *   feature  — 8 cols × 2 rows  (the editorial lead, top-left)
 *   tall     — 4 cols × 2 rows  (an occasional vertical anchor)
 *   standard — 4 cols × 1 row   (everything else, with summary)
 *   thin     — 4 cols × 1 row   (cheap lots, no summary, denser)
 *
 * 12 / 4 = 3 tiles per row exactly. Feature(8) + standard(4) on the
 * right adds to 12. Tall(4) + standard(4) + standard(4) = 12. Every
 * combination divides cleanly. Right edge is always full.
 *
 * Size is a function of the lot's price so the grid reads as a market
 * heatmap — the loudest, most-expensive briefs literally take more
 * space. The first tile is always the lead (feature). Beyond that, one
 * cap: at most one feature and one tall per visible page so the grid
 * doesn't collapse into a wall of giants.
 */
function sizeForPrice(usdc: number): LotSize {
  if (usdc >= 4.0) return 'feature'
  if (usdc >= 2.5) return 'tall'
  if (usdc >= 1.0) return 'standard'
  return 'thin'
}

function makeLots(seedKey: string, count: number): Lot[] {
  const rng = mulberry32(seedFrom(seedKey))
  const out: Lot[] = []
  let featureUsed = false
  let tallUsed = false
  for (let i = 0; i < count; i++) {
    const t = TITLES[i % TITLES.length]
    const cat = t.category
    const bids = int(rng, 0, 14)
    const reserve = Number(float(rng, 0.35, 6.0).toFixed(2))
    const topBid  = Number(float(rng, reserve * 0.6, reserve * 1.4).toFixed(2))
    const price   = bids > 0 ? topBid : reserve
    let size = sizeForPrice(price)

    // Editorial constraint: first tile is the lead, always feature.
    if (i === 0) size = 'feature'
    if (size === 'feature') {
      if (featureUsed) size = 'standard'
      else featureUsed = true
    }
    if (size === 'tall') {
      if (tallUsed) size = 'standard'
      else tallUsed = true
    }

    out.push({
      jobId: 2900 - i,
      ref: `LOT ${2900 - i}`,
      category: cat,
      size,
      title: t.text,
      summary: pick(rng, SUMMARIES[cat]),
      postedMinutesAgo: int(rng, 3, 180),
      bidCount: bids,
      topBidUsdc: topBid,
      reserveUsdc: reserve,
      isLive: bids >= 5,
    })
  }
  return packForFlushGrid(reshuffleNonAdjacent(out))
}

/**
 * Ensure the visible inventory is a multiple of 3 tiles after the
 * feature. Feature consumes 8 cols × 2 rows, then 2 standards stack
 * on its right (rows 0+1). After that, every row is 3 tiles × 4 cols.
 *
 * Drop trailing tiles that don't fit a complete row, so the grid
 * always ends flush. (Better to show fewer than to show a ragged edge.)
 */
function packForFlushGrid(lots: Lot[]): Lot[] {
  if (lots.length === 0) return lots
  // Tile 0 is feature (8×2). Tiles 1..n must form complete rows of 3.
  // Feature occupies the left 8 cols of rows 0+1. Right 4 cols of
  // rows 0+1 needs 2 stacked tiles. Then every subsequent row is 3
  // tiles. So total tiles = 1 (feature) + 2 (right stack) + 3*K.
  const head = lots.slice(0, 1)
  const rest = lots.slice(1)
  // tall(4×2) on the right of the feature would also work but only if
  // it pairs with another stack on the next column. Simpler rule:
  // demote any non-feature 'tall' tiles in the first 2 positions to
  // standard so the right column of the feature row is clean.
  const fixed: Lot[] = head.slice()
  rest.forEach((lot, i) => {
    if (i < 2 && lot.size === 'tall') fixed.push({ ...lot, size: 'standard' })
    else fixed.push(lot)
  })
  // Now: total non-feature must be 2 + 3K.
  const nonFeature = fixed.length - 1
  // After the 2 stack-fillers, K full rows of 3.
  const drop = nonFeature < 2 ? 0 : (nonFeature - 2) % 3
  return drop > 0 ? fixed.slice(0, fixed.length - drop) : fixed
}

/**
 * 06 §B fix #1 — never let two tiles of the same category palette sit
 * adjacent in the grid. We compute "adjacent" loosely as i-1 in the
 * flat reading order; if two match, swap with the next non-matching
 * tile. Idempotent and deterministic.
 */
export function reshuffleNonAdjacent(lots: Lot[]): Lot[] {
  const arr = lots.slice()
  for (let i = 1; i < arr.length; i++) {
    if (arr[i].category !== arr[i - 1].category) continue
    // find next tile (j > i) whose category differs from both i-1 and (after swap) the prior of j
    for (let j = i + 1; j < arr.length; j++) {
      const swapIntoI = arr[j]
      const swapIntoJ = arr[i]
      const okI = swapIntoI.category !== arr[i - 1].category
      const okJ = j + 1 >= arr.length || swapIntoJ.category !== arr[j + 1].category
      const okJPrev = swapIntoJ.category !== arr[j - 1]?.category
      if (okI && okJ && okJPrev) {
        arr[i] = swapIntoI
        arr[j] = swapIntoJ
        break
      }
    }
  }
  return arr
}

export interface LotsBundle {
  lots: Lot[]
  totals: { all: number } & Record<LotCategory, number>
  medianUsdc: number
  fillRate: number
  postedLastHour: number
}

export function useOpenLots(count = 16) {
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
      return {
        lots,
        totals: { all: open, ...totalsBase },
        medianUsdc: Number((0.7 + (totalJobs % 23) / 100).toFixed(2)),
        fillRate: 0.942,
        postedLastHour: 8 + (totalJobs % 9),
      }
    },
    staleTime: Infinity,
  })
}
