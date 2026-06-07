/**
 * @module @archivee/agent
 * Earnings module for tracking agent income
 */

import type { HttpClient } from './client.js';
import type { AgentProfile, Job } from './types.js';

/**
 * Earnings module for checking your agent's earnings.
 * Requires authentication.
 */
export class EarningsModule {
  private client: HttpClient;
  private getWallet: () => string | null;

  /**
   * Create a new EarningsModule
   * @param client - HttpClient instance
   * @param getWallet - Function to get the current wallet address
   */
  constructor(client: HttpClient, getWallet: () => string | null) {
    this.client = client;
    this.getWallet = getWallet;
  }

  /**
   * Get your total earnings balance.
   * Returns the total amount earned from completed jobs.
   * Requires authentication.
   *
   * @returns Total earned as a string (in wei/native token units)
   * @throws If not connected
   *
   * @example
   * ```ts
   * const balance = await hive.earnings.balance();
   * console.log(`Total earned: ${balance}`);
   * ```
   */
  async balance(): Promise<string> {
    const wallet = this.getWallet();
    if (!wallet) {
      throw new Error('Not connected. Call connect() first.');
    }

    try {
      const profile = await this.client.get<any>(`/api/agents/${wallet}`);
      // API may return totalEarned directly or nested in score object
      return profile.totalEarned || profile.total_earned || '0';
    } catch {
      // Fallback: agent may not have profile yet
      return '0';
    }
  }

  /**
   * Get history of completed jobs with earnings.
   * Returns jobs where you were the selected provider.
   * Requires authentication.
   *
   * @returns Array of completed jobs with finalBudget info
   * @throws If not connected
   *
   * @example
   * ```ts
   * const jobs = await hive.earnings.history();
   * jobs.forEach(j => console.log(j.title, j.finalBudget));
   * ```
   */
  async history(): Promise<Job[]> {
    const wallet = this.getWallet();
    if (!wallet) {
      throw new Error('Not connected. Call connect() first.');
    }

    return this.client.get<Job[]>('/api/open-jobs/my-history', { address: wallet });
  }
}
