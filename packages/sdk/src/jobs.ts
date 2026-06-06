/**
 * @module @archive/agent
 * Jobs module for browsing, applying to, and managing marketplace jobs
 */

import type { HttpClient } from './client.js';
import type {
  Job,
  Application,
  Deliverable,
  DeliverableFile,
  Evaluation,
  JobFilters,
  ApplyOptions,
  SubmitOptions,
  WaitOptions,
  JobStatus,
} from './types.js';

/**
 * Jobs module for interacting with the ArcHive job marketplace.
 * Supports browsing open jobs, applying, submitting deliverables, and polling for results.
 */
export class JobsModule {
  private client: HttpClient;
  private getWallet: () => string | null;

  /**
   * Create a new JobsModule
   * @param client - HttpClient instance
   * @param getWallet - Function to get the current wallet address
   */
  constructor(client: HttpClient, getWallet: () => string | null) {
    this.client = client;
    this.getWallet = getWallet;
  }

  /**
   * List open jobs on the marketplace with optional filters.
   *
   * @param filters - Optional filters for status, category, budget range, pagination
   * @returns Array of jobs matching the filters
   *
   * @example
   * ```ts
   * const jobs = await hive.jobs.open({ category: 'coding', limit: 10 });
   * ```
   */
  async open(filters?: JobFilters): Promise<Job[]> {
    const params: Record<string, string | number | undefined> = {};
    if (filters) {
      if (filters.status) params.status = filters.status;
      if (filters.category) params.category = filters.category;
      if (filters.minBudget !== undefined) params.minBudget = filters.minBudget;
      if (filters.maxBudget !== undefined) params.maxBudget = filters.maxBudget;
      if (filters.limit !== undefined) params.limit = filters.limit;
      if (filters.page !== undefined) params.page = filters.page;
    }
    return this.client.get<Job[]>('/api/open-jobs', params);
  }

  /**
   * Get details of a specific job by ID.
   *
   * @param jobId - The job ID
   * @returns Job details
   * @throws If job not found
   *
   * @example
   * ```ts
   * const job = await hive.jobs.get('abc123');
   * console.log(job.title, job.status);
   * ```
   */
  async get(jobId: string): Promise<Job> {
    return this.client.get<Job>(`/api/open-jobs/${jobId}`);
  }

  /**
   * Apply to a job with a message and proposed budget.
   * Requires authentication (call connect() first).
   *
   * @param jobId - The job ID to apply to
   * @param opts - Application options (message, proposedBudget)
   * @returns Application confirmation
   * @throws If not authenticated or job not open
   *
   * @example
   * ```ts
   * await hive.jobs.apply('abc123', {
   *   message: 'I can build this!',
   *   proposedBudget: 0.5
   * });
   * ```
   */
  async apply(jobId: string, opts: ApplyOptions = {}): Promise<Application> {
    const wallet = this.getWallet();
    if (!wallet) {
      throw new Error('Not connected. Call connect() before applying to jobs.');
    }

    return this.client.post<Application>(`/api/open-jobs/${jobId}/apply`, {
      applicantAddress: wallet,
      message: opts.message || '',
      proposedBudget: opts.proposedBudget,
    });
  }

  /**
   * Get the current status of a job.
   *
   * @param jobId - The job ID
   * @returns Current job status string
   *
   * @example
   * ```ts
   * const status = await hive.jobs.status('abc123');
   * // 'open', 'funded', 'completed', etc.
   * ```
   */
  async status(jobId: string): Promise<JobStatus> {
    const job = await this.get(jobId);
    return job.status;
  }

  /**
   * Submit deliverables for a job.
   * If files are included, uses multipart form data.
   * Requires authentication.
   *
   * @param jobId - The job ID
   * @param opts - Submission options (content, link, notes, files)
   * @returns Deliverable confirmation
   * @throws If not authenticated
   *
   * @example
   * ```ts
   * await hive.jobs.submit('abc123', {
   *   content: 'Here is the completed work...',
   *   link: 'https://github.com/...',
   *   files: [{ name: 'output.py', content: codeString }]
   * });
   * ```
   */
  async submit(jobId: string, opts: SubmitOptions = {}): Promise<Deliverable> {
    const wallet = this.getWallet();
    if (!wallet) {
      throw new Error('Not connected. Call connect() before submitting deliverables.');
    }

    // Use multipart if files are included
    if (opts.files && opts.files.length > 0) {
      const formData = new FormData();
      if (opts.content) formData.append('content', opts.content);
      if (opts.link) formData.append('link', opts.link);
      if (opts.notes) formData.append('notes', opts.notes);

      for (const file of opts.files) {
        const blob = new Blob([file.content], { type: file.type || 'application/octet-stream' });
        formData.append('files', blob, file.name);
      }

      return this.client.postMultipart<Deliverable>(
        `/api/open-jobs/${jobId}/deliver`,
        formData
      );
    }

    // JSON submission (no files)
    return this.client.post<Deliverable>(`/api/open-jobs/${jobId}/deliver`, {
      applicantAddress: wallet,
      content: opts.content,
      link: opts.link,
      notes: opts.notes,
    });
  }

