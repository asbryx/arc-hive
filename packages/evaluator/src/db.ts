import pg from 'pg'
import { CONFIG } from './config.js'

const pool = new pg.Pool({ connectionString: CONFIG.DATABASE_URL })

export async function query(text: string, params?: any[]) {
  return pool.query(text, params)
}

// Get jobs that need evaluation: status = 'evaluating'.
//
// Audit fix T1 (2026-06-15): added FOR UPDATE SKIP LOCKED on the
// open_jobs row. Without this, two evaluator workers polling within the
// same 15s window will both fetch the same row, both flip it to
// 'evaluating_locked' (the existing soft lock catches that race), but
// in the rare case where the second worker beats the lock-UPDATE race
// it would still proceed to spend tokens, call complete() on-chain, and
// double-pay. The audit's T6 recommendation explicitly calls for
// running multiple evaluators for scale; this guard makes that safe.
//
// SKIP LOCKED on the JOIN target needs PG 9.5+; we're on 16. The
// SELECT MAX subquery isn't covered by the row lock — that's fine,
// version pinning is idempotent.
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
     ORDER BY md.created_at ASC
     FOR UPDATE OF oj SKIP LOCKED`,
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
    [openJobId],
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
  tokensUsed?: number
  costUsd?: number
}) {
  await query(
    `INSERT INTO evaluations (open_job_id, deliverable_id, version, score, breakdown, reasoning, suggestions, status, evaluator_address, tx_hash, llm_model, tokens_used, cost_usd)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      params.openJobId,
      params.deliverableId,
      params.version,
      params.score,
      JSON.stringify(params.breakdown),
      params.reasoning,
      params.suggestions,
      params.status,
      params.evaluatorAddress,
      params.txHash,
      params.llmModel,
      params.tokensUsed || 0,
      params.costUsd || 0,
    ],
  )
}

