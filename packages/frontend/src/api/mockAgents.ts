/**
 * mockAgents — preview-only mock of the indexed agent population ("the Register").
 *
 * The Register is the census behind the cartogram: it reuses the map's 10 named
 * agents (Lyra Synthwright 0xA8C3 …) as its top tier, then extends to ~60 indexed
 * practitioners so the census reads as a full population. Full profile detail
 * (score breakdown, jobs, validations, reputation timeline, portfolio) lets the
 * Dossier (A2) be designed end-to-end on preview.
 *
 * Gated by VITE_USE_MOCK_STATS (same flag as the other mocks). Prod hits the real
 * /agents + /agents/:id endpoints. Shape locked to the real Agent / AgentProfile
 * interfaces so the swap is one import. Deterministic (seeded).
 */

import { useQuery } from '@tanstack/react-query'
import { seedFrom, mulberry32, pick, int, float } from '../lib/seededRandom'
import type { BriefCategory } from '../lib/briefVocab'

export type Sigil = 'ring' | 'cross' | 'tri' | 'lens' | 'star' | 'keep'
export type AgentStatus = 'active' | 'idle' | 'new'

export interface RegisteredAgent {
  agentId: number
  name: string
  owner: string
  capabilities: BriefCategory[]
  sigil: Sigil
  score: number             // composite reputation (0-10)
  trustTier: number         // 1-4
  completedJobs: number
  totalEarned: number       // USDC
  lastActiveHoursAgo: number
  registeredDaysAgo: number
  status: AgentStatus
  description: string
}

export interface AgentScoreBreakdown {
  average: number
  totalFeedback: number
  positive: number
  negative: number
  uniqueRaters: number
  completionRate: number    // 0-1
}

export interface AgentWorkRecord {
  total: number
  completed: number
  rejected: number
  expired: number
  totalEarned: number
}

export interface AgentReputationEvent {
  event: string
  detail: string
  txHash: string | null
  daysAgo: number
}

export interface AgentDossier {
  agent: RegisteredAgent
  scoreBreakdown: AgentScoreBreakdown
  work: AgentWorkRecord
  validations: { total: number; approved: number }
  reputation: AgentReputationEvent[]
  portfolio: Array<{ lotNo: number; title: string; category: BriefCategory; settledDaysAgo: number; score: number }>
}

// ── the 10 named cartogram agents (top tier) ──
const NAMED: Array<{ name: string; owner: string; sigil: Sigil; score: number; caps: BriefCategory[] }> = [
  { name: 'Lyra Synthwright', owner: '0xA8C3', sigil: 'star',  score: 9.42, caps: ['code', 'audit'] },
  { name: 'Carter & Vale',    owner: '0x4C91', sigil: 'cross', score: 8.71, caps: ['code', 'research'] },
  { name: 'Thorne Ledger',    owner: '0x12FA', sigil: 'tri',   score: 8.43, caps: ['audit', 'research'] },
  { name: 'Bly & Marsh',      owner: '0x3D8E', sigil: 'cross', score: 8.34, caps: ['copy', 'brand'] },
  { name: 'Osric Wynn',       owner: '0x1F44', sigil: 'tri',   score: 8.22, caps: ['code'] },
  { name: 'Sable & Crane',    owner: '0x41BC', sigil: 'lens',  score: 8.18, caps: ['brand', 'copy'] },
  { name: 'Wren Albright',    owner: '0x6F23', sigil: 'star',  score: 8.12, caps: ['research', 'translation'] },
  { name: 'Mira Tolle',       owner: '0x9D7C', sigil: 'lens',  score: 8.05, caps: ['translation', 'copy'] },
  { name: 'Nim Hawthorne',    owner: '0xD905', sigil: 'keep',  score: 7.97, caps: ['research'] },
  { name: 'Verity & Bell',    owner: '0x7E02', sigil: 'ring',  score: 7.94, caps: ['audit', 'code'] },
]

// ── generated practitioner names (lower tier) ──
const SURNAMES = ['Voss', 'Castle', 'Marlowe', 'Halden', 'Pike', 'Quill', 'Orsa', 'Beacon', 'Marlow', 'Seabright', 'North', 'Atlas', 'Manor', 'Orin', 'Calder', 'Wren', 'Tolle', 'Hawthorne']
const PATTERNS = ['& {s}', '{s} & Co.', '{s} Index', '{s} Audit', 'North {s}', '{s} Ledger', '{s} Holdings', '{s} Trust', '{s} Capital', '{s} & Manor']
const ALL_CAPS: BriefCategory[] = ['code', 'research', 'audit', 'brand', 'copy', 'translation']
const SIGILS: Sigil[] = ['ring', 'cross', 'tri', 'lens', 'star', 'keep']

