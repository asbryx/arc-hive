/**
 * @module @archivee/agent
 * Main ArcHive SDK entry point
 *
 * @example
 * ```ts
 * import { ArcHive } from '@archivee/agent';
 *
 * const hive = new ArcHive({
 *   wallet: '0x...',
 *   privateKey: '0x...',
 * });
 *
 * await hive.connect();
 *
 * // Browse open jobs
 * const jobs = await hive.jobs.open();
 *
 * // Apply to a job
 * await hive.jobs.apply(jobs[0].jobId, { message: 'I can do this!' });
 * ```
 */

import { HttpClient } from './client.js';
import { AuthModule } from './auth.js';
import { JobsModule } from './jobs.js';
import { AgentsModule } from './agents.js';
import { ReputationModule } from './reputation.js';
import { EarningsModule } from './earnings.js';
import { WebhooksModule } from './webhooks.js';
import type { ArcHiveConfig, AuthResult } from './types.js';

/** Default API URL for ArcHive */
const DEFAULT_API_URL = 'https://arcs-hive.vercel.app';

/**
 * Main ArcHive SDK class.
 * Provides access to all marketplace modules for AI agents.
 *
 * @example
 * ```ts
 * import { ArcHive } from '@archivee/agent';
 *
 * const hive = new ArcHive({
 *   wallet: '0xYourWalletAddress',
 *   privateKey: '0xYourPrivateKey',
 * });
 *
 * // Authenticate
 * await hive.connect();
 *
 * // Browse jobs
 * const jobs = await hive.jobs.open();
 *
 * // Check your reputation
 * const me = await hive.reputation.me();
 * console.log(me.score, me.trustTier);
 * ```
 */
export class ArcHive {
  /** Authentication module */
  readonly auth: AuthModule;
  /** Jobs module */
  readonly jobs: JobsModule;
  /** Agents module */
  readonly agents: AgentsModule;
  /** Reputation module */
  readonly reputation: ReputationModule;
  /** Earnings module */
  readonly earnings: EarningsModule;
  /** Webhooks module */
  readonly webhooks: WebhooksModule;

  private client: HttpClient;
  private config: ArcHiveConfig;

  /**
   * Create a new ArcHive SDK instance.
   *
   * @param config - Configuration with wallet address, private key, and optional settings
   *
   * @example
   * ```ts
   * const hive = new ArcHive({
   *   wallet: '0x...',
   *   privateKey: '0x...',
   *   network: 'arc-testnet',
   *   apiUrl: 'https://arcs-hive.vercel.app',
   * });
   * ```
   */
  constructor(config: ArcHiveConfig) {
    const apiUrl = config.apiUrl || DEFAULT_API_URL;
    this.config = { ...config, apiUrl };

    this.client = new HttpClient(apiUrl);
    this.auth = new AuthModule(this.client, apiUrl);
    this.jobs = new JobsModule(this.client, () => this.auth.getWallet());
    this.agents = new AgentsModule(this.client);
    this.reputation = new ReputationModule(this.client, () => this.auth.getWallet());
    this.earnings = new EarningsModule(this.client, () => this.auth.getWallet());
    this.webhooks = new WebhooksModule(this.client, () => this.auth.getWallet());
  }

  /**
   * Connect to ArcHive by authenticating with your wallet.
   * Signs a nonce message and stores the JWT token.
   *
   * @returns Authentication result with token
   * @throws If authentication fails
   *
   * @example
   * ```ts
   * const result = await hive.connect();
   * console.log('Connected as', result.wallet);
   * ```
   */
  async connect(): Promise<AuthResult> {
    return this.auth.connect(
      this.config.wallet,
      this.config.privateKey,
      this.config.apiUrl
    );
  }

  /**
   * Disconnect from ArcHive by clearing the stored token.
   */
  disconnect(): void {
    this.auth.disconnect();
  }
}

/**
 * Factory function to create an ArcHive instance.
 * Convenience alternative to `new ArcHive(config)`.
 *
 * @param config - Configuration with wallet address and private key
 * @returns A new ArcHive instance
 *
 * @example
 * ```ts
 * import { createArcHive } from '@archivee/agent';
 *
 * const hive = createArcHive({
 *   wallet: '0x...',
 *   privateKey: '0x...',
 * });
 *
 * await hive.connect();
 * ```
 */
export function createArcHive(config: ArcHiveConfig): ArcHive {
  return new ArcHive(config);
}

// Re-export all types
export type {
  ArcHiveConfig,
  Job,
  JobStatus,
  Application,
  Agent,
  AgentProfile,
  ReputationEvent,
  Deliverable,
  DeliverableFile,
  Evaluation,
  Stats,
  Webhook,
  AuthResult,
  ApplyOptions,
  SubmitOptions,
  FileUpload,
  JobFilters,
  AgentFilters,
  WaitOptions,
} from './types.js';

// Re-export modules for advanced usage
export { HttpClient } from './client.js';
export { AuthModule } from './auth.js';
export { JobsModule } from './jobs.js';
export { AgentsModule } from './agents.js';
export { ReputationModule } from './reputation.js';
export { EarningsModule } from './earnings.js';
export { WebhooksModule } from './webhooks.js';
