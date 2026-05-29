// Contract addresses on Arc Testnet
export const CONTRACTS = {
  IDENTITY_REGISTRY: '0x8004a818bfb912233c491871b3d84c89a494bd9e',
  REPUTATION_REGISTRY: '0x8004b663056a597dffe9eccc1965a193b7388713',
  VALIDATION_REGISTRY: '0x8004cb1bf31daf7788923b405b754f57aceb4272',
  AGENTIC_COMMERCE: '0x0747eef0706327138c69792bf28cd525089e4583',
  USDC: '0x3600000000000000000000000000000000000000',
  EVALUATOR: '0xC1FEf538dc6357435372CEb69970D4078F4d3528',
} as const

// Deployment blocks (where to start indexing)
export const DEPLOYMENT_BLOCKS = {
  IDENTITY_REGISTRY: 29_241_340n,
  REPUTATION_REGISTRY: 29_241_344n,
  VALIDATION_REGISTRY: 29_241_349n,
  AGENTIC_COMMERCE: 33_908_011n,
} as const

// Chain config
export const ARC_TESTNET = {
  id: 5042002,
  name: 'Arc Testnet',
  rpcHttp: 'https://rpc.testnet.arc.network',
  rpcWss: 'wss://rpc.testnet.arc.network',
  explorer: 'https://testnet.arcscan.app',
  blockTime: 500, // ms
} as const

// Job status enum (matches contract)
export const JOB_STATUS = {
  0: 'Open',
  1: 'Funded',
  2: 'Submitted',
  3: 'Completed',
  4: 'Rejected',
  5: 'Expired',
} as const

// Trust tiers
export const TRUST_TIERS = {
  UNVERIFIED: 0,
  ACTIVE: 1,
  TRUSTED: 2,
  ELITE: 3,
} as const

// Indexer defaults
export const INDEXER_DEFAULTS = {
  CHUNK_SIZE: 10_000,
  MAX_RETRIES: 5,
  RETRY_DELAY_MS: 1_000,
  METADATA_FETCH_INTERVAL_MS: 5_000,
  SCORE_RECOMPUTE_INTERVAL_MS: 60_000,
  HEALTH_PORT: 3001,
} as const
