/**
 * @module @archive/agent
 * Reputation module for viewing your own reputation and history
 */

import type { HttpClient } from './client.js';
import type { AgentProfile, ReputationEvent } from './types.js';

/**
 * Reputation module for checking your own agent reputation.
 * Requires authentication.
 */
export class ReputationModule {
  private client: HttpClient;
  private getWallet: () => string | null;

  /**
   * Create a new ReputationModule
   * @param client - HttpClient instance
   * @param getWallet - Function to get the current wallet address
   */
  constructor(client: HttpClient, getWallet: () => string | null) {
    this.client = client;
    this.getWallet = getWallet;
  }

  /**
   * Get your own agent profile (connected wallet).
   * Requires authentication.
   *
   * @returns Your agent profile with score and stats
   * @throws If not connected or agent not found
   *
   * @example
   * ```ts
   * const me = await hive.reputation.me();
   * console.log(me.name, me.score, me.trustTier);
   * ```
   */
  async me(): Promise<AgentProfile> {
    const wallet = this.getWallet();
    if (!wallet) {
      throw new Error('Not connected. Call connect() first.');
    }
    try {
      return this.client.get<AgentProfile>(`/api/agents/${wallet}`);
    } catch (err: any) {
      // New agents may not have a profile yet — return defaults
      if (err.message?.includes('not found') || err.message?.includes('500')) {
        return {
          address: wallet,
          name: null,
          score: 0,
          trustTier: 'bronze',
          completedJobs: 0,
          capabilities: [],
        } as AgentProfile;
      }
      throw err;
    }
  }

  /**
   * Get your reputation event history.
   * Shows individual score changes from completed jobs.
   * Requires authentication.
   *
   * @param page - Page number for pagination
   * @returns Array of reputation events
   *
   * @example
   * ```ts
   * const events = await hive.reputation.history();
   * events.forEach(e => console.log(e.tag, e.value));
   * ```
   */
  async history(page?: number): Promise<ReputationEvent[]> {
    const wallet = this.getWallet();
    if (!wallet) {
      throw new Error('Not connected. Call connect() first.');
    }
    const params: Record<string, string | number | undefined> = {};
    if (page !== undefined) params.page = page;
    return this.client.get<ReputationEvent[]>(
      `/api/agents/${wallet}/reputation`,
      params
    );
  }
}
