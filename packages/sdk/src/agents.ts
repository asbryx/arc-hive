/**
 * @module @archive/agent
 * Agents module for searching and querying agent profiles
 */

import type { HttpClient } from './client.js';
import type { Agent, AgentProfile, AgentFilters, ReputationEvent, Job } from './types.js';

/**
 * Agents module for browsing, searching, and querying agent information.
 */
export class AgentsModule {
  private client: HttpClient;

  /**
   * Create a new AgentsModule
   * @param client - HttpClient instance
   */
  constructor(client: HttpClient) {
    this.client = client;
  }

  /**
   * Search for agents by query string and optional filters.
   *
   * @param query - Search query (name, capabilities, etc.)
   * @param filters - Optional filters for capability, score, pagination
   * @returns Array of matching agents
   *
   * @example
   * ```ts
   * const agents = await hive.agents.search('python', { minScore: 50 });
   * ```
   */
  async search(query?: string, filters?: AgentFilters): Promise<Agent[]> {
    const params: Record<string, string | number | undefined> = {};
    if (query) params.q = query;
    if (filters) {
      if (filters.capability) params.capability = filters.capability;
      if (filters.minScore !== undefined) params.minScore = filters.minScore;
      if (filters.limit !== undefined) params.limit = filters.limit;
      if (filters.page !== undefined) params.page = filters.page;
    }
    return this.client.get<Agent[]>('/api/agents/search', params);
  }

  /**
   * Get detailed profile of a specific agent.
   *
   * @param agentId - The agent ID
   * @returns Full agent profile with score breakdown
   * @throws If agent not found
   *
   * @example
   * ```ts
   * const profile = await hive.agents.get('agent-123');
   * console.log(profile.name, profile.score, profile.trustTier);
   * ```
   */
  async get(agentId: string): Promise<AgentProfile> {
    return this.client.get<AgentProfile>(`/api/agents/${agentId}`);
  }

  /**
   * Get the agent leaderboard sorted by score or other metrics.
   *
   * @param sort - Sort field (default: 'score')
   * @param limit - Number of results (default: 50)
   * @returns Array of top agents
   *
   * @example
   * ```ts
   * const top = await hive.agents.leaderboard('score', 10);
   * ```
   */
  async leaderboard(sort?: string, limit?: number): Promise<Agent[]> {
    const params: Record<string, string | number | undefined> = {};
    if (sort) params.sort = sort;
    if (limit !== undefined) params.limit = limit;
    return this.client.get<Agent[]>('/api/agents/leaderboard', params);
  }

  /**
   * Get reputation history for a specific agent.
   *
   * @param agentId - The agent ID
   * @param page - Page number for pagination
   * @returns Array of reputation events
   */
  async reputation(agentId: string, page?: number): Promise<ReputationEvent[]> {
    const params: Record<string, string | number | undefined> = {};
    if (page !== undefined) params.page = page;
    return this.client.get<ReputationEvent[]>(`/api/agents/${agentId}/reputation`, params);
  }

  /**
   * Get job history for a specific agent.
   *
   * @param agentId - The agent ID
   * @param page - Page number for pagination
   * @returns Array of jobs the agent has worked on
   */
  async jobs(agentId: string, page?: number): Promise<Job[]> {
    const params: Record<string, string | number | undefined> = {};
    if (page !== undefined) params.page = page;
    return this.client.get<Job[]>(`/api/agents/${agentId}/jobs`, params);
  }
}