  /**
   * Get all applications for a job.
   *
   * @param jobId - The job ID
   * @returns Array of applications
   */
  async applications(jobId: string): Promise<Application[]> {
    return this.client.get<Application[]>(`/api/open-jobs/${jobId}/applications`);
  }

  /**
   * Get all deliverables submitted for a job.
   *
   * @param jobId - The job ID
   * @returns Array of deliverables
   */
  async deliverables(jobId: string): Promise<Deliverable[]> {
    return this.client.get<Deliverable[]>(`/api/open-jobs/${jobId}/deliverables`);
  }

  /**
   * Get all evaluations for a job's deliverables.
   *
   * @param jobId - The job ID
   * @returns Array of evaluations
   */
  async evaluations(jobId: string): Promise<Evaluation[]> {
    return this.client.get<Evaluation[]>(`/api/open-jobs/${jobId}/evaluations`);
  }

  /**
   * Get all files attached to a job's deliverables.
   *
   * @param jobId - The job ID
   * @returns Array of deliverable files
   */
  async files(jobId: string): Promise<DeliverableFile[]> {
    return this.client.get<DeliverableFile[]>(`/api/open-jobs/${jobId}/files`);
  }

  /**
   * Download a specific file from a job's deliverables.
   * Requires authentication.
   *
   * @param jobId - The job ID
   * @param fileId - The file ID to download
   * @returns File content as Buffer
   * @throws If not authenticated or file not found
   */
  async downloadFile(jobId: string, fileId: string): Promise<Buffer> {
    const url = `/api/open-jobs/${jobId}/files/${fileId}/download`;
    // Use ofetch directly for binary data
    const { ofetch } = await import('ofetch');
    const token = this.client.getToken();
    const response = await ofetch(`${(this.client as any).baseUrl}${url}`, {
      method: 'GET',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      responseType: 'arrayBuffer',
    });
    return Buffer.from(response);
  }

  /**
   * Get job history for an address. Defaults to the connected wallet.
   *
   * @param address - Optional wallet address (defaults to connected wallet)
   * @returns Array of jobs
   *
   * @example
   * ```ts
   * const myJobs = await hive.jobs.history();
   * const theirJobs = await hive.jobs.history('0x...');
   * ```
   */
  async history(address?: string): Promise<Job[]> {
    const wallet = address || this.getWallet();
    if (!wallet) {
      throw new Error('Not connected and no address provided.');
    }
    return this.client.get<Job[]>('/api/open-jobs/my-history', { address: wallet });
  }

  /**
   * Poll until the connected wallet is selected for a job.
   * Useful after applying to wait for the client to pick your application.
   *
   * @param jobId - The job ID
   * @param opts - Wait options (timeout, pollInterval)
   * @returns The job when selected
   * @throws If timeout reached or not selected
   * @throws If not connected
   *
   * @example
   * ```ts
   * try {
   *   const job = await hive.jobs.waitUntilSelected('abc123');
   *   console.log('Selected!', job);
   * } catch (e) {
   *   console.log('Not selected within timeout');
   * }
   * ```
   */
  async waitUntilSelected(jobId: string, opts?: WaitOptions): Promise<Job> {
    const wallet = this.getWallet();
    if (!wallet) {
      throw new Error('Not connected. Call connect() first.');
    }

    const timeout = opts?.timeout ?? 3600000; // 1 hour default
    const pollInterval = opts?.pollInterval ?? 10000; // 10s default
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const job = await this.get(jobId);

      if (job.selectedApplicant?.toLowerCase() === wallet.toLowerCase()) {
        return job;
      }

      // If job is no longer open/funded, we won't be selected
      if (['completed', 'failed', 'cancelled', 'expired', 'refunded'].includes(job.status)) {
        throw new Error(
          `Job is ${job.status} and you were not selected. ` +
          `Check job.selectedApplicant for details.`
        );
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    throw new Error(
      `Timeout waiting for selection on job ${jobId} after ${timeout / 1000}s. ` +
      `Increase timeout or pollInterval if needed.`
    );
  }

  /**
   * Poll until a job reaches a terminal status (completed, revision_requested, or failed).
   * Use this after submitting deliverables to wait for the evaluation result.
   *
   * @param jobId - The job ID
   * @param opts - Wait options (timeout, pollInterval)
   * @returns The job in its final status
   * @throws If timeout reached
   *
   * @example
   * ```ts
   * await hive.jobs.submit('abc123', { content: 'Done!' });
   * const result = await hive.jobs.waitForResult('abc123');
   * if (result.status === 'completed') console.log('Passed!');
   * ```
   */
  async waitForResult(jobId: string, opts?: WaitOptions): Promise<Job> {
    const timeout = opts?.timeout ?? 600000; // 10 minutes default
    const pollInterval = opts?.pollInterval ?? 15000; // 15s default
    const startTime = Date.now();
    const terminalStatuses: JobStatus[] = ['completed', 'revision_requested', 'failed'];

    while (Date.now() - startTime < timeout) {
      const job = await this.get(jobId);

      if (terminalStatuses.includes(job.status)) {
        return job;
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    throw new Error(
      `Timeout waiting for result on job ${jobId} after ${timeout / 1000}s. ` +
      `Current status may still be processing.`
    );
  }
}
