/**
 * Agents real-data adapters.
 *
 * Map the live agent endpoints to the broadsheet shapes the redesign pages
 * (Register, Dossier, Commission, HonorRoll) were authored against in
 * api/mockAgents.ts. The shapes are locked; only the data source changes.
 *
 * Real fields (agentId, owner, name, score, trustTier, completedJobs,
 * totalEarned, capabilities, reputation events, job history) come from the API.
 * Design-only fields the indexer doesn't surface (sigil glyph, status label,
 * a fallback display name/description) are derived deterministically per
 * address so they're stable across renders.
 *
 * Most on-chain agents are bare shells (name null, score null, no caps). The
 * list defaults to score_desc so the Register surfaces meaningful, active
 * agents first rather than an endless tail of empty fresh registrations.
 */

import { useQuery } from '@tanstack/react-query'
import {
  getAgents, searchAgents, getAgent, getAgentReputation, getAgentJobs,
  getLeaderboard, type Agent, type AgentProfile, type ReputationEvent, type Job,
} from '../client'
import { mulberry32, seedFrom, pick } from '../../lib/seededRandom'
import { houseName } from './home'
import type { BriefCategory } from '../../lib/briefVocab'
import type {
  RegisteredAgent, AgentDossier, Sigil, AgentStatus, HonorMetric,
} from '../mockAgents'

const SIGILS: Sigil[] = ['ring', 'cross', 'tri', 'lens', 'star', 'keep']
const VALID_CATS: BriefCategory[] = [
  'Data Analysis', 'Content Creation', 'Code', 'Development', 'Research',
  'Trading', 'DeFi', 'Social Media', 'Monitoring', 'Other',
]

/** Deterministic sigil glyph for an address. */
export function sigilKind(addr: string): Sigil {
  return pick(mulberry32(seedFrom('sigil:' + (addr || 'anon'))), SIGILS)
}

/** Hours since an ISO timestamp; large number when never active. */
function hoursAgo(iso: string | null): number {
  if (!iso) return 1e6
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return 1e6
  return Math.max(0, Math.floor((Date.now() - t) / 3_600_000))
}

function daysAgo(iso: string | null): number {
  return Math.floor(hoursAgo(iso) / 24)
}

/** active < 24h, idle if ever active, new if never. */
function statusFor(lastActiveAt: string | null, registeredAt: string): AgentStatus {
  if (lastActiveAt) {
    return hoursAgo(lastActiveAt) < 24 ? 'active' : 'idle'
  }
  // never active: "new" if registered recently, else idle
  return daysAgo(registeredAt) < 7 ? 'new' : 'idle'
}

/** Keep only capabilities that are valid brief categories; default to Other. */
function normCaps(caps: string[] | null | undefined): BriefCategory[] {
  const valid = (caps || []).filter((c): c is BriefCategory =>
    (VALID_CATS as string[]).includes(c)
  )
  return valid.length ? valid : ['Other']
}

function num(v: string | number | null | undefined): number {
  if (v == null) return 0
  const n = typeof v === 'string' ? Number(v) : v
  return Number.isFinite(n) ? n : 0
}

/**
 * Normalise a raw API score to the design's 0–10 band.
 *
 * The API's `score` (composite_score) is a weighted composite, NOT a 0–10 rating.
 * For agents with real work it differentiates meaningfully (observed ~45–60 for
 * the top of the leaderboard); unworked agents carry a large placeholder value
 * (e.g. 10000). The broadsheet renders `score.toFixed(2)` as an out-of-10 rating,
 * so we scale the composite by COMPOSITE_DIVISOR (≈ top-of-board / 10) and clamp
 * to [0,10]. This is a presentation choice, documented so the raw scale isn't
 * silently misread as 9999. `reputationScore` is ignored for display because its
 * own scale is inconsistent across agents.
 */
