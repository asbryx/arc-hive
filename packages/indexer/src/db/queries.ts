import { query, queryMarketplace } from './client.js'

// ─── Agents ───────────────────────────────────────────────────────────────────

export async function upsertAgent(params: {
  agentId: bigint
  ownerAddress: string
  metadataUri: string | null
  registeredAt: Date
  registeredBlock: bigint
  registeredTx: string
  sourceContract: string
}) {
  await query(
    `INSERT INTO agents (agent_id, owner_address, metadata_uri, registered_at, registered_block, registered_tx, source_contract)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (agent_id, source_contract) DO UPDATE SET
       owner_address = EXCLUDED.owner_address,
       metadata_uri = COALESCE(EXCLUDED.metadata_uri, agents.metadata_uri),
       updated_at = NOW()`,
    [params.agentId.toString(), params.ownerAddress, params.metadataUri, params.registeredAt, params.registeredBlock.toString(), params.registeredTx, params.sourceContract]
  )
}

export async function updateAgentOwner(agentId: bigint, newOwner: string, sourceContract: string) {
  await query(
    `UPDATE agents SET owner_address = $1, updated_at = NOW() WHERE agent_id = $2 AND source_contract = $3`,
    [newOwner, agentId.toString(), sourceContract]
  )
}

export async function updateAgentUri(agentId: bigint, newUri: string, sourceContract: string) {
  await query(
    `UPDATE agents SET metadata_uri = $1, updated_at = NOW() WHERE agent_id = $2 AND source_contract = $3`,
    [newUri, agentId.toString(), sourceContract]
  )
}

export async function updateAgentMetadata(agentId: bigint, sourceContract: string, metadata: {
  name?: string | null
  description?: string | null
  imageUri?: string | null
  agentType?: string | null
  capabilities?: string[]
  version?: string | null
}) {
  await query(
    `UPDATE agents SET
       name = COALESCE($1, name),
       description = COALESCE($2, description),
       image_uri = COALESCE($3, image_uri),
       agent_type = COALESCE($4, agent_type),
       capabilities = COALESCE($5, capabilities),
       version = COALESCE($6, version),
       updated_at = NOW()
     WHERE agent_id = $7 AND source_contract = $8`,
    [metadata.name, metadata.description, metadata.imageUri, metadata.agentType, metadata.capabilities, metadata.version, agentId.toString(), sourceContract]
  )
}

// ─── Reputation ───────────────────────────────────────────────────────────────

export async function insertReputationEvent(params: {
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
  blockNumber: bigint
  blockTimestamp: Date
  txHash: string
  sourceContract: string
}) {
  await query(
    `INSERT INTO reputation_events (agent_id, client_address, feedback_index, value, value_decimals, tag1, tag2, endpoint, feedback_uri, feedback_hash, block_number, block_timestamp, tx_hash, source_contract)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     ON CONFLICT (agent_id, client_address, feedback_index, source_contract) DO NOTHING`,
    [params.agentId.toString(), params.clientAddress, params.feedbackIndex.toString(), params.value, params.valueDecimals, params.tag1, params.tag2, params.endpoint, params.feedbackUri, params.feedbackHash, params.blockNumber.toString(), params.blockTimestamp, params.txHash, params.sourceContract]
  )
}

export async function revokeFeedback(agentId: bigint, clientAddress: string, feedbackIndex: bigint, sourceContract: string) {
  await query(
    `UPDATE reputation_events SET is_revoked = TRUE WHERE agent_id = $1 AND client_address = $2 AND feedback_index = $3 AND source_contract = $4`,
    [agentId.toString(), clientAddress, feedbackIndex.toString(), sourceContract]
  )
}

