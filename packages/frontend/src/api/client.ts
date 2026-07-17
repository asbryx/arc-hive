import { applyFetchResult } from './backendStatus'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
  pages?: number
}

export interface Agent {
  agentId: number
  name: string | null
  owner: string
  imageUri: string | null
  capabilities: string[]
  agentType: string | null
  score: number | null
  trustTier: number
  completedJobs: number
  totalEarned: string | null
  lastActiveAt: string | null
  registeredAt: string
}

export interface AgentProfile {
  agentId: number
  name: string | null
  description: string | null
  owner: string
  imageUri: string | null
  metadataUri: string | null
  capabilities: string[]
  agentType: string | null
  version: string | null
  agentWallet: string | null
  registeredAt: string
  score: {
    average: number | null
    totalFeedback: number
    positive: number
    negative: number
    uniqueRaters: number
    completionRate: number | null
  }
  jobs: {
    total: number
    completed: number
    rejected: number
    expired: number
    totalEarned: string | null
  }
  validations: {
    total: number
    approved: number
  }
  trustTier: number
  lastActiveAt: string | null
}

export interface Job {
  jobId: number
  client: string
  provider: string | null
  providerAgentId: number | null
  description: string | null
  status: string
  budget: string | null
  createdAt: string
  completedAt: string | null
  txHash: string | null
  sourceContract: string | null
}

export interface JobDetail extends Job {
  evaluator: string | null
  description: string | null
  paymentToken: string | null
  hook: string | null
  expiredAt: string | null
  submittedAt: string | null
  rejectedAt: string | null
  deliverableHash: string | null
  completionReason: string | null
  rejectionReason: string | null
  paymentReleased: string | null
  platformFeePaid: string | null
  evaluatorFeePaid: string | null
  refundAmount: string | null
  createdTx: string | null
  timeline: {
    event: string
    data: any
    timestamp: string
    txHash: string
  }[]
}

export interface ReputationEvent {
  clientAddress: string
  value: number
  valueDecimals: number
  tag1: string | null
  tag2: string | null
  feedbackUri: string | null
  timestamp: string
  txHash: string
}

export interface Stats {
  totalAgents: number
  totalReputationEvents: number
  totalValidations: number
  totalJobs: number
  completedJobs: number
  totalVolume: string | null
  uniqueClients: number
  uniqueProviders: number
  last7Days: {
    newAgents: number
    newJobs: number
    completedJobs: number
    volume: number
  }
}

export interface DailyStats {
  agents: { day: string; count: number }[]
  jobs: { day: string; count: number }[]
  reputation: { day: string; count: number }[]
  volume: { day: string; count: number }[]
  completed: { day: string; count: number }[]
}

async function fetchApi<T>(path: string): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`)
  } catch (err) {
    // Network error / DNS / CORS / abort — backend is unreachable
    applyFetchResult(null, err)
    throw err
  }
  applyFetchResult(res)
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`)
  }
  return res.json()
}

// Stats
export const getStats = () => fetchApi<Stats>('/stats')
export const getDailyStats = (days = 30) => fetchApi<DailyStats>(`/stats/daily?days=${days}`)

// Agents
export const getAgents = (params?: Record<string, string>) => {
  const qs = params ? '?' + new URLSearchParams(params).toString() : ''
  return fetchApi<PaginatedResponse<Agent>>(`/agents${qs}`)
}
export const searchAgents = (q: string, page = 1) =>
  fetchApi<PaginatedResponse<Agent>>(`/agents/search?q=${encodeURIComponent(q)}&page=${page}`)
export const getLeaderboard = (by = 'score', limit = 20) =>
  fetchApi<{ data: Agent[] }>(`/agents/leaderboard?by=${by}&limit=${limit}`)
export const getAgent = (id: string) => fetchApi<AgentProfile>(`/agents/${id}`)
export const getAgentReputation = (id: string, page = 1) =>
  fetchApi<PaginatedResponse<ReputationEvent>>(`/agents/${id}/reputation?page=${page}`)
export const getAgentJobs = (id: string, page = 1) =>
  fetchApi<PaginatedResponse<Job>>(`/agents/${id}/jobs?page=${page}`)

// Jobs
export const getJobs = (params?: Record<string, string>) => {
  const qs = params ? '?' + new URLSearchParams(params).toString() : ''
  return fetchApi<PaginatedResponse<Job>>(`/jobs${qs}`)
}
export const getOpenJobs = (page = 1) =>
  fetchApi<PaginatedResponse<Job>>(`/jobs/open?page=${page}`)
export const getJob = (id: string) => fetchApi<JobDetail>(`/jobs/${id}`)
export interface MarketplaceStats {
  totalJobs: number
  activeJobs: number
  completedJobs: number
  volume: string | null
  totalApplications: number
  clients: number
  providers: number
}

export const getMarketplaceStats = () => fetchApi<MarketplaceStats>('/stats/marketplace')

export const fetchHealth = () => fetchApi<{ syncing: boolean; liveSync: boolean; block: string | null }>('/health')

// Authenticated fetch — auto-attaches JWT for write operations
export function authFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`
  const method = (options.method || 'GET').toUpperCase()
  const isWrite = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)

  const headers: Record<string, string> = {}

  if (options.headers) {
    if (options.headers instanceof Headers) {
      options.headers.forEach((v, k) => { headers[k] = v })
    } else if (Array.isArray(options.headers)) {
      options.headers.forEach(([k, v]) => { headers[k] = v })
    } else {
      Object.assign(headers, options.headers)
    }
  }

  // Attach JWT for ALL requests (not just writes — some GET endpoints require auth)
  try {
    const stored = localStorage.getItem('arc-hive-auth')
    if (stored) {
      const data = JSON.parse(stored)
      if (data.token && data.expiresAt && new Date(data.expiresAt) > new Date()) {
        headers['Authorization'] = `Bearer ${data.token}`
      }
    }
  } catch {}

  return fetch(url, { ...options, headers })
    .then((res) => {
      applyFetchResult(res)
      return res
    })
    .catch((err) => {
      applyFetchResult(null, err)
      throw err
    })
}
