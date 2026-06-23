/**
 * Marketplace real-data adapters.
 *
 * Map the live /open-jobs endpoints (marketplace DB) to the broadsheet shapes
 * the redesign pages (Marketplace, CaseFile) were authored against in
 * api/mockMarketplace.ts. Shapes are locked; only the data source changes.
 *
 * Real fields come from the API. Display-only fields the marketplace doesn't
 * surface (client display name, a few stamp labels) are derived deterministically
 * per address so they're stable across renders.
 */

import { useQuery } from '@tanstack/react-query'
import { authFetch, hasValidToken } from '../client'
import { houseName } from './home'
import type { BriefCategory } from '../../lib/briefVocab'
import type {
  Brief, Bid, DeliverableVersion, Evaluation, DeliverableFile, Comment, TimelineEntry,
} from '../types'

const API_BASE = (import.meta as any).env.VITE_API_URL || '/api'

const VALID_CATS: BriefCategory[] = [
  'Data Analysis', 'Content Creation', 'Code', 'Development', 'Research',
  'Trading', 'DeFi', 'Social Media', 'Monitoring', 'Other',
]

function normCat(c: string | null | undefined): BriefCategory {
  if (c && (VALID_CATS as string[]).includes(c)) return c as BriefCategory
  return 'Other'
}

// Real /open-jobs status → broadsheet BriefStatus vocabulary.
function mapStatus(s: string | null | undefined): Brief['status'] {
  switch (s) {
    case 'open': return 'open'
    case 'assigned': return 'awarded'
    case 'funded': return 'escrowed'
    case 'in_progress': return 'escrowed'
    case 'delivered': return 'filed'
    case 'evaluating': return 'filed'
    case 'revision_requested': return 'filed'
    case 'completed': return 'settled'
    case 'rejected': return 'rejected'
    case 'expired': return 'expired'
    default: return 'open'
  }
}

function num(v: string | number | null | undefined): number | null {
  if (v == null) return null
  const n = typeof v === 'string' ? Number(v) : v
  return Number.isFinite(n) ? n : null
}

function shortName(addr: string | null | undefined): string {
  return addr ? houseName(addr) : 'a client'
}

// ─── raw API row types (subset we consume) ───────────────────────────────────

interface RawOpenJob {
  id: number
  jobId?: number | null
  onchainJobId?: number | null
  title: string
  description: string
  category: string | null
  requirements: string | null
  budgetMin: string | null
  budgetMax: string | null
  deadlineHours: number
  clientAddress: string
  status: string
  applicationCount: number
  selectedApplicant?: string | null
  finalBudget?: string | null
  maxRevisions?: number
  revisionCount?: number
  fundedTx?: string | null
  fundedAt?: string | null
  completedTx?: string | null
  completedAt?: string | null
  rejectedAt?: string | null
  refundTx?: string | null
  refundedAt?: string | null
  createdAt: string
}

interface RawApplication {
  id: number
  applicantAddress: string
  agentName: string | null
  completedJobs: number
  message: string | null
  proposedBudget: string | null
  status: string
  createdAt: string
}

interface RawDeliverable {
  id: number
  providerAddress: string
  content: string
  link: string | null
  notes: string | null
  version: number
  status: string
  clientFeedback: string | null
  createdAt: string
}

interface RawEvaluation {
  id: number
  version: number
  score: number
  breakdown: { completeness: number; quality: number; effort: number; format: number } | null
  reasoning: string
  suggestions: string | null
  status: 'approved' | 'rejected' | 'failed'
  txHash: string | null
  llmModel: string | null
  createdAt: string
}

interface RawFile {
  id: number
  filename: string
  fileType: string
  mimeType: string
  size: number
  version: number
  expiresAt: string | null
  hoursUntilExpiry: number | null
  downloadable: boolean
}

interface RawComment {
  id: number
  senderAddress: string
  message: string
  createdAt: string
}

// ─── mappers ─────────────────────────────────────────────────────────────────

function deadlineAtFrom(createdAt: string, deadlineHours: number): string {
  const base = new Date(createdAt).getTime()
  const t = Number.isFinite(base) ? base + (deadlineHours || 0) * 3_600_000 : Date.now()
  return new Date(t).toISOString()
}

/** Exported for the dashboard adapter, which maps the same open-job rows. */
export function jobToBriefForAdapters(j: any): Brief {
  return jobToBrief(j as RawOpenJob)
}

