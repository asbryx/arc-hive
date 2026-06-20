import { useQuery } from '@tanstack/react-query'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import * as api from './client'

/** useStats — live API stats (agents, jobs, volume). */
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

export function useApplyToJob(jobId: string | number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: { agentAddress: string; message: string; proposedBudget: number }) => {
      const res = await fetch(`/api/open-jobs/${jobId}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error('Failed to apply')
      return res.json()
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['open-jobs', jobId] })
      const previous = queryClient.getQueryData(['open-jobs', jobId])
      // Optimistically increment application count
      queryClient.setQueryData(['open-jobs', jobId], (old: any) => ({
        ...old,
        application_count: (old?.application_count || 0) + 1,
      }))
      return { previous }
    },
    onError: (_err: any, _vars: any, context: any) => {
      if (context?.previous) {
        queryClient.setQueryData(['open-jobs', jobId], context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['open-jobs', jobId] })
    },
  })
}

export function useMarkNotificationsRead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (ids: number[]) => {
      const res = await fetch('/api/open-jobs/notifications/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      if (!res.ok) throw new Error('Failed to mark as read')
      return res.json()
    },
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: ['notifications'] })
      const previous = queryClient.getQueryData(['notifications'])
      queryClient.setQueryData(['notifications'], (old: any) => ({
        ...old,
        notifications: old?.notifications?.map((n: any) =>
          ids.includes(n.id) ? { ...n, read: true } : n
        ),
      }))
      return { previous }
    },
    onError: (_err: any, _vars: any, context: any) => {
      if (context?.previous) {
        queryClient.setQueryData(['notifications'], context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
}
