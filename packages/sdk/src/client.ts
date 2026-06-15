/**
 * @module @archivee/agent
 * HTTP client with retry logic and auth token management
 */

import { ofetch } from 'ofetch';

/** Max retry attempts for failed requests */
const MAX_RETRIES = 3;
/** Base delay for exponential backoff in ms */
const BASE_DELAY = 1000;

/**
 * HTTP client for making requests to the ArcHive API.
 * Handles authentication, retries, and error formatting.
 */
export class HttpClient {
  private baseUrl: string;
  private token: string | null = null;

  /**
   * Create a new HttpClient instance
   * @param apiUrl - Base URL of the ArcHive API
   */
  constructor(apiUrl: string) {
    this.baseUrl = apiUrl.replace(/\/+$/, '');
  }

  /**
   * Get the current authentication token
   * @returns The stored token or null
   */
  getToken(): string | null {
    return this.token;
  }

  /**
   * Store an authentication token
   * @param token - JWT token to store
   */
  setToken(token: string): void {
    this.token = token;
  }

  /**
   * Clear the stored authentication token
   */
  clearToken(): void {
    this.token = null;
  }

  /**
   * Make a GET request
   * @param path - API path (e.g., '/api/open-jobs')
   * @param params - Query parameters
   * @returns Parsed JSON response
   */
  async get<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
    const url = new URL(path, this.baseUrl);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    return this.requestWithRetry<T>('GET', url.toString());
  }

  /**
   * Make a POST request with JSON body
   * @param path - API path
   * @param body - Request body (will be JSON serialized)
   * @returns Parsed JSON response
   */
  async post<T>(path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    return this.requestWithRetry<T>('POST', url, {
      body: body ? JSON.stringify(body) : undefined,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Make a POST request with multipart form data
   * @param path - API path
   * @param formData - FormData object
   * @returns Parsed JSON response
   */
  async postMultipart<T>(path: string, formData: FormData): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    return this.requestWithRetry<T>('POST', url, {
      body: formData,
    });
  }

  /**
   * Make a DELETE request
   * @param path - API path
   * @returns Parsed JSON response
   */
  async delete<T>(path: string): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    return this.requestWithRetry<T>('DELETE', url);
  }

  /**
   * Execute a request with exponential backoff retry logic
   * @private
   */
  private async requestWithRetry<T>(
    method: string,
    url: string,
    options: RequestInit = {}
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const headers: Record<string, string> = {
          ...(options.headers as Record<string, string>),
        };

        // Add auth token for non-GET requests (or all if token exists)
        if (this.token) {
          headers['Authorization'] = `Bearer ${this.token}`;
        }

        const response = await ofetch(url, {
          method: method as any,
          headers,
          body: options.body as any,
          responseType: 'json',
          // T-SE01: Timeout handling
          timeout: 30_000,
        });

        // Check for API error in response body (only if error is truthy)
        if (response && typeof response === 'object' && 'error' in response && (response as any).error) {
          throw new Error((response as any).error);
        }

        // Unwrap list endpoints that return {data: [...]}
        if (response && typeof response === 'object' && 'data' in response && Array.isArray((response as any).data)) {
          return (response as any).data as T;
        }

        return response as T;
      } catch (error: any) {
        lastError = error;

        // T-SE03: 429 backoff — retry with Retry-After header if available
        if (error.statusCode === 429) {
          const retryAfter = error.data?.retryAfter || Math.pow(2, attempt) * 2;
          if (attempt < MAX_RETRIES - 1) {
            await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
            continue;
          }
          throw new Error(`Rate limited after ${MAX_RETRIES} retries`);
        }

        // T-SE04: JSON parse error handling
        if (error.message?.includes('JSON') || error.name === 'SyntaxError') {
          throw new Error('Invalid JSON response from server');
        }

        // For 4xx and other non-retriable errors: surface the server's actual
        // {error: "..."} message + status + path so callers can debug. The
        // previous handler threw `new Error(error.message)` which dropped the
        // status code AND any error-body detail, leaving SDK users with
        // useless stack traces like "Request failed: 404". (Fixed 2026-06-15.)
        const fail = (e: any) => {
          const status = e?.statusCode ?? e?.status ?? null;
          const apiErr = e?.data?.error ?? e?.response?._data?.error ?? null;
          const baseMsg = apiErr || e?.message || 'Request failed';
          const wrapped = new Error(`[${method} ${url}] ${status ? status + ': ' : ''}${baseMsg}`);
          ;(wrapped as any).status = status;
          ;(wrapped as any).cause = e;
          ;(wrapped as any).response = e?.response;
          return wrapped;
        };

        // Don't retry on client errors (4xx) — propagate immediately
        if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
          throw fail(error);
        }

        // Don't retry on non-network errors
        if (error.message && !error.message.includes('network') && !error.message.includes('timeout') && !error.message.includes('ECONNREFUSED')) {
          throw fail(error);
        }

        // Wait before retrying (exponential backoff)
        if (attempt < MAX_RETRIES - 1) {
          const delay = BASE_DELAY * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('Request failed after maximum retries');
  }
}
