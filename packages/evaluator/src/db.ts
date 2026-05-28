import pg from 'pg'
import { CONFIG } from './config.js'

const pool = new pg.Pool({ connectionString: CONFIG.DATABASE_URL })

export async function query(text: string, params?: any[]) {
  return pool.query(text, params)
}

export async function getPendingDeliverables() {
  const result = await query(
    `SELECT oj.*, md.content as deliverable_content, md.link as deliverable_link, md.notes as deliverable_notes, md.version
     FROM open_jobs oj
     JOIN marketplace_deliverables md ON md.open_job_id = oj.id AND md.status = 'submitted'
     WHERE oj.status = 'delivered'
     AND oj.job_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM evaluations e WHERE e.open_job_id = oj.id)
     ORDER BY md.created_at ASC`
  )
  return result.rows
}

export async function storeEvaluation(params: {
  onchainJobId: string, openJobId: number, score: number,
  reasoning: string, decision: string, completionTx?: string
}) {
  await query(
    `INSERT INTO evaluations (onchain_job_id, open_job_id, score, reasoning, decision, completion_tx, llm_model)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (onchain_job_id) DO UPDATE SET score = $3, reasoning = $4, decision = $5, completion_tx = $6`,
    [params.onchainJobId, params.openJobId, params.score, params.reasoning, params.decision, params.completionTx || null, CONFIG.LLM_MODEL]
  )
}

export async function updateJobStatus(openJobId: number, status: string, completedTx?: string) {
  if (status === 'completed') {
    await query(
      `UPDATE open_jobs SET status = 'completed', completed_tx = $2, completed_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [openJobId, completedTx || null]
    )
    await query(
      `UPDATE marketplace_deliverables SET status = 'approved' WHERE open_job_id = $1 AND status = 'submitted'`,
      [openJobId]
    )
  } else if (status === 'revision_requested') {
    await query(
      `UPDATE open_jobs SET status = 'delivered', updated_at = NOW() WHERE id = $1`,
      [openJobId]
    )
    await query(
      `UPDATE marketplace_deliverables SET status = 'revision_requested' WHERE open_job_id = $1 AND status = 'submitted'`,
      [openJobId]
    )
  } else if (status === 'rejected') {
    await query(
      `UPDATE open_jobs SET status = 'rejected', rejected_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [openJobId]
    )
    await query(
      `UPDATE marketplace_deliverables SET status = 'rejected' WHERE open_job_id = $1 AND status = 'submitted'`,
      [openJobId]
    )
  }
}

export async function notifyAgent(address: string, type: string, refId: number, message: string) {
  await query(
    `INSERT INTO agent_notifications (agent_address, type, reference_id, message) VALUES ($1, $2, $3, $4)`,
    [address, type, refId, message]
  )
}

export async function closePool() { await pool.end() }
