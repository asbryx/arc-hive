/**
 * mockSettlements — placeholder hook for "what cleared the floor in the
 * last hour." The backend doesn't expose this query yet, but the design
 * (cartouche, settled marquee, settled ledger) needs it on the page.
 *
 * Approach: derive a deterministic stream of fake settlement events
 * keyed off the latest known stats refresh, so it doesn't flicker
 * between renders, but updates as real data updates. When the real
 * /jobs/recent-settlements endpoint lands, swap the implementation —
 * the shape is locked.
 *
 * This file is intentionally isolated under api/ so the swap is one
 * import change.
 */

import { useQuery } from '@tanstack/react-query'
import { useStats } from './hooks'
import { mulberry32, seedFrom, pick, int, float } from '../lib/seededRandom'

export interface SettlementEvent {
  jobId: number
  agentName: string
  agentAddr: string         // 0x.... short form (4-char head + 4-char tail)
  agentScore: number
  category: 'code' | 'research' | 'audit' | 'brand' | 'copy' | 'translation'
  amountUsdc: number
  /** ISO timestamp string */
  settledAt: string
  /** seconds elapsed since settlement, frozen at hook resolution */
  ageSeconds: number
}

const NAMES: { name: string; addr: string }[] = [
  { name: 'Carter & Vale',     addr: '0x4C91' },
  { name: 'Lyra Synthwright',  addr: '0xA8C3' },
  { name: 'Thorne Ledger',     addr: '0x3B17' },
  { name: 'Iris Voss',         addr: '0x88BD' },
  { name: 'Verity & Bell',     addr: '0x7E02' },
  { name: 'Halden Court',      addr: '0x55AB' },
  { name: 'Marlow Index',      addr: '0xC102' },
  { name: 'Ester Quill',       addr: '0xF014' },
  { name: 'Beacon & Co.',      addr: '0x912E' },
  { name: 'North Atlas',       addr: '0x6A40' },
  { name: 'Seabright Audit',   addr: '0xDD51' },
  { name: 'Quill & Manor',     addr: '0x2778' },
]
const CATEGORIES: SettlementEvent['category'][] = [
  'code', 'research', 'audit', 'brand', 'copy', 'translation',
]

function generate(seedKey: string, count: number): SettlementEvent[] {
  const rng = mulberry32(seedFrom(seedKey))
  const baseEpoch = Date.now()

  const out: SettlementEvent[] = []
  let cursor = 0
  for (let i = 0; i < count; i++) {
    const who = pick(rng, NAMES)
    cursor += int(rng, 60, 420) // 1–7 minutes between events
    const ageSeconds = cursor
    const settledAt = new Date(baseEpoch - cursor * 1000).toISOString()
    out.push({
      jobId: 2840 - i,
      agentName: who.name,
      agentAddr: who.addr,
      agentScore: Number(float(rng, 7.4, 9.5).toFixed(2)),
      category: pick(rng, CATEGORIES),
      amountUsdc: Number(float(rng, 0.4, 6.2).toFixed(2)),
      settledAt,
      ageSeconds,
    })
  }
  return out
}

/**
 * Returns the most recent N settlements. Stable per (totalJobs bucket)
 * so it only "moves" when the real data actually moves.
 */
export function useRecentSettlements(count = 20) {
  const { data: stats } = useStats()
  // bucket on totalJobs so the mock shifts when something actually settled
  const bucket = stats?.totalJobs ?? 0
  return useQuery({
    queryKey: ['mock', 'recent-settlements', count, bucket],
    queryFn: async () => generate(`settle-${bucket}-${count}`, count),
    staleTime: Infinity,
  })
}
