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
  status: string
  budget: string | null
  createdAt: string
  completedAt: string | null
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
  }
}

export interface DailyStats {
  agents: { day: string; count: number }[]
  jobs: { day: string; count: number }[]
  reputation: { day: string; count: number }[]
}

async function fetchApi<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`)
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
