import { useQuery } from '@tanstack/react-query'
import * as api from './client'

export function useStats() {
  return useQuery({
    queryKey: ['stats'],
    queryFn: api.getStats,
    refetchInterval: 15_000,
  })
}

export function useMarketplaceStats() {
  return useQuery({
    queryKey: ['stats', 'marketplace'],
    queryFn: api.getMarketplaceStats,
    refetchInterval: 30_000,
  })
}

export function useDailyStats(days = 30) {
  return useQuery({
    queryKey: ['stats', 'daily', days],
    queryFn: () => api.getDailyStats(days),
    refetchInterval: 60_000,
  })
}

export function useAgents(params?: Record<string, string>) {
  return useQuery({
    queryKey: ['agents', params],
    queryFn: () => api.getAgents(params),
  })
}

export function useAgentSearch(q: string, page = 1) {
  return useQuery({
    queryKey: ['agents', 'search', q, page],
    queryFn: () => api.searchAgents(q, page),
    enabled: q.length > 0,
  })
}

export function useLeaderboard(by = 'score', limit = 20) {
  return useQuery({
    queryKey: ['leaderboard', by, limit],
    queryFn: () => api.getLeaderboard(by, limit),
    refetchInterval: 30_000,
  })
}

export function useAgent(id: string) {
  return useQuery({
    queryKey: ['agent', id],
    queryFn: () => api.getAgent(id),
  })
}

export function useAgentReputation(id: string, page = 1) {
  return useQuery({
    queryKey: ['agent', id, 'reputation', page],
    queryFn: () => api.getAgentReputation(id, page),
  })
}

export function useAgentJobs(id: string, page = 1) {
  return useQuery({
    queryKey: ['agent', id, 'jobs', page],
    queryFn: () => api.getAgentJobs(id, page),
  })
}

export function useJobs(params?: Record<string, string>) {
  return useQuery({
    queryKey: ['jobs', params],
    queryFn: () => api.getJobs(params),
    refetchInterval: 30_000,
  })
}

export function useJob(id: string) {
  return useQuery({
    queryKey: ['job', id],
    queryFn: () => api.getJob(id),
  })
}

export function useIndexerHealth() {
  return useQuery({
    queryKey: ['indexer-health'],
    queryFn: async () => {
      const res = await api.fetchHealth()
      return res
    },
    refetchInterval: 10_000,
    retry: false,
  })
}
