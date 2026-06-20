/**
 * Shared view-model types for the broadsheet pages.
 *
 * Originally defined alongside the preview mock generators (api/mock*.ts);
 * extracted here when those generators were replaced by the real-data
 * adapters (api/adapters/*). These are the locked shapes the components
 * render; the adapters produce them from the live API.
 */

import type { BriefCategory, BriefStatus } from '../lib/briefVocab'

export type { BriefCategory, BriefStatus }

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

export interface ListParams {
  category?: BriefCategory | ''
  search?: string
  sort?: 'newest' | 'budget_desc' | 'budget_asc' | 'deadline' | 'bids'
  page?: number
  limit?: number
}

export type DeskTab = 'posted' | 'bidding' | 'in_progress' | 'settled'

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

export type HonorMetric = 'score' | 'earnings' | 'jobs' | 'reputation'

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

export interface LotsBundle {
  lots: Lot[]
  totals: { all: number } & Record<LotCategory, number>
  medianUsdc: number
  fillRate: number
  postedLastHour: number
}

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