const COMPOSITE_DIVISOR = 6 // ~60 (best observed composite) maps to 10.0
function score10(rawScore: number | null | undefined, _reputation?: number | null): number {
  const raw = num(rawScore)
  if (raw <= 0) return 0
  // Treat the large placeholder band (unworked agents) as "unscored" → modest baseline.
  if (raw >= 1000) return 0
  const scaled = raw / COMPOSITE_DIVISOR
  return Math.max(0, Math.min(10, Number(scaled.toFixed(2))))
}

// ─── list item: Agent → RegisteredAgent ──────────────────────────────────────

function toRegisteredAgent(a: Agent): RegisteredAgent {
  const name = a.name || houseName(a.owner)
  return {
    agentId: a.agentId,
    name,
    owner: a.owner,
    capabilities: normCaps(a.capabilities),
    sigil: sigilKind(a.owner),
    score: score10(a.score, a.reputationScore),
    trustTier: a.trustTier ?? 0,
    completedJobs: a.completedJobs ?? 0,
    totalEarned: num(a.totalEarned),
    lastActiveHoursAgo: hoursAgo(a.lastActiveAt),
    registeredDaysAgo: daysAgo(a.registeredAt),
    status: statusFor(a.lastActiveAt, a.registeredAt),
    description:
      a.agentType
        ? `${a.agentType} agent indexed on Arc.`
        : 'An indexed agent on the Arc network.',
  }
}

const SORT_MAP: Record<string, string> = {
  score_desc: 'score_desc',
  jobs_desc: 'jobs_desc',
  earnings_desc: 'earnings_desc',
  newest: 'newest',
}

export interface RegisterListParams {
  capability?: string
  search?: string
  sort?: string
  page?: number
  limit?: number
}

/**
 * Real replacement for mockAgents.useRegisteredAgents.
 * Lists indexed agents (score-sorted by default), with optional capability
 * filter and name search.
 */
export function useRegisteredAgents(params: RegisterListParams = {}) {
  const { capability = '', search = '', sort = 'score_desc', page = 1, limit = 20 } = params
  return useQuery({
    queryKey: ['register', 'agents', { capability, search, sort, page, limit }],
    queryFn: async () => {
      // search takes precedence over filters when present
      if (search.trim()) {
        const res = await searchAgents(search.trim(), page)
        const agents = res.data.map(toRegisteredAgent)
        return {
          agents,
          total: res.total,
          pages: res.pages ?? Math.max(1, Math.ceil(res.total / (res.limit || limit))),
          capCounts: { '': res.total } as Record<string, number>,
        }
      }
      const query: Record<string, string> = {
        sort: SORT_MAP[sort] || 'score_desc',
        page: String(page),
        limit: String(limit),
      }
      if (capability) query.capability = capability
      const res = await getAgents(query)
      const agents = res.data.map(toRegisteredAgent)
      return {
        agents,
        total: res.total,
        pages: res.pages ?? Math.max(1, Math.ceil(res.total / (res.limit || limit))),
        capCounts: { '': res.total } as Record<string, number>,
      }
    },
    staleTime: 15_000,
  })
}

// ─── dossier: AgentProfile (+reputation+jobs) → AgentDossier ──────────────────

function repEventToTimeline(e: ReputationEvent) {
  const positive = e.value >= 0
  return {
    event: positive ? 'feedback received' : 'feedback returned',
    detail:
      [e.tag1, e.tag2].filter(Boolean).join(' · ') ||
      `value ${e.value}${e.valueDecimals ? `e-${e.valueDecimals}` : ''} from ${e.clientAddress.slice(0, 10)}…`,
    txHash: e.txHash || null,
    daysAgo: daysAgo(e.timestamp),
  }
}

function jobToPortfolio(j: Job) {
  return {
    lotNo: j.jobId,
    title: j.description || `Brief ${j.jobId}`,
    category: VALID_CATS.includes('Other' as BriefCategory) ? ('Other' as BriefCategory) : ('Other' as BriefCategory),
    settledDaysAgo: daysAgo(j.completedAt || j.createdAt),
    score: 0,
  }
}

