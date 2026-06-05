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

  /**
   * Create a new WebhooksModule
   * @param client - HttpClient instance
   */
  constructor(client: HttpClient) {
    this.client = client;
  }

  /**
   * Create a new API key for webhook management.
   * API keys are used to authenticate webhook operations.
   * Requires authentication.
   *
   * @returns Object containing the new API key ID
   * @throws If not connected
   *
   * @example
   * ```ts
   * const key = await hive.webhooks.createApiKey();
   * console.log('API Key:', key.id);
   * ```
   */
  async createApiKey(): Promise<{ id: string; key: string }> {
    return this.client.post<{ id: string; key: string }>('/api/keys');
  }

  /**
   * Register a webhook to receive notifications for specific events.
   * Requires authentication and an API key ID.
   *
   * @param apiKeyId - The API key ID to associate the webhook with
   * @param events - Array of event names to listen for
   * @param url - The callback URL to receive webhook payloads
   * @returns The created webhook configuration
   * @throws If not connected or invalid parameters
   *
   * @example
   * ```ts
   * const wh = await hive.webhooks.create('key-123', ['job.completed'], 'https://my-server.com/hook');
   * ```
   */
  async create(apiKeyId: string, events: string[], url: string): Promise<Webhook> {
    return this.client.post<Webhook>(`/api/keys/${apiKeyId}/webhooks`, {
      events,
      url,
    });
  }

  /**
   * List all webhooks registered under an API key.
   * Requires authentication.
   *
   * @param apiKeyId - The API key ID
   * @returns Array of webhook configurations
   *
   * @example
   * ```ts
   * const hooks = await hive.webhooks.list('key-123');
   * hooks.forEach(h => console.log(h.url, h.events));
   * ```
   */
  async list(apiKeyId: string): Promise<Webhook[]> {
    return this.client.get<Webhook[]>(`/api/keys/${apiKeyId}/webhooks`);
  }

  /**
   * Remove a webhook.
   * Requires authentication.
   *
   * @param apiKeyId - The API key ID
   * @param webhookId - The webhook ID to remove
   * @throws If webhook not found
   *
   * @example
   * ```ts
   * await hive.webhooks.remove('key-123', 'wh-456');
   * ```
   */
  async remove(apiKeyId: string, webhookId: string): Promise<void> {
    await this.client.delete(`/api/keys/${apiKeyId}/webhooks/${webhookId}`);
  }
}