function jobToBrief(j: RawOpenJob): Brief {
  return {
    id: j.id,
    lotNo: j.jobId ?? j.onchainJobId ?? j.id,
    category: normCat(j.category),
    title: j.title || j.description?.slice(0, 80) || `Brief ${j.id}`,
    summary: j.description || '',
    description: j.description || '',
    requirements: j.requirements || '',
    budgetMin: num(j.budgetMin),
    budgetMax: num(j.budgetMax),
    deadlineHours: j.deadlineHours || 0,
    deadlineAt: deadlineAtFrom(j.createdAt, j.deadlineHours),
    expectedFormat: null,
    maxRevisions: j.maxRevisions ?? 2,
    clientAddress: j.clientAddress,
    clientName: shortName(j.clientAddress),
    status: mapStatus(j.status),
    applicationCount: j.applicationCount ?? 0,
    createdAt: j.createdAt,
  }
}

function appToBid(a: RawApplication): Bid {
  return {
    id: a.id,
    applicantAddress: a.applicantAddress,
    agentName: a.agentName || houseName(a.applicantAddress),
    completedJobs: a.completedJobs ?? 0,
    message: a.message || '',
    proposedBudget: num(a.proposedBudget) ?? 0,
    status: (a.status === 'selected' ? 'selected' : a.status === 'declined' ? 'declined' : 'pending'),
    createdAt: a.createdAt,
  }
}

const FILE_TYPE_MAP: Record<string, DeliverableFile['fileType']> = {
  code: 'code', doc: 'doc', document: 'doc', data: 'data',
  image: 'image', archive: 'archive',
}

function fileToVm(f: RawFile): DeliverableFile {
  return {
    // `id` isn't in the locked DeliverableFile type, but CaseFile needs it for
    // the download endpoint; carried as an extra field (read via cast).
    id: f.id,
    filename: f.filename,
    fileType: FILE_TYPE_MAP[f.fileType] || 'other',
    mimeType: f.mimeType,
    sizeKb: Math.max(1, Math.round((f.size || 0) / 1024)),
    expiresAt: f.expiresAt,
    hoursUntilExpiry: f.hoursUntilExpiry,
    downloadable: f.downloadable,
  } as DeliverableFile & { id: number }
}

function evalToVm(e: RawEvaluation): Evaluation {
  return {
    status: e.status === 'approved' ? 'approved' : e.status === 'failed' ? 'failed' : 'revision_needed',
    score: e.score ?? 0,
    breakdown: e.breakdown || { completeness: 0, quality: 0, effort: 0, format: 0 },
    reasoning: e.reasoning || '',
    suggestions: e.suggestions,
    llmModel: e.llmModel || 'evaluator',
    evalTxHash: e.txHash,
    at: e.createdAt,
  }
}

function buildVersions(
  deliverables: RawDeliverable[],
  evaluations: RawEvaluation[],
  files: RawFile[],
): DeliverableVersion[] {
  return deliverables
    .slice()
    .sort((a, b) => a.version - b.version)
    .map((d) => {
      const ev = evaluations.find((e) => e.version === d.version)
      const vFiles = files.filter((f) => f.version === d.version)
      const status: DeliverableVersion['status'] =
        d.status === 'approved' ? 'approved'
        : d.status === 'rejected' || d.status === 'revision_requested' ? 'revision_requested'
        : d.status === 'failed' ? 'failed'
        : 'submitted'
      return {
        version: d.version,
        status,
        content: d.content,
        link: d.link,
        notes: d.notes,
        filedAt: d.createdAt,
        clientFeedback: d.clientFeedback,
        files: vFiles.map(fileToVm),
        evaluation: ev ? evalToVm(ev) : null,
      }
    })
}

function commentToVm(c: RawComment): Comment {
  return {
    id: c.id,
    authorAddress: c.senderAddress,
    authorName: houseName(c.senderAddress),
    body: c.message,
    at: c.createdAt,
  }
}

// ─── list: useOpenBriefs ─────────────────────────────────────────────────────

export interface BriefListParams {
  category?: BriefCategory | ''
  search?: string
  sort?: 'newest' | 'budget_desc' | 'budget_asc' | 'deadline' | 'bids'
  page?: number
  limit?: number
}

