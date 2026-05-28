import pg from 'pg'
import { CONFIG } from './config.js'

const pool = new pg.Pool({ connectionString: CONFIG.DATABASE_URL })

export async function query(text: string, params?: any[]) {
  return pool.query(text, params)
}

export async function getMarketplaceJob(onchainJobId: string) {
  const result = await query(
    `SELECT oj.*, md.content as deliverable_content, md.link as deliverable_link, md.notes as deliverable_notes, md.version
     FROM open_jobs oj
     LEFT JOIN marketplace_deliverables md ON md.open_job_id = oj.id AND md.status = 'submitted'
     WHERE oj.onchain_job_id = $1
     ORDER BY md.version DESC LIMIT 1`,
    [onchainJobId]
  )
  return result.rows[0] || null
}

export async function storeEvaluation(params: {
  onchainJobId: string, openJobId: number, score: number,
  reasoning: string, decision: string, completionTx?: string, version?: number
}) {
  await query(
    `INSERT INTO evaluations (onchain_job_id, open_job_id, score, reasoning, decision, completion_tx, llm_model)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (onchain_job_id) DO UPDATE SET score = $3, reasoning = $4, decision = $5, completion_tx = $6`,
    [params.onchainJobId, params.openJobId, params.score, params.reasoning, params.decision, params.completionTx || null, CONFIG.LLM_MODEL]
  )
}

export async function notifyAgent(address: string, type: string, refId: number, message: string) {
  await query(
    `INSERT INTO agent_notifications (agent_address, type, reference_id, message) VALUES ($1, $2, $3, $4)`,
    [address, type, refId, message]
  )
}

export async function closePool() { await pool.end() }