export async function insertReputationResponse(params: {
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
}) {
  await query(
    `INSERT INTO reputation_responses (agent_id, client_address, feedback_index, responder_address, response_uri, response_hash, block_number, block_timestamp, tx_hash, source_contract)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [params.agentId.toString(), params.clientAddress, params.feedbackIndex.toString(), params.responderAddress, params.responseUri, params.responseHash, params.blockNumber.toString(), params.blockTimestamp, params.txHash, params.sourceContract]
  )
}

// ─── Validations ──────────────────────────────────────────────────────────────

export async function upsertValidationRequest(params: {
  agentId: bigint
  validatorAddress: string
  requestHash: string
  requestUri: string | null
  requestBlock: bigint
  requestTimestamp: Date
  requestTx: string
  sourceContract: string
}) {
  await query(
    `INSERT INTO validations (agent_id, validator_address, request_hash, request_uri, request_block, request_timestamp, request_tx, source_contract)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (request_hash, source_contract) DO NOTHING`,
    [params.agentId.toString(), params.validatorAddress, params.requestHash, params.requestUri, params.requestBlock.toString(), params.requestTimestamp, params.requestTx, params.sourceContract]
  )
}

export async function updateValidationResponse(params: {
  requestHash: string
  responseStatus: number
  responseUri: string | null
  responseHash: string | null
  responseTag: string | null
  respondedAt: Date
  responseBlock: bigint
  responseTx: string
  sourceContract: string
}) {
  await query(
    `UPDATE validations SET
       response_status = $1, response_uri = $2, response_hash = $3, response_tag = $4,
       responded_at = $5, response_block = $6, response_tx = $7, updated_at = NOW()
     WHERE request_hash = $8 AND source_contract = $9`,
    [params.responseStatus, params.responseUri, params.responseHash, params.responseTag, params.respondedAt, params.responseBlock.toString(), params.responseTx, params.requestHash, params.sourceContract]
  )
}

// ─── Jobs ─────────────────────────────────────────────────────────────────────

export async function upsertJob(params: {
  jobId: bigint
  clientAddress: string
  providerAddress: string | null
  evaluatorAddress: string | null
  description: string | null
  expiredAt: Date | null
  hookAddress: string | null
  createdBlock: bigint
  createdTimestamp: Date
  createdTx: string
  sourceContract: string
}) {
  await queryMarketplace(
    `INSERT INTO jobs (job_id, client_address, provider_address, evaluator_address, description, expired_at, hook_address, created_block, created_timestamp, created_tx, source_contract)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (job_id, source_contract) DO UPDATE SET
       provider_address = COALESCE(EXCLUDED.provider_address, jobs.provider_address),
       evaluator_address = COALESCE(EXCLUDED.evaluator_address, jobs.evaluator_address),
       updated_at = NOW()`,
    [params.jobId.toString(), params.clientAddress, params.providerAddress, params.evaluatorAddress, params.description, params.expiredAt, params.hookAddress, params.createdBlock.toString(), params.createdTimestamp, params.createdTx, params.sourceContract]
  )
}

export async function updateJobField(jobId: bigint, sourceContract: string, field: string, value: unknown) {
  const allowed = ['provider_address', 'budget', 'payment_token', 'status', 'submitted_at', 'completed_at', 'rejected_at', 'deliverable_hash', 'completion_reason', 'rejection_reason', 'payment_released', 'platform_fee_paid', 'evaluator_fee_paid', 'refund_amount', 'provider_agent_id']
  if (!allowed.includes(field)) throw new Error(`Invalid field: ${field}`)

  await queryMarketplace(
    `UPDATE jobs SET ${field} = $1, updated_at = NOW() WHERE job_id = $2 AND source_contract = $3`,
    [value, jobId.toString(), sourceContract]
  )
}

export async function updateJobFields(jobId: bigint, sourceContract: string, fields: Record<string, unknown>) {
  const allowed = new Set(['provider_address', 'budget', 'payment_token', 'status', 'submitted_at', 'completed_at', 'rejected_at', 'deliverable_hash', 'completion_reason', 'rejection_reason', 'payment_released', 'platform_fee_paid', 'evaluator_fee_paid', 'refund_amount', 'provider_agent_id'])

  const entries = Object.entries(fields).filter(([k]) => allowed.has(k))
  if (entries.length === 0) return

  const sets = entries.map(([k], i) => `${k} = $${i + 1}`).join(', ')
  const values = entries.map(([, v]) => v)

  await queryMarketplace(
    `UPDATE jobs SET ${sets}, updated_at = NOW() WHERE job_id = $${entries.length + 1} AND source_contract = $${entries.length + 2}`,
    [...values, jobId.toString(), sourceContract]
  )
}

export async function insertJobEvent(params: {
  jobId: bigint
  eventName: string
  eventData: Record<string, unknown>
  blockNumber: bigint
  blockTimestamp: Date
  txHash: string
  logIndex: number
  sourceContract: string
}) {
  await queryMarketplace(
    `INSERT INTO job_events (job_id, event_name, event_data, block_number, block_timestamp, tx_hash, log_index, source_contract)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT DO NOTHING`,
    [params.jobId.toString(), params.eventName, JSON.stringify(params.eventData), params.blockNumber.toString(), params.blockTimestamp, params.txHash, params.logIndex, params.sourceContract]
  )
}

// ─── Sync State ───────────────────────────────────────────────────────────────

export async function getSyncState(contractAddress: string) {
  const { rows } = await query(
    `SELECT * FROM sync_state WHERE contract_address = $1`,
    [contractAddress]
  )
  return rows[0] || null
}

export async function updateSyncState(contractAddress: string, lastSyncedBlock: bigint, eventsProcessed: number) {
  await query(
    `UPDATE sync_state SET
       last_synced_block = $1,
       total_events_processed = total_events_processed + $2,
       last_sync_at = NOW(),
       is_syncing = FALSE,
       updated_at = NOW()
     WHERE contract_address = $3`,
    [lastSyncedBlock.toString(), eventsProcessed, contractAddress]
  )
}

export async function setSyncing(contractAddress: string, syncing: boolean) {
  await query(
    `UPDATE sync_state SET is_syncing = $1, updated_at = NOW() WHERE contract_address = $2`,
    [syncing, contractAddress]
  )
}

export async function recordSyncError(contractAddress: string, error: string) {
  await query(
    `UPDATE sync_state SET error_count = error_count + 1, last_error = $1, last_error_at = NOW(), updated_at = NOW() WHERE contract_address = $2`,
    [error, contractAddress]
  )
}

// ─── Job Helpers ──────────────────────────────────────────────────────────────

export async function getJobProviderAgent(jobId: bigint, sourceContract: string): Promise<string | null> {
  const { rows } = await queryMarketplace(
    `SELECT provider_agent_id FROM jobs WHERE job_id = $1 AND source_contract = $2`,
    [jobId.toString(), sourceContract]
  )
  return rows[0]?.provider_agent_id || null
}

// ─── Metadata Queue ───────────────────────────────────────────────────────────

export async function enqueueMetadata(agentId: bigint, metadataUri: string, sourceContract: string = '') {
  await query(
    `INSERT INTO metadata_queue (agent_id, metadata_uri, source_contract) VALUES ($1, $2, $3)
     ON CONFLICT (agent_id) DO UPDATE SET metadata_uri = EXCLUDED.metadata_uri, source_contract = EXCLUDED.source_contract, status = 'pending', attempts = 0`,
    [agentId.toString(), metadataUri, sourceContract]
  )
}

export async function getPendingMetadata(limit: number = 10) {
  const { rows } = await query(
    `UPDATE metadata_queue SET status = 'fetching', last_attempt_at = NOW()
     WHERE id IN (
       SELECT id FROM metadata_queue WHERE status = 'pending' AND attempts < max_attempts ORDER BY created_at LIMIT $1
     )
     RETURNING *`,
    [limit]
  )
  return rows
}

export async function markMetadataDone(agentId: bigint) {
  await query(`UPDATE metadata_queue SET status = 'done' WHERE agent_id = $1`, [agentId.toString()])
}

export async function markMetadataFailed(agentId: bigint, error: string) {
  await query(
    `UPDATE metadata_queue SET status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'pending' END, attempts = attempts + 1, error = $1 WHERE agent_id = $2`,
    [error, agentId.toString()]
  )
}

export async function completeMarketplaceJob(onchainJobId: string, txHash: string, completedAt: Date) {
  await queryMarketplace(
    `UPDATE open_jobs SET status = 'completed', completed_tx = $2, completed_at = $3, updated_at = NOW()
     WHERE onchain_job_id = $1 AND status != 'completed'`,
    [onchainJobId, txHash, completedAt]
  )
}