function fakeFullAddr(seed: string): string {
  let h = seedFrom(seed)
  let s = ''
  for (let i = 0; i < 5; i++) { s += (h >>> 0).toString(16).padStart(8, '0'); h = (h * 1103515245 + 12345) & 0xffffffff }
  return '0x' + s.slice(0, 40)
}

function fakeTx(seed: string): string {
  let s = '', h = seedFrom(seed)
  for (let i = 0; i < 8; i++) { s += (h >>> 0).toString(16).slice(0, 8); h = (h * 1103515245 + 12345) & 0xffffffff }
  return '0x' + s.slice(0, 64)
}

const DESCS = [
  'A measured practitioner. Cites the source before the claim.',
  'Narrow scope, clean returns. Two passes on every commission.',
  'Works the highland provinces. Primary sources only.',
  'Quiet but dependable. The CI is green when the return is filed.',
  'Long on the register. Reputation accrued over many settled briefs.',
  'A specialist. One province, done with care.',
]

function makePopulation(): RegisteredAgent[] {
  const rng = mulberry32(seedFrom('archive-register-v1'))
  const out: RegisteredAgent[] = []
  // named tier (agentId 1-10)
  NAMED.forEach((n, i) => {
    out.push({
      agentId: i + 1,
      name: n.name,
      owner: fakeFullAddr('own-' + n.owner),
      capabilities: n.caps,
      sigil: n.sigil,
      score: n.score,
      trustTier: n.score > 9 ? 4 : n.score > 8.5 ? 3 : 2,
      completedJobs: int(rng, 140, 320),
      totalEarned: Number(float(rng, 400, 2400).toFixed(2)),
      lastActiveHoursAgo: int(rng, 0, 6),
      registeredDaysAgo: int(rng, 120, 400),
      status: 'active',
      description: pick(rng, DESCS),
    })
  })
  // generated tier (agentId 11-60)
  for (let i = 0; i < 50; i++) {
    const id = 11 + i
    const surname = pick(rng, SURNAMES)
    const name = pick(rng, PATTERNS).replace('{s}', surname)
    const nCaps = int(rng, 1, 3)
    const caps: BriefCategory[] = []
    const pool = ALL_CAPS.slice()
    for (let c = 0; c < nCaps; c++) caps.push(pool.splice(int(rng, 0, pool.length), 1)[0])
    const score = Number(float(rng, 5.2, 7.9).toFixed(2))
    const lastActive = int(rng, 0, 240)
    out.push({
      agentId: id,
      name,
      owner: fakeFullAddr('gen-' + id),
      capabilities: caps,
      sigil: pick(rng, SIGILS),
      score,
      trustTier: score > 7.5 ? 2 : 1,
      completedJobs: int(rng, 3, 140),
      totalEarned: Number(float(rng, 8, 600).toFixed(2)),
      lastActiveHoursAgo: lastActive,
      registeredDaysAgo: int(rng, 3, 300),
      status: lastActive < 24 ? (i % 7 === 0 ? 'new' : 'active') : 'idle',
      description: pick(rng, DESCS),
    })
  }
  return out
}

let _pop: RegisteredAgent[] | null = null
function population(): RegisteredAgent[] {
  if (_pop) return _pop
  try { _pop = makePopulation() } catch (e) { console.error('[mockAgents] population failed:', e); _pop = [] }
  return _pop
}

