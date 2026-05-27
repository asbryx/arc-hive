import { parseAbiItem } from 'viem'

// ─── IdentityRegistry Events ──────────────────────────────────────────────────

export const IDENTITY_EVENTS = {
  Registered: parseAbiItem('event Registered(uint256 indexed agentId, string agentURI, address indexed owner)'),
  Transfer: parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)'),
  URIUpdated: parseAbiItem('event URIUpdated(uint256 indexed agentId, string newURI, address indexed updatedBy)'),
  MetadataSet: parseAbiItem('event MetadataSet(uint256 indexed agentId, string indexed indexedMetadataKey, string metadataKey, bytes metadataValue)'),
} as const

// ─── ReputationRegistry Events ────────────────────────────────────────────────

export const REPUTATION_EVENTS = {
  NewFeedback: parseAbiItem('event NewFeedback(uint256 indexed agentId, address indexed clientAddress, uint64 feedbackIndex, int128 value, uint8 valueDecimals, string indexed indexedTag1, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)'),
  FeedbackRevoked: parseAbiItem('event FeedbackRevoked(uint256 indexed agentId, address indexed clientAddress, uint64 indexed feedbackIndex)'),
  ResponseAppended: parseAbiItem('event ResponseAppended(uint256 indexed agentId, address indexed clientAddress, uint64 feedbackIndex, address indexed responder, string responseURI, bytes32 responseHash)'),
} as const

// ─── ValidationRegistry Events ────────────────────────────────────────────────

export const VALIDATION_EVENTS = {
  ValidationRequest: parseAbiItem('event ValidationRequest(address indexed validatorAddress, uint256 indexed agentId, string requestURI, bytes32 indexed requestHash)'),
  ValidationResponse: parseAbiItem('event ValidationResponse(address indexed validatorAddress, uint256 indexed agentId, bytes32 indexed requestHash, uint8 response, string responseURI, bytes32 responseHash, string tag)'),
} as const

// ─── AgenticCommerce Events ───────────────────────────────────────────────────

export const COMMERCE_EVENTS = {
  JobCreated: parseAbiItem('event JobCreated(uint256 indexed jobId, address indexed client, address indexed provider, address evaluator, uint256 expiredAt, address hook)'),
  ProviderSet: parseAbiItem('event ProviderSet(uint256 indexed jobId, address indexed provider)'),
  BudgetSet: parseAbiItem('event BudgetSet(uint256 indexed jobId, uint256 amount)'),
  JobFunded: parseAbiItem('event JobFunded(uint256 indexed jobId, address indexed client, uint256 amount)'),
  JobSubmitted: parseAbiItem('event JobSubmitted(uint256 indexed jobId, address indexed provider, bytes32 deliverable)'),
  JobCompleted: parseAbiItem('event JobCompleted(uint256 indexed jobId, address indexed evaluator, bytes32 reason)'),
  JobRejected: parseAbiItem('event JobRejected(uint256 indexed jobId, address indexed rejector, bytes32 reason)'),
  JobExpired: parseAbiItem('event JobExpired(uint256 indexed jobId)'),
  PaymentReleased: parseAbiItem('event PaymentReleased(uint256 indexed jobId, address indexed provider, uint256 amount)'),
  PlatformFeePaid: parseAbiItem('event PlatformFeePaid(uint256 indexed jobId, address indexed platformTreasury, uint256 amount)'),
  EvaluatorFeePaid: parseAbiItem('event EvaluatorFeePaid(uint256 indexed jobId, address indexed evaluator, uint256 amount)'),
  Refunded: parseAbiItem('event Refunded(uint256 indexed jobId, address indexed client, uint256 amount)'),
} as const

// ─── All events grouped by contract ──────────────────────────────────────────

export const ALL_EVENTS = {
  IDENTITY_REGISTRY: IDENTITY_EVENTS,
  REPUTATION_REGISTRY: REPUTATION_EVENTS,
  VALIDATION_REGISTRY: VALIDATION_EVENTS,
  AGENTIC_COMMERCE: COMMERCE_EVENTS,
} as const