/**
 * Real replacement for mockAgents.useAgentDossier.
 * Fetches the profile, reputation timeline, and completed-job portfolio in
 * parallel and assembles the dossier view model.
 */
export function useAgentDossier(id: number | string) {
  const key = String(id)
  return useQuery({
    queryKey: ['dossier', key],
    enabled: key.length > 0,
    queryFn: async (): Promise<AgentDossier> => {
      const profile: AgentProfile = await getAgent(key)
      // reputation + jobs are best-effort; tolerate failures so the dossier
      // still renders the core profile.
      const [rep, jobs] = await Promise.all([
        getAgentReputation(key, 1).catch(() => ({ data: [] as ReputationEvent[], total: 0, page: 1, limit: 0 })),
        getAgentJobs(key, 1).catch(() => ({ data: [] as Job[], total: 0, page: 1, limit: 0 })),
      ])

      const name = profile.name || houseName(profile.owner)
      const agent: RegisteredAgent = {
        agentId: profile.agentId,
        name,
        owner: profile.owner,
        capabilities: normCaps(profile.capabilities),
        sigil: sigilKind(profile.owner),
        score: score10(profile.score.average),
        trustTier: profile.trustTier ?? 0,
        completedJobs: profile.jobs.completed,
        totalEarned: num(profile.jobs.totalEarned),
        lastActiveHoursAgo: hoursAgo(profile.lastActiveAt),
        registeredDaysAgo: daysAgo(profile.registeredAt),
        status: statusFor(profile.lastActiveAt, profile.registeredAt),
        description: profile.description || 'An indexed agent on the Arc network.',
      }

      const completedJobs = jobs.data.filter((j) => /complete/i.test(j.status))
      const portfolio = completedJobs.slice(0, 8).map(jobToPortfolio)

      // A small registration anchor event so the timeline is never empty.
      const timeline = [
        ...rep.data.slice(0, 12).map(repEventToTimeline),
        {
          event: 'registered on-chain',
          detail: `agent #${profile.agentId} entered the identity registry`,
          txHash: null,
          daysAgo: daysAgo(profile.registeredAt),
        },
      ]

      return {
        agent,
        scoreBreakdown: {
          average: score10(profile.score.average),
          totalFeedback: profile.score.totalFeedback,
          positive: profile.score.positive,
          negative: profile.score.negative,
          uniqueRaters: profile.score.uniqueRaters,
          completionRate: profile.score.completionRate ?? 0,
        },
        work: {
          total: profile.jobs.total,
          completed: profile.jobs.completed,
          rejected: profile.jobs.rejected,
          expired: profile.jobs.expired,
          totalEarned: num(profile.jobs.totalEarned),
        },
        validations: {
          total: profile.validations.total,
          approved: profile.validations.approved,
        },
        reputation: timeline,
        portfolio,
      }
    },
    staleTime: 15_000,
  })
}

// ─── honor roll: leaderboard → ranked rows ───────────────────────────────────

/**
 * Real replacement for mockAgents.useHonorRoll.
 * Pulls the leaderboard by the requested metric and shapes the honor-roll view.
 */
export function useHonorRoll(by: HonorMetric = 'score', limit = 20) {
  return useQuery({
    queryKey: ['honor-roll', by, limit],
    queryFn: async () => {
      const res = await getLeaderboard(by, limit)
      const agents = res.data.map(toRegisteredAgent)
      const lead = agents[0]
      const metricLabel =
        by === 'score' ? 'composite standing' :
        by === 'earnings' ? 'earnings' :
        by === 'jobs' ? 'briefs settled' : 'reputation'
      const leadValue = lead
        ? by === 'earnings' ? `${lead.totalEarned.toFixed(0)} USDC`
          : by === 'jobs' ? `${lead.completedJobs} briefs`
          : lead.score.toFixed(2)
        : '—'
      return { agents, metricLabel, leadValue, population: res.data.length }
    },
    staleTime: 30_000,
  })
}
