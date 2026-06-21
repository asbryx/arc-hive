/**
 * Dashboard real-data adapters.
 *
 * Map the live wallet-scoped endpoints to the broadsheet shapes the redesign
 * dashboard pages (TheLedger, MyDesk) were authored against in
 * api/mockMarketplace.ts. Shapes are locked; only the data source changes.
 *
 * These endpoints are auth-gated and wallet-scoped: they require a connected
 * wallet (JWT) and an `address` query param. When no wallet is connected the
 * hooks are disabled and the pages show their empty state.
 *
 *   useMyDesk   → /open-jobs/my-active-all + /my-history
 *   useMyLedger → /stats/wallet + /open-jobs/my-active-all + /my-history
 */

import { useQuery } from '@tanstack/react-query'
import { useAccount } from 'wagmi'
import { authFetch } from '../client'
import { jobToBriefForAdapters } from './marketplace'
import type { Brief } from '../mockMarketplace'
import type { WalletStats, EarningRow, BookView } from '../mockMarketplace'
import type { BriefCategory } from '../../lib/briefVocab'

interface RawRoleJob {
  id: number
  jobId?: number | null
  title: string
  description: string
  category: string | null
  budgetMin: string | null
  budgetMax: string | null
  finalBudget?: string | null
  deadlineHours: number
  clientAddress: string
  status: string
  applicationCount: number
  role?: 'client' | 'provider'
  completedAt?: string | null
  createdAt: string
}

function num(v: string | number | null | undefined): number {
  if (v == null) return 0
  const n = typeof v === 'string' ? Number(v) : v
  return Number.isFinite(n) ? n : 0
}

async function fetchRoleJobs(path: string, address: string): Promise<RawRoleJob[]> {
  const res = await authFetch(`${path}?address=${address}`)
  if (!res.ok) return []
  const d = await res.json().catch(() => ({ data: [] }))
  return Array.isArray(d) ? d : (d.data ?? [])
}

// ─── useMyDesk — active/posted/bidding/settled split ─────────────────────────

export function useMyDesk() {
  const { address } = useAccount()
  return useQuery({
    queryKey: ['my-desk', address],
    enabled: !!address,
    queryFn: async () => {
      const addr = address as string
      const [active, history] = await Promise.all([
        fetchRoleJobs('/open-jobs/my-active-all', addr),
        fetchRoleJobs('/open-jobs/my-history', addr),
      ])
      const lower = addr.toLowerCase()

      const posted = active
        .filter((j) => j.clientAddress?.toLowerCase() === lower)
        .map(jobToBriefForAdapters)
      const bidding = active
        .filter((j) => j.role === 'provider' && (j.status === 'open'))
        .map(jobToBriefForAdapters)
      const inProgress = active
        .filter((j) => ['assigned', 'funded', 'in_progress', 'delivered', 'evaluating', 'revision_requested'].includes(j.status))
        .map(jobToBriefForAdapters)
      const settled = history.map(jobToBriefForAdapters)

      return { posted, bidding, inProgress, settled }
    },
    staleTime: 15_000,
  })
}

// ─── useMyLedger — full account book ─────────────────────────────────────────

export function useMyLedger() {
  const { address } = useAccount()
  return useQuery({
    queryKey: ['my-ledger', address],
    enabled: !!address,
    queryFn: async () => {
      const addr = address as string
      const lower = addr.toLowerCase()
      const [statsRes, active, history] = await Promise.all([
        authFetch(`/stats/wallet?address=${addr}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetchRoleJobs('/open-jobs/my-active-all', addr),
        fetchRoleJobs('/open-jobs/my-history', addr),
      ])

      const stats: WalletStats = statsRes
        ? {
            posted: statsRes.posted ?? 0,
            activeAsClient: statsRes.activeAsClient ?? 0,
            completedAsClient: statsRes.completedAsClient ?? 0,
            spent: num(statsRes.spent),
            activeAsProvider: statsRes.activeAsProvider ?? 0,
            completedAsProvider: statsRes.completedAsProvider ?? 0,
            earned: num(statsRes.earned),
            applications: statsRes.applications ?? 0,
          }
        : {
            posted: 0, activeAsClient: 0, completedAsClient: 0, spent: 0,
            activeAsProvider: 0, completedAsProvider: 0, earned: 0, applications: 0,
          }

      const isClientJob = (j: RawRoleJob) => j.clientAddress?.toLowerCase() === lower
      const clientActive = active.filter(isClientJob).map(jobToBriefForAdapters)
      const providerActive = active.filter((j) => !isClientJob(j)).map(jobToBriefForAdapters)
      const clientHistory = history.filter(isClientJob).map(jobToBriefForAdapters)
      const providerHistory = history.filter((j) => !isClientJob(j)).map(jobToBriefForAdapters)

      const earnings: EarningRow[] = history.map((j): EarningRow => {
        const role: BookView = isClientJob(j) ? 'client' : 'provider'
        const settledMs = j.completedAt ? new Date(j.completedAt).getTime() : new Date(j.createdAt).getTime()
        return {
          lotNo: j.jobId ?? j.id,
          title: j.title || j.description?.slice(0, 60) || `Brief ${j.id}`,
          category: (j.category && isCat(j.category) ? j.category : 'Other') as BriefCategory,
          amount: num(j.finalBudget ?? j.budgetMax ?? j.budgetMin),
          assayScore: 0,
          settledDaysAgo: Math.max(0, Math.floor((Date.now() - settledMs) / 86_400_000)),
          role,
        }
      })

      return { stats, clientActive, clientHistory, providerActive, providerHistory, earnings }
    },
    staleTime: 15_000,
  })
}

const CATS = [
  'Data Analysis', 'Content Creation', 'Code', 'Development', 'Research',
  'Trading', 'DeFi', 'Social Media', 'Monitoring', 'Other',
]
function isCat(c: string): boolean {
  return CATS.includes(c)
}

// re-export a Brief mapper shim type marker (kept minimal; real mapper lives in marketplace.ts)
export type { Brief }