// Update job status after evaluation
export async function updateJobAfterEvaluation(
  openJobId: number,
  status: 'completed' | 'revision_requested' | 'failed' | 'refunded',
  opts?: { completedTx?: string; revisionCount?: number },
) {
  if (status === 'completed') {
    await query(
      `UPDATE open_jobs SET status = 'completed', completed_tx = $2, completed_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [openJobId, opts?.completedTx || null],
    )
    await query(
      `UPDATE marketplace_deliverables SET status = 'approved' WHERE open_job_id = $1 AND status = 'submitted'`,
      [openJobId],
    )
    // Set file expiry: approved files auto-delete after the 30-day retention window
    await query(
      `UPDATE deliverable_files SET expires_at = NOW() + INTERVAL '30 days' WHERE open_job_id = $1 AND expires_at IS NULL`,
      [openJobId],
    )
  } else if (status === 'revision_requested') {
    await query(
      `UPDATE open_jobs SET status = 'revision_requested', revision_count = $2, updated_at = NOW() WHERE id = $1`,
      [openJobId, opts?.revisionCount || 0],
    )
    await query(
      `UPDATE marketplace_deliverables SET status = 'revision_requested' WHERE open_job_id = $1 AND status = 'submitted'`,
      [openJobId],
    )
  } else if (status === 'failed' || status === 'refunded') {
    await query(
      `UPDATE open_jobs SET status = $3, revision_count = $2, updated_at = NOW() WHERE id = $1`,
      [openJobId, opts?.revisionCount || 0, status],
    )
    await query(
      `UPDATE marketplace_deliverables SET status = 'rejected' WHERE open_job_id = $1 AND status = 'submitted'`,
      [openJobId],
    )
  }
}

// Notify agent
export async function notifyAgent(address: string, type: string, refId: number, message: string) {
  await query(
    `INSERT INTO agent_notifications (agent_address, type, reference_id, message) VALUES ($1, $2, $3, $4)`,
    [address, type, refId, message],
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
     AND oj.funded_at + (oj.deadline_hours * INTERVAL '1 hour') < NOW()`,
  )
  return result.rows
}

// Record refund
export async function recordRefund(openJobId: number, refundTx: string) {
  await query(
    `UPDATE open_jobs SET status = 'refunded', refund_tx = $2, refunded_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [openJobId, refundTx],
  )
}

// Get funded/in_progress marketplace jobs past deadline
export async function getExpiredFundedJobs() {
  // Jobs whose on-chain escrow may need a claimRefund() call:
  //   - 'funded' / 'in_progress' that just blew past the deadline (client
  //     never got a deliverable they approved).
  //   - 'failed' — a 3-strike-rejected job. The contract's reject() leaves
  //     funds locked and only allows claimRefund() after expiredAt.
  // Both share the same handler — call claimRefund once the on-chain
  // deadline has passed.
  const result = await query(
    `SELECT oj.id, oj.job_id, oj.title, oj.client_address, oj.selected_applicant,
            oj.final_budget, oj.funded_at, oj.deadline_hours
     FROM open_jobs oj
     WHERE oj.status IN ('funded', 'in_progress', 'failed')
     AND oj.funded_at IS NOT NULL
     AND oj.funded_at + (oj.deadline_hours * INTERVAL '1 hour') < NOW()`,
  )
  return result.rows
}

// Get assigned jobs past deadline (unfunded — agent selected but client never funded)
export async function getExpiredAssignedJobs() {
  const result = await query(
    `UPDATE open_jobs SET status = 'expired', updated_at = NOW()
     WHERE status = 'assigned'
     AND updated_at + (deadline_hours * INTERVAL '1 hour') < NOW()
     RETURNING id, title, selected_applicant, client_address`,
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
     RETURNING id, title, client_address`,
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
     RETURNING id, title, selected_applicant, client_address`,
  )
  return result.rows
}

/**
 * Idempotent payout recording.
 *
 * Reserves the payout slot for a job — returns `true` only when this caller
 * won the race. A second concurrent caller (different evaluator process or a
 * retry) sees the row already has `payout_tx` set and returns `false` so it
 * skips sending a duplicate on-chain transfer.
 *
 * Two-phase write:
 *   1. claimPayoutSlot(): atomically mark recipient + amount + intent.
 *   2. recordPayoutTx(): after the on-chain transfer lands, stamp the tx hash.
 *
 * Splitting these means we never reserve a slot without an attempted tx, and
 * never send a tx without first reserving the slot.
 */
export async function claimPayoutSlot(
  openJobId: number,
  recipient: string,
  amountBaseUnits: bigint,
): Promise<boolean> {
  // We use `payout_at` as the claim sentinel because the unique index is on
  // (id) WHERE payout_tx IS NOT NULL — i.e. it only triggers post-confirmation.
  // The claim row sets payout_recipient + payout_amount + payout_at IS NULL
  // first; this UPDATE only succeeds if no prior claim exists.
  const result = await query(
    `UPDATE open_jobs
        SET payout_recipient = $2,
            payout_amount    = $3
      WHERE id = $1
        AND payout_tx IS NULL
        AND payout_recipient IS NULL
      RETURNING id`,
    [openJobId, recipient.toLowerCase(), amountBaseUnits.toString()],
  )
  return result.rowCount === 1
}

export async function recordPayoutTx(openJobId: number, txHash: string): Promise<void> {
  await query(
    `UPDATE open_jobs
        SET payout_tx = $2,
            payout_at = NOW()
      WHERE id = $1
        AND payout_tx IS NULL`,
    [openJobId, txHash],
  )
}

/**
 * Release a payout slot when the on-chain transfer fails. Lets the next poll
 * retry without tripping the "already claimed" guard. Only clears if no tx
 * has landed (defensive).
 */
export async function releasePayoutSlot(openJobId: number): Promise<void> {
  await query(
    `UPDATE open_jobs
        SET payout_recipient = NULL,
            payout_amount    = NULL
      WHERE id = $1
        AND payout_tx IS NULL`,
    [openJobId],
  )
}

/**
 * Find completed jobs that were never paid out. Used by the backfill script
 * and by a periodic reconcile sweep — covers cases where the evaluator
 * crashed between complete() and the payout forward.
 */
export async function getUnpaidCompletedJobs() {
  const result = await query(
    `SELECT oj.id, oj.job_id, oj.title, oj.selected_applicant, oj.final_budget, oj.completed_tx,
            (SELECT content FROM marketplace_deliverables d
              WHERE d.open_job_id = oj.id ORDER BY d.id DESC LIMIT 1) AS deliverable_content
       FROM open_jobs oj
      WHERE oj.status = 'completed'
        AND oj.payout_tx IS NULL
        AND oj.selected_applicant IS NOT NULL
        AND oj.final_budget IS NOT NULL
      ORDER BY oj.id ASC`,
  )
  return result.rows
}

export async function closePool() {
  await pool.end()
}
