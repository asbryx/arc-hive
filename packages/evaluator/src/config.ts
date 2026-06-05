export const CONFIG = {
  RPC_URL: process.env.ARC_RPC_URL || 'https://rpc.testnet.arc.network',
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://archiveagents:archiveagents@localhost:5432/archivehub',
  EVALUATOR_PRIVATE_KEY: process.env.EVALUATOR_PRIVATE_KEY || '',
  PROVIDER_PRIVATE_KEY: process.env.PROVIDER_PRIVATE_KEY || '',

  // Primary LLM
  LLM_API_KEY: process.env.LLM_API_KEY || '',
  LLM_MODEL: process.env.LLM_MODEL || 'mimo-v2.5-pro',
  LLM_BASE_URL: process.env.LLM_BASE_URL || 'https://token-plan-sgp.xiaomimimo.com/v1',

  // Secondary LLM (fallback)
  LLM_SECONDARY_KEY: process.env.LLM_SECONDARY_KEY || '',
  LLM_SECONDARY_MODEL: process.env.LLM_SECONDARY_MODEL || 'deepseek-v3.2',
  LLM_SECONDARY_URL: process.env.LLM_SECONDARY_URL || 'http://localhost:1430/v1',

  // Tertiary LLM (fallback)
  LLM_TERTIARY_KEY: process.env.LLM_TERTIARY_KEY || '',
  LLM_TERTIARY_MODEL: process.env.LLM_TERTIARY_MODEL || 'qwen3-coder-next',
  LLM_TERTIARY_URL: process.env.LLM_TERTIARY_URL || 'http://localhost:8788/v1',

  // Evaluation settings
  APPROVAL_THRESHOLD: parseInt(process.env.APPROVAL_THRESHOLD || '70'),
  MAX_REVISIONS: parseInt(process.env.MAX_REVISIONS || '2'),
  POLL_INTERVAL_MS: parseInt(process.env.POLL_INTERVAL_MS || '15000'),
  MAX_DELIVERABLE_LENGTH: parseInt(process.env.MAX_DELIVERABLE_LENGTH || '10000'),
  MIN_DELIVERABLE_LENGTH: parseInt(process.env.MIN_DELIVERABLE_LENGTH || '100'),
  LLM_TIMEOUT_MS: parseInt(process.env.LLM_TIMEOUT_MS || '60000'),

  // Multi-model
  MULTI_MODEL_ENABLED: process.env.MULTI_MODEL_ENABLED !== 'false', // default on
  SCORE_AVERAGING: process.env.SCORE_AVERAGING === 'true', // average scores vs use primary

  AGENTIC_COMMERCE: '0x0747EEf0706327138c69792bF28Cd525089e4583' as `0x${string}`,
  EVALUATOR_ADDRESS: '0xC1FEf538dc6357435372CEb69970D4078F4d3528',
  CHAIN_ID: 5042002,
}
