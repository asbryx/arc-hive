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

export type LotCategory =
  | 'Data Analysis' | 'Content Creation' | 'Code' | 'Development' | 'Research'
  | 'Trading' | 'DeFi' | 'Social Media' | 'Monitoring' | 'Other'

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
  { category: 'Research', text: 'Synthesize a <em>2,000-word</em> landscape on RWA platforms.' },
  { category: 'Research', text: 'A <em>quiet</em> review of perpetual-DEX volume since the Q1 thaw.' },
  { category: 'Research', text: 'Map the <em>twelve</em> public chains that still settle below $0.01 / tx.' },
  { category: 'Code',     text: 'Port a <em>Solidity</em> escrow to Move, with full property tests.' },
  { category: 'Code',     text: 'Refactor the <em>indexer</em>: split sync state from event normalisation.' },
  { category: 'Code',     text: 'Write <em>typed</em> bindings for a small Cairo contract, no abi-decoder.' },
  { category: 'Development', text: 'Build a <em>REST API</em> for an order book, with WebSocket fills.' },
  { category: 'Development', text: 'Stand up a <em>staking dashboard</em> — wallet connect, claims, history.' },
  { category: 'Data Analysis', text: 'Cluster <em>90 days</em> of swap data into trader archetypes.' },
  { category: 'Data Analysis', text: 'A <em>cohort study</em> of wallet retention after the Q1 incentive.' },
  { category: 'Content Creation', text: 'A short <em>landing page</em> for a stable-yield protocol. No exclamation marks.' },
  { category: 'Content Creation', text: 'Three press notes for a <em>governance forum</em> launch — measured tone.' },
  { category: 'Trading',  text: 'A <em>backtested</em> mean-reversion strategy on a single pair.' },
  { category: 'Trading',  text: 'Stress-test a <em>liquidation bot</em> against a 30% gap-down.' },
  { category: 'DeFi',     text: 'Design a <em>vault adapter</em> for a new lending market.' },
  { category: 'DeFi',     text: 'A <em>yield route</em> across three pools, with slippage bounds.' },
  { category: 'Social Media', text: 'A two-week <em>posting calendar</em> for a protocol relaunch.' },
  { category: 'Social Media', text: 'Draft ten threads explaining the <em>fee switch</em>, measured tone.' },
  { category: 'Monitoring', text: 'Stand up <em>alerting</em> for an oracle that drifts past 1%.' },
  { category: 'Monitoring', text: 'A watcher that flags any <em>pause()</em> call on a tracked contract.' },
  { category: 'Other',    text: 'A <em>small task</em>, scoped tightly. See the brief for specifics.' },
]

const SUMMARIES: Record<LotCategory, string[]> = {
  'Research': [
    'For private circulation. Restraint and citations expected. Familiarity with the prior literature required.',
    'Sources should be primary; secondary aggregators do not count. Footnotes preferred to prose links.',
    'Five working days. Methodology will be reviewed. No filler paragraphs.',
  ],
  'Code': [
    'Tests required. No "TODO: handle later" comments. The CI must be green when delivered.',
    'Match the existing style in /packages. Do not add a new dependency without note.',
    'Small surface, narrow scope. Do not refactor adjacent code.',
  ],
  'Development': [
    'Ship something that runs. README with setup steps. No half-wired features.',
    'Document the env vars. The reviewer will clone and run it cold.',
  ],
  'Data Analysis': [
    'Show the query. Reproducible from the raw export, not a screenshot.',
    'State the assumptions. Flag every record you dropped and why.',
  ],
  'Content Creation': [
    'Sober tone. Avoid superlatives. Read the prior copy first.',
    'Active voice. Short sentences. No mention of "magic" or "seamless".',
  ],
  'Trading': [
    'Show the backtest window and the assumptions. No curve-fitting.',
    'Include the drawdown, not just the return. Be honest about fees.',
  ],
  'DeFi': [
    'Account for slippage and the failure path. No infinite approvals.',
    'State the risk assumptions. Cite the pools and the rates you used.',
  ],
  'Social Media': [
    'Match the house voice. No engagement-bait. Schedule, do not spam.',
    'Plain claims only — nothing that needs a disclaimer.',
  ],
  'Monitoring': [
    'Alerts must be actionable, not noisy. Include a runbook line per alert.',
    'State the thresholds and why. False positives will be reviewed.',
  ],
  'Other': [
    'Scope is in the brief. Ask before you assume.',
    'A clear deliverable, described above. One revision included.',
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
        'Data Analysis': 0, 'Content Creation': 0, 'Code': 0, 'Development': 0, 'Research': 0,
        'Trading': 0, 'DeFi': 0, 'Social Media': 0, 'Monitoring': 0, 'Other': 0,
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
