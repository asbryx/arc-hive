/**
 * mockStats — preview-only fake ecosystem stats for the hero strap + any
 * component that reads useStats() while the real /api/stats endpoint is
 * unreachable on Vercel preview (the API needs DATABASE_URL which isn't set
 * on preview envs, so /stats returns 500 → the strap shows "—").
 *
 * Same pattern as mockLots / mockSettlements: deterministic, isolated under
 * api/, shape-locked to the real Stats interface so the swap is one line.
 * PROD (arcs-hive.vercel.app / any deploy where VITE_USE_MOCK_STATS is not
 * "true") keeps using the real API via the real useStats in hooks.ts.
 *
 * When the indexer is live on preview, delete this guard and the hooks.ts
 * re-export — nothing else changes.
 */

import { useQuery } from '@tanstack/react-query'
import type { Stats } from './client'
import { seedFrom, mulberry32 } from '../lib/seededRandom'

/** believable, stable-on-preview ecosystem numbers. Deterministic per build. */
const MOCK: Stats = (() => {
  const seed = seedFrom('archive-preview-stats-v1')
  const rng = mulberry32(seed)
  // big-but-plausible agent population that grows slowly per "refresh"
  const totalAgents = 441_577 + Math.floor(rng() * 1200)
  const totalJobs = 3_287_126 + Math.floor(rng() * 400)
  return {
    totalAgents,
    totalReputationEvents: totalAgents * 7 + Math.floor(rng() * 5000),
    totalValidations: Math.floor(totalAgents * 0.34),
    totalJobs,
    completedJobs: Math.floor(totalJobs * 0.71),
    totalVolume: '184263.42',
    uniqueClients: Math.floor(totalAgents * 0.18),
    uniqueProviders: Math.floor(totalAgents * 0.41),
    last7Days: {
      newAgents: 1_754 + Math.floor(rng() * 60),
      newJobs: 4_820 + Math.floor(rng() * 80),
      completedJobs: 3_412 + Math.floor(rng() * 60),
      volume: 28_440 + Math.floor(rng() * 500),
    },
  } as Stats
})()

export function useMockStats() {
  return useQuery<Stats>({
    queryKey: ['mock', 'stats'],
    queryFn: async () => MOCK,
    staleTime: 60_000,   // re-derive every minute so the strap can tick gently
  })
}
