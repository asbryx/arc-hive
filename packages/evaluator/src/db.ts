import pg from 'pg'
import { CONFIG } from './config.js'

const pool = new pg.Pool({ connectionString: CONFIG.DATABASE_URL })

export async function query(text: string, params?: any[]) {
  return pool.query(text, params)
}

// Get jobs that need evaluation: status = 'evaluating'
export async function getPendingEvaluations() {
  const result = await query(
    `SELECT oj.*, 
            md.id as deliverable_id, md.content as deliverable_content, 
            md.link as deliverable_link, md.notes as deliverable_notes, md.version
     FROM open_jobs oj
     JOIN marketplace_deliverables md ON md.open_job_id = oj.id
     WHERE oj.status = 'evaluating'
     AND md.status = 'submitted'
     AND md.version = (SELECT MAX(version) FROM marketplace_deliverables WHERE open_job_id = oj.id)
     ORDER BY md.created_at ASC`
  )
  return result.rows
}

// Get previous evaluations for a job (for revision context)
export async function getPreviousEvaluations(openJobId: number) {
  const result = await query(
    `SELECT score, reasoning, suggestions, version, status
     FROM evaluations
     WHERE open_job_id = $1
     ORDER BY version ASC`,
    [openJobId]
  )
  return result.rows
}

// Store evaluation result
export async function storeEvaluation(params: {
  openJobId: number
  deliverableId: number
  version: number
  score: number
  breakdown: any
  reasoning: string
  suggestions: string | null
  status: 'approved' | 'rejected' | 'failed'
  evaluatorAddress: string
  txHash: string | null
  llmModel: string
}) {
  await query(
    `INSERT INTO evaluations (open_job_id, deliverable_id, version, score, breakdown, reasoning, suggestions, status, evaluator_address, tx_hash, llm_model)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [params.openJobId, params.deliverableId, params.version, params.score,
     JSON.stringify(params.breakdown), params.reasoning, params.suggestions,
     params.status, params.evaluatorAddress, params.txHash, params.llmModel]
  )
}

// Update job status after evaluation
export async function updateJobAfterEvaluation(
  openJobId: number,
  status: 'completed' | 'revision_requested' | 'failed' | 'refunded',
  opts?: { completedTx?: string; revisionCount?: number }
) {
  if (status === 'completed') {
    await query(
      `UPDATE open_jobs SET status = 'completed', completed_tx = $2, completed_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [openJobId, opts?.completedTx || null]
    )
    await query(
      `UPDATE marketplace_deliverables SET status = 'approved' WHERE open_job_id = $1 AND status = 'submitted'`,
      [openJobId]
    )
    // Set file expiry: files auto-delete after 24 hours
    await query(
      `UPDATE deliverable_files SET expires_at = NOW() + INTERVAL '30 days' WHERE open_job_id = $1 AND expires_at IS NULL`,
      [openJobId]
    )
  } else if (status === 'revision_requested') {
    await query(
      `UPDATE open_jobs SET status = 'revision_requested', revision_count = $2, updated_at = NOW() WHERE id = $1`,
      [openJobId, opts?.revisionCount || 0]
    )
    await query(
      `UPDATE marketplace_deliverables SET status = 'revision_requested' WHERE open_job_id = $1 AND status = 'submitted'`,
      [openJobId]
    )
  } else if (status === 'failed' || status === 'refunded') {
    await query(
      `UPDATE open_jobs SET status = $3, revision_count = $2, updated_at = NOW() WHERE id = $1`,
      [openJobId, opts?.revisionCount || 0, status]
    )
    await query(
      `UPDATE marketplace_deliverables SET status = 'rejected' WHERE open_job_id = $1 AND status = 'submitted'`,
      [openJobId]
    )
  }
}

// Notify agent
export async function notifyAgent(address: string, type: string, refId: number, message: string) {
  await query(
    `INSERT INTO agent_notifications (agent_address, type, reference_id, message) VALUES ($1, $2, $3, $4)`,
    [address, type, refId, message]
  )
}

// Get failed jobs past expiry for refund processing
export async function getFailedJobsForRefund() {
  const result = await query(
    `SELECT oj.id, oj.job_id, oj.title, oj.client_address, oj.final_budget
     FROM open_jobs oj
     WHERE oj.status = 'failed'
     AND oj.refund_tx IS NULL
     AND oj.job_id IS NOT NULL
     AND oj.funded_at + (oj.deadline_hours * INTERVAL '1 hour') < NOW()`
  )
  return result.rows
}

// Record refund
export async function recordRefund(openJobId: number, refundTx: string) {
  await query(
    `UPDATE open_jobs SET status = 'refunded', refund_tx = $2, refunded_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [openJobId, refundTx]
  )
}

// Get funded/in_progress marketplace jobs past deadline
export async function getExpiredFundedJobs() {
  const result = await query(
    `SELECT oj.id, oj.job_id, oj.title, oj.client_address, oj.selected_applicant,
            oj.final_budget, oj.funded_at, oj.deadline_hours
     FROM open_jobs oj
     WHERE oj.status IN ('funded', 'in_progress')
     AND oj.funded_at IS NOT NULL
     AND oj.funded_at + (oj.deadline_hours * INTERVAL '1 hour') < NOW()`
  )
  return result.rows
}

// Get assigned jobs past deadline (unfunded — agent selected but client never funded)
export async function getExpiredAssignedJobs() {
  const result = await query(
    `UPDATE open_jobs SET status = 'expired', updated_at = NOW()
     WHERE status = 'assigned'
     AND updated_at + (deadline_hours * INTERVAL '1 hour') < NOW()
     RETURNING id, title, selected_applicant, client_address`
  )
  return result.rows
}

// Get stale open jobs (no applications after 48 hours)
export async function getStaleOpenJobs() {
  const result = await query(
    `UPDATE open_jobs SET status = 'expired', updated_at = NOW()
     WHERE status = 'open'
     AND created_at + INTERVAL '48 hours' < NOW()
     AND NOT EXISTS (
       SELECT 1 FROM job_applications ja WHERE ja.job_id = open_jobs.id
     )
     RETURNING id, title, client_address`
  )
  return result.rows
}

// Get stale assigned jobs (selected but not funded after 24 hours)
export async function getStaleAssignedUnfundedJobs() {
  const result = await query(
    `UPDATE open_jobs SET status = 'expired', updated_at = NOW()
     WHERE status = 'assigned'
     AND funded_at IS NULL
     AND updated_at + INTERVAL '24 hours' < NOW()
     RETURNING id, title, selected_applicant, client_address`
  )
  return result.rows
}

export async function closePool() { await pool.end() }