export function useOpenBriefs(params: BriefListParams = {}) {
  const { category = '', search = '', sort = 'newest', page = 1, limit = 15 } = params
  return useQuery({
    queryKey: ['open-briefs', { category, search, sort, page, limit }],
    queryFn: async () => {
      const qs = new URLSearchParams({ page: String(page), limit: String(limit) })
      const res = await fetch(`${API_BASE}/open-jobs?${qs}`)
      const d = await res.json()
      let briefs: Brief[] = (d.data || []).map(jobToBrief)

      const catCounts: Record<string, number> = { '': briefs.length }
      for (const b of briefs) catCounts[b.category] = (catCounts[b.category] ?? 0) + 1

      if (category) briefs = briefs.filter((b) => b.category === category)
      if (search) {
        const q = search.toLowerCase()
        briefs = briefs.filter(
          (b) => b.title.toLowerCase().includes(q) || b.description.toLowerCase().includes(q)
        )
      }
      briefs.sort((a, b) => {
        switch (sort) {
          case 'budget_desc': return (b.budgetMax ?? 0) - (a.budgetMax ?? 0)
          case 'budget_asc': return (a.budgetMin ?? 0) - (b.budgetMin ?? 0)
          case 'deadline': return a.deadlineHours - b.deadlineHours
          case 'bids': return b.applicationCount - a.applicationCount
          default: return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        }
      })

      return {
        briefs,
        total: d.total ?? briefs.length,
        pages: d.pages ?? 1,
        catCounts,
      }
    },
    staleTime: 15_000,
  })
}

// ─── detail: useBrief ────────────────────────────────────────────────────────

export function useBrief(id: number | string) {
  const key = String(id)
  return useQuery<Brief | null>({
    queryKey: ['brief', key],
    enabled: key.length > 0,
    queryFn: async (): Promise<Brief | null> => {
      const jobRes = await fetch(`${API_BASE}/open-jobs/${key}`)
      if (!jobRes.ok) return null
      const job: RawOpenJob = await jobRes.json()

      // Sub-resources: applications/deliverables/files/comments require auth.
      // Only fetch them when logged in, so anonymous visitors don't trigger
      // 401 console errors on the public CaseFile view (audit L2-3).
      // Evaluations are public.
      const authed = hasValidToken()
      const emptyOk = Promise.resolve([] as never[])
      const [apps, dels, evals, files, comments] = await Promise.all([
        authed ? authFetch(`/open-jobs/${key}/applications`).then((r) => r.ok ? r.json() : []).catch(() => []) : emptyOk,
        authed ? authFetch(`/open-jobs/${key}/deliverables`).then((r) => r.ok ? r.json() : []).catch(() => []) : emptyOk,
        fetch(`${API_BASE}/open-jobs/${key}/evaluations`).then((r) => r.ok ? r.json() : []).catch(() => []),
        authed ? authFetch(`/open-jobs/${key}/files`).then((r) => r.ok ? r.json() : []).catch(() => []) : emptyOk,
        authed ? authFetch(`/open-jobs/${key}/comments`).then((r) => r.ok ? r.json() : []).catch(() => []) : emptyOk,
      ])

      const appsArr: RawApplication[] = Array.isArray(apps) ? apps : (apps.data ?? [])
      const delsArr: RawDeliverable[] = Array.isArray(dels) ? dels : (dels.data ?? [])
      const evalsArr: RawEvaluation[] = Array.isArray(evals) ? evals : (evals.data ?? [])
      const filesArr: RawFile[] = Array.isArray(files) ? files : (files.data ?? [])
      const commentsArr: RawComment[] = Array.isArray(comments) ? comments : (comments.data ?? [])

      const brief = jobToBrief(job)
      brief.bids = appsArr.map(appToBid)
      brief.deliverableVersions = buildVersions(delsArr, evalsArr, filesArr)
      brief.comments = commentsArr.map(commentToVm)

      // settlement / refund stamps from the job row
      if (job.completedTx || job.fundedTx) {
        brief.settlement = {
          onchainJobId: job.onchainJobId ?? job.jobId ?? 0,
          fundTx: job.fundedTx || '',
          paymentTx: null,
          completedTx: job.completedTx || null,
          paymentTo: job.selectedApplicant || '',
        }
      }
      if (job.refundTx) {
        brief.refund = { refundTx: job.refundTx, at: job.refundedAt || job.createdAt }
      }

      const timeline: TimelineEntry[] = [
        { event: 'brief filed', detail: `lot ${brief.lotNo} entered the open market`, txHash: null, at: job.createdAt },
      ]
      if (job.fundedAt) timeline.push({ event: 'escrow funded', detail: 'the client funded the escrow', txHash: job.fundedTx || null, at: job.fundedAt })
      if (job.completedAt) timeline.push({ event: 'job settled', detail: 'the deliverable was approved', txHash: job.completedTx || null, at: job.completedAt })
      brief.timeline = timeline

      return brief
    },
    staleTime: 10_000,
  })
}
