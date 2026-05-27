// ─── Agent (from IdentityRegistry) ────────────────────────────────────────────

export interface Agent {
  id: number
  agentId: bigint
  ownerAddress: string
  metadataUri: string | null
  registeredAt: Date
  registeredBlock: bigint
  registeredTx: string
  sourceContract: string

  // Denormalized from metadata
  name: string | null
  description: string | null
  imageUri: string | null
  agentType: string | null
  capabilities: string[]
  version: string | null

  // Wallet binding
  agentWallet: string | null

  updatedAt: Date
}

export interface AgentMetadata {
  name?: string
  description?: string
  image?: string
  agent_type?: string
  capabilities?: string[]
  version?: string
  [key: string]: unknown
}

// ─── Reputation (from ReputationRegistry) ─────────────────────────────────────

export interface ReputationEvent {
  id: number
  agentId: bigint
  clientAddress: string
  feedbackIndex: bigint
  value: number
  valueDecimals: number
  tag1: string | null
  tag2: string | null
  endpoint: string | null
  feedbackUri: string | null
  feedbackHash: string | null
  isRevoked: boolean

  blockNumber: bigint
  blockTimestamp: Date
  txHash: string
  sourceContract: string
}

export interface ReputationResponse {
  id: number
  agentId: bigint
  clientAddress: string
  feedbackIndex: bigint
  responderAddress: string
  responseUri: string | null
  responseHash: string | null

  blockNumber: bigint
  blockTimestamp: Date
  txHash: string
  sourceContract: string
}

// ─── Validation (from ValidationRegistry) ─────────────────────────────────────

export interface Validation {
  id: number
  agentId: bigint
  validatorAddress: string
  requestHash: string
  requestUri: string | null

  responseStatus: number | null // 0=pending, 1=approved, 2=rejected
  responseUri: string | null
  responseHash: string | null
  responseTag: string | null
  respondedAt: Date | null
  responseBlock: bigint | null
  responseTx: string | null

  requestBlock: bigint
  requestTimestamp: Date
  requestTx: string
  sourceContract: string
}

// ─── Job (from AgenticCommerce) ───────────────────────────────────────────────

export type JobStatus = 'Open' | 'Funded' | 'Submitted' | 'Completed' | 'Rejected' | 'Expired'

export interface Job {
  id: number
  jobId: bigint
  clientAddress: string
  providerAddress: string | null
  evaluatorAddress: string | null
  providerAgentId: bigint | null

  description: string | null
  budget: bigint | null
  paymentToken: string | null
  status: JobStatus

  expiredAt: Date | null
  submittedAt: Date | null
  completedAt: Date | null
  rejectedAt: Date | null

  deliverableHash: string | null
  completionReason: string | null
  rejectionReason: string | null

  paymentReleased: bigint | null
  platformFeePaid: bigint | null
  evaluatorFeePaid: bigint | null
  refundAmount: bigint | null

  hookAddress: string | null

  createdBlock: bigint
  createdTimestamp: Date
  createdTx: string
  sourceContract: string
}

export interface JobEvent {
  id: number
  jobId: bigint
  eventName: string
  eventData: Record<string, unknown>

  blockNumber: bigint
  blockTimestamp: Date
  txHash: string
  logIndex: number
  sourceContract: string
}

// ─── Agent Scores (computed) ──────────────────────────────────────────────────

export interface AgentScore {
  agentId: bigint
  avgScore: number | null
  totalFeedbackCount: number
  positiveFeedbackCount: number
  negativeFeedbackCount: number
  uniqueRaters: number

  totalJobs: number
  completedJobs: number
  rejectedJobs: number
  expiredJobs: number
  completionRate: number | null
  totalEarned: bigint

  totalValidations: number
  approvedValidations: number

  trustTier: number
  sybilScore: number
  flagged: boolean
  flagReason: string | null

  firstActiveAt: Date | null
  lastActiveAt: Date | null
  computedAt: Date
}

// ─── Sync State ───────────────────────────────────────────────────────────────

export interface SyncState {
  contractAddress: string
  contractName: string
  lastSyncedBlock: bigint
  deploymentBlock: bigint
  isSyncing: boolean
  lastSyncAt: Date | null
  totalEventsProcessed: bigint
  errorCount: number
  lastError: string | null
  lastErrorAt: Date | null
}

// ─── Metadata Queue ───────────────────────────────────────────────────────────

export type MetadataQueueStatus = 'pending' | 'fetching' | 'done' | 'failed'

export interface MetadataQueueItem {
  agentId: bigint
  metadataUri: string
  status: MetadataQueueStatus
  attempts: number
  maxAttempts: number
  lastAttemptAt: Date | null
  error: string | null
}
