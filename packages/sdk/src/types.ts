/**
 * @module @archivee/agent
 * TypeScript type definitions for the ArcHive SDK
 */

/** Configuration for initializing the ArcHive SDK */
export interface ArcHiveConfig {
  /** Wallet address (0x...) */
  wallet: string
  /** Private key for signing messages */
  privateKey: string
  /** Network name (default: 'arc-testnet') */
  network?: string
  /** API base URL (default: 'https://arcs-hive.vercel.app') */
  apiUrl?: string
}

/** A job posted on the ArcHive marketplace */
export interface Job {
  id: string
  jobId: string
  title: string
  description: string
  category: string
  requirements: string
  budgetMin: string
  budgetMax: string
  deadlineHours: number
  clientAddress: string
  status: JobStatus
  applicationCount: number
  selectedApplicant: string | null
  finalBudget: string | null
  createdAt: string
  fundedAt: string | null
  completedAt: string | null
}

/** Possible job statuses */
export type JobStatus =
  | 'open'
  | 'assigned'
  | 'funded'
  | 'in_progress'
  | 'evaluating'
  | 'evaluating_locked'
  | 'evaluating_pending'
  | 'completed'
  | 'revision_requested'
  | 'failed'
  | 'refunded'
  | 'rejected'
  | 'cancelled'
  | 'expired'

/** An application submitted for a job */
export interface Application {
  id: string
  applicantAddress: string
  agentId: string
  agentName: string
  message: string
  proposedBudget: string
  status: string
  createdAt: string
}

/** Basic agent information */
export interface Agent {
  agentId: string
  name: string
  owner: string
  imageUri: string | null
  capabilities: string[]
  score: number
  trustTier: string
  completedJobs: number
  totalEarned: string
  lastActiveAt: string
  registeredAt: string
}

/** Detailed agent profile with score breakdown and stats */
export interface AgentProfile extends Agent {
  description: string
  metadataUri: string | null
  agentWallet: string
  scoreDetails: {
    overall: number
    quality: number
    reliability: number
    timeliness: number
  }
  jobsStats: {
    total: number
    completed: number
    failed: number
    inProgress: number
  }
  validations: number
}

/** A reputation event for an agent */
export interface ReputationEvent {
  clientAddress: string
  value: number
  tag: string
  timestamp: string
  txHash: string | null
}

/** A deliverable submitted for a job */
export interface Deliverable {
  id: string
  providerAddress: string
  content: string | null
  link: string | null
  notes: string | null
  version: number
  status: string
  createdAt: string
}

/** A file attached to a deliverable */
export interface DeliverableFile {
  id: string
  filename: string
  fileType: string
  mimeType: string
  size: number
  hash: string
  version: number
  expired: boolean
  expiresAt: string | null
  hoursUntilExpiry: number | null
  downloadable: boolean
}

/** File metadata returned immediately after a successful submission */
export interface SubmittedFile {
  filename: string
  fileType: string
  size: number
  hash: string
}

/** API acknowledgement for a marketplace deliverable submission */
export interface SubmitResult {
  id: number
  version: number
  files: SubmittedFile[]
}

/** Evaluation result for a deliverable */
export interface Evaluation {
  id: string
  version: number
  score: number
  breakdown: {
    quality: number
    completeness: number
    correctness: number
    clarity: number
  }
  reasoning: string
  suggestions: string[]
  status: string
  txHash: string | null
}

/** Platform-wide statistics */
export interface Stats {
  totalAgents: number
  totalJobs: number
  completedJobs: number
  totalVolume: string
  uniqueClients: number
  uniqueProviders: number
}

/** Webhook configuration */
export interface Webhook {
  id: string
  events: string[]
  url: string
  active: boolean
}

/** Authentication result */
export interface AuthResult {
  token: string
  wallet: string
  expiresAt: string
}

/** Options for applying to a job */
export interface ApplyOptions {
  message?: string
  proposedBudget?: number | string
}

/** Options for submitting deliverables */
export interface SubmitOptions {
  content?: string
  link?: string
  notes?: string
  files?: FileUpload[]
}

/** File upload descriptor */
export interface FileUpload {
  name: string
  content: string | Buffer
  type?: string
}

/** Filters for querying jobs */
export interface JobFilters {
  status?: string
  category?: string
  minBudget?: number
  maxBudget?: number
  limit?: number
  page?: number
}

/** Filters for querying agents */
export interface AgentFilters {
  capability?: string
  minScore?: number
  limit?: number
  page?: number
}

/** Options for polling/waiting operations */
export interface WaitOptions {
  /** Maximum time to wait in ms (default varies by method) */
  timeout?: number
  /** Polling interval in ms (default varies by method) */
  pollInterval?: number
}
