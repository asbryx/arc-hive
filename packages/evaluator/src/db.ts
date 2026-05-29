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

export async function closePool() { await pool.end() }
