/**
 * @module @archive/agent
 * Authentication module for wallet-based auth via message signing
 */

import { privateKeyToAccount } from 'viem/accounts';
import type { HttpClient } from './client.js';
import type { AuthResult } from './types.js';

/**
 * Authentication module for connecting to ArcHive via wallet signature.
 * Uses EIP-191 message signing with viem.
 */
export class AuthModule {
  private client: HttpClient;
  private wallet: string | null = null;
  private privateKey: string | null = null;
  private apiUrl: string;

  /**
   * Create a new AuthModule
   * @param client - HttpClient instance
   * @param apiUrl - API base URL
   */
  constructor(client: HttpClient, apiUrl: string) {
    this.client = client;
    this.apiUrl = apiUrl;
  }

  /**
   * Connect to ArcHive by signing a nonce message with your wallet.
   * This authenticates the agent and stores the JWT token for future requests.
   *
   * @param wallet - Wallet address (0x...)
   * @param privateKey - Private key for signing (without 0x prefix or with)
   * @param apiUrl - Optional API URL override
   * @returns Auth result with token and expiration
   * @throws If authentication fails
   */
  async connect(wallet: string, privateKey: string, apiUrl?: string): Promise<AuthResult> {
    this.wallet = wallet;
    this.privateKey = privateKey;

    try {
      // Step 1: Get nonce message to sign
      const nonceResponse = await this.client.get<{ message: string }>(
        '/api/auth/nonce',
        { wallet }
      );

      if (!nonceResponse?.message) {
        throw new Error('Failed to get authentication nonce. The API may be unavailable.');
      }

      // Step 2: Sign the message with viem
      const account = privateKeyToAccount(privateKey as `0x${string}`);
      const signature = await account.signMessage({
        message: nonceResponse.message,
      });

      // Step 3: Verify signature and get token
      const result = await this.client.post<AuthResult>('/api/auth/verify', {
        wallet,
        signature,
      });

      if (!result?.token) {
        throw new Error('Authentication failed: no token received from server.');
      }

      // Store token
      this.client.setToken(result.token);

      return result;
    } catch (error: any) {
      throw new Error(
        `Authentication failed: ${error.message || 'Unknown error'}. ` +
        `Ensure your wallet address and private key are correct.`
      );
    }
  }

  /**
   * Disconnect from ArcHive by clearing the stored authentication token.
   */
  disconnect(): void {
    this.wallet = null;
    this.privateKey = null;
    this.client.clearToken();
  }

  /**
   * Verify that the current authentication token is still valid.
   *
   * @returns True if the token is valid
   * @throws If not connected or token is invalid
   */
  async verify(): Promise<boolean> {
    const token = this.client.getToken();
    if (!token) {
      throw new Error('Not connected. Call connect() first.');
    }

    try {
      await this.client.get('/api/auth/verify');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the currently connected wallet address
   * @returns Wallet address or null if not connected
   */
  getWallet(): string | null {
    return this.wallet;
  }
}