function buildDossier(a: RegisteredAgent): AgentDossier {
  const rng = mulberry32(seedFrom('dossier-' + a.agentId))
  const completionRate = a.score > 8 ? float(rng, 0.94, 0.99) : float(rng, 0.78, 0.93)
  const totalFeedback = int(rng, a.completedJobs, a.completedJobs + 40)
  const positive = Math.round(totalFeedback * float(rng, 0.82, 0.97))
  const expired = int(rng, 0, Math.max(1, Math.floor(a.completedJobs * 0.06)))
  const rejected = int(rng, 0, Math.max(1, Math.floor(a.completedJobs * 0.04)))
  const work: AgentWorkRecord = {
    total: a.completedJobs + expired + rejected,
    completed: a.completedJobs,
    rejected,
    expired,
    totalEarned: a.totalEarned,
  }
  const validations = { total: int(rng, a.completedJobs, a.completedJobs + 20), approved: a.completedJobs }

  // reputation timeline — sealed where on-chain
  const reputation: AgentReputationEvent[] = [
    { event: 'registered', detail: 'Minted on-chain as an ERC-8004 agent.', txHash: fakeTx('reg-' + a.agentId), daysAgo: a.registeredDaysAgo },
    { event: 'first commission', detail: 'Settled the first brief on the register.', txHash: fakeTx('first-' + a.agentId), daysAgo: Math.max(1, a.registeredDaysAgo - int(rng, 2, 30)) },
  ]
  if (a.trustTier >= 2) reputation.push({ event: 'trust earned', detail: `Reached trust tier ${a.trustTier}.`, txHash: null, daysAgo: int(rng, 20, a.registeredDaysAgo - 5) })
  if (a.completedJobs > 50) reputation.push({ event: 'fiftieth brief settled', detail: 'Half a hundred returns filed and approved.', txHash: fakeTx('fifty-' + a.agentId), daysAgo: int(rng, 10, 60) })
  if (a.trustTier >= 3) reputation.push({ event: 'highland standing', detail: `Promoted to tier ${a.trustTier} by the indexer.`, txHash: null, daysAgo: int(rng, 5, 40) })
  reputation.push({ event: 'last active', detail: a.status === 'active' ? 'Working a brief now.' : 'Idle on the register.', txHash: null, daysAgo: Math.floor(a.lastActiveHoursAgo / 24) })
  reputation.sort((x, y) => x.daysAgo - y.daysAgo)

  // portfolio — refs to mock brief lot numbers
  const portfolio = []
  for (let i = 0; i < Math.min(4, Math.max(1, Math.floor(a.completedJobs / 30))); i++) {
    portfolio.push({
      lotNo: 2900 - int(rng, 0, 48),
      title: pick(rng, [
        'A quiet review of perpetual-DEX volume since the Q1 thaw.',
        'Port a Solidity escrow to Move, with full property tests.',
        'Audit a 340-line reward router. Cite every storage slot.',
        'A new wordmark for an OTC desk. Restraint expected.',
        'Translate a technical paper on rollup proofs into German.',
      ]),
      category: pick(rng, a.capabilities),
      settledDaysAgo: int(rng, 2, 90),
      score: Number(float(rng, Math.max(6, a.score - 1), Math.min(10, a.score + 0.5)).toFixed(2)),
    })
  }

  return {
    agent: a,
    scoreBreakdown: { average: a.score, totalFeedback, positive, negative: totalFeedback - positive, uniqueRaters: int(rng, totalFeedback * 0.6, totalFeedback), completionRate },
    work, validations, reputation, portfolio,
  }
}

const USE_MOCK = import.meta.env.VITE_USE_MOCK_STATS === 'true'

export interface ListParams {
  capability?: BriefCategory | ''
  search?: string
  sort?: 'score_desc' | 'jobs_desc' | 'earnings_desc' | 'newest'
  page?: number
  limit?: number
}

export function useRegisteredAgents(params: ListParams = {}) {
  const { capability = '', search = '', sort = 'score_desc', page = 1, limit = 20 } = params
  return useQuery<{ agents: RegisteredAgent[]; total: number; pages: number; capCounts: Record<string, number> }>({
    queryKey: ['mock', 'agents', capability, search, sort, page, limit],
    queryFn: async () => {
      let searched = population().slice()
      if (search) {
        const q = search.toLowerCase()
        searched = searched.filter(a => a.name.toLowerCase().includes(q) || a.owner.toLowerCase().includes(q) || a.capabilities.some(c => c.includes(q)))
      }
      const capCounts: Record<string, number> = { '': searched.length }
      for (const a of searched) for (const c of a.capabilities) capCounts[c] = (capCounts[c] ?? 0) + 1
      let rows = capability ? searched.filter(a => a.capabilities.includes(capability as BriefCategory)) : searched
      rows.sort((a, b) => {
        switch (sort) {
          case 'jobs_desc':      return b.completedJobs - a.completedJobs
          case 'earnings_desc':  return b.totalEarned - a.totalEarned
          case 'newest':         return a.registeredDaysAgo - b.registeredDaysAgo
          default:               return b.score - a.score
        }
      })
      const total = rows.length
      const pages = Math.max(1, Math.ceil(total / limit))
      const start = (page - 1) * limit
      return { agents: rows.slice(start, start + limit), total, pages, capCounts }
    },
    staleTime: Infinity,
    enabled: USE_MOCK,
  })
}

export function useAgentDossier(id: number | string) {
  return useQuery<AgentDossier | null>({
    queryKey: ['mock', 'agent-dossier', id],
    queryFn: async () => {
      const n = typeof id === 'string' ? parseInt(id, 10) : id
      const a = population().find(x => x.agentId === n)
      return a ? buildDossier(a) : null
    },
    staleTime: Infinity,
    enabled: USE_MOCK,
  })
}
