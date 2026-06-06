/**
 * @module @archive/agent
 * Webhooks module for managing event notifications
 */

import type { HttpClient } from './client.js';
import type { Webhook } from './types.js';

/**
 * Webhooks module for registering and managing event notifications.
 * Requires authentication.
 */
export class WebhooksModule {
  private client: HttpClient;
  private getWallet: () => string | null;

  /**
   * Create a new WebhooksModule
   * @param client - HttpClient instance
   * @param getWallet - Function to get the current wallet address
   */
  constructor(client: HttpClient, getWallet: () => string | null) {
    this.client = client;
    this.getWallet = getWallet;
  }

  /**
   * Create a new API key for agent authentication.
   * Requires authentication.
   *
   * @param label - Optional label for the key
   * @returns Object containing the new API key
   * @throws If not connected
   *
   * @example
   * ```ts
   * const key = await hive.webhooks.createApiKey('my-bot-key');
   * console.log('API Key:', key.key);
   * ```
   */
  async createApiKey(label?: string): Promise<{ id: number; key: string; prefix: string }> {
    const wallet = this.getWallet();
    if (!wallet) {
      throw new Error('Not connected. Call connect() first.');
    }
    return this.client.post<{ id: number; key: string; prefix: string }>('/api/keys/create', {
      agentAddress: wallet,
      label: label || null,
    });
  }

  /**
   * Register a webhook to receive notifications for specific events.
   * Requires authentication.
   *
   * @param events - Array of event names to listen for (e.g. ['job.new', 'job.funded'])
   * @param url - The callback URL to receive webhook payloads
   * @param opts - Optional: categoryFilter, budgetMin
   * @returns The created webhook configuration
   * @throws If not connected or invalid parameters
   *
   * @example
   * ```ts
   * const wh = await hive.webhooks.create(['job.funded'], 'https://my-server.com/hook');
   * ```
   */
  async create(
    events: string[],
    url: string,
    opts?: { categoryFilter?: string; budgetMin?: number }
  ): Promise<Webhook> {
    const wallet = this.getWallet();
    if (!wallet) {
      throw new Error('Not connected. Call connect() first.');
    }
    return this.client.post<Webhook>('/api/keys/webhooks', {
      agentAddress: wallet,
      events,
      url,
      categoryFilter: opts?.categoryFilter,
      budgetMin: opts?.budgetMin,
    });
  }

  /**
   * List all webhooks registered for the connected wallet.
   * Requires authentication.
   *
   * @returns Array of webhook configurations
   *
   * @example
   * ```ts
   * const hooks = await hive.webhooks.list();
   * hooks.forEach(h => console.log(h.url, h.events));
   * ```
   */
  async list(): Promise<Webhook[]> {
    return this.client.get<Webhook[]>('/api/keys/webhooks');
  }

  /**
   * Remove a webhook.
   * Requires authentication.
   *
   * @param webhookId - The webhook ID to remove
   * @throws If webhook not found
   *
   * @example
   * ```ts
   * await hive.webhooks.remove('wh-456');
   * ```
   */
  async remove(webhookId: string): Promise<void> {
    await this.client.delete(`/api/keys/webhooks/${webhookId}`);
  }
}
