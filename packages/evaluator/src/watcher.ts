import { CONFIG } from './config.js'
import {
  getPendingEvaluations, getPreviousEvaluations, storeEvaluation,
  updateJobAfterEvaluation, notifyAgent, recordRefund
} from './db.js'
import { evaluateDeliverable, EvalResult } from './evaluate.js'
import { executeSubmit, executeComplete, executeReject, getOnchainJobStatus } from './execute.js'

export async function initWatcher() {
  console.log('[evaluator] Watcher initialized — polling DB for deliverables to evaluate')
}

export async function pollForEvaluations() {
  try {
    const jobs = await getPendingEvaluations()
    if (jobs.length === 0) return

    console.log(`[evaluator] Found ${jobs.length} job(s) to evaluate`)

    for (const job of jobs) {
      await processEvaluation(job)
    }
  } catch (err) {
    console.error('[evaluator] Poll error:', (err as Error).message)
  }
}

export async function pollForRefunds() {
  // No-op: contract's reject() auto-refunds USDC to client.
  // Refund is recorded at reject time in processEvaluation.
  // This function kept for backward compatibility but does nothing.
}

async function processEvaluation(job: any) {
  const jobId = job.job_id // on-chain job ID
  const openJobId = job.id
  console.log(`[evaluator] Evaluating job "${job.title}" (id=${openJobId}, on-chain=${jobId}, version=${job.version})`)

  if (!job.deliverable_content) {
    console.log(`[evaluator] Job ${openJobId} has no deliverable content, skipping`)
    return
  }

  // Lock: set status to 'evaluating_locked' to prevent duplicate processing
  const { query } = await import('./db.js')
  const lockResult = await query(
    `UPDATE open_jobs SET status = 'evaluating_locked' WHERE id = $1 AND status = 'evaluating' RETURNING id`,
    [openJobId]
  )
  if (lockResult.rows.length === 0) {
    // Another poll already grabbed it
    return
  }

  // Get previous evaluations for context
  const prevEvals = await getPreviousEvaluations(openJobId)
  const revisionNumber = prevEvals.length // 0 = first attempt, 1 = first revision, etc.

  // Call LLM
  let result: EvalResult
  try {
    result = await evaluateDeliverable({
      jobTitle: job.title,
      jobDescription: job.description,
      requirements: job.requirements,
      deliverableContent: job.deliverable_content,
      deliverableLink: job.deliverable_link,
      deliverableNotes: job.deliverable_notes,
      revisionNumber,
      previousEvaluations: prevEvals.map(e => ({
        score: e.score,
        reasoning: e.reasoning,
        suggestions: e.suggestions,
      })),
    }, job.max_revisions || CONFIG.MAX_REVISIONS)
  } catch (err) {
    console.error(`[evaluator] LLM error for job ${openJobId}:`, (err as Error).message)
    // Unlock — let next poll retry
    await query(`UPDATE open_jobs SET status = 'evaluating' WHERE id = $1`, [openJobId])
    return
  }

  console.log(`[evaluator] Job ${openJobId}: score=${result.score} decision=${result.decision}`)

  let txHash: string | null = null

  if (result.decision === 'approved' && jobId) {
    // APPROVED: submit on-chain → complete on-chain
    try {
      // Check on-chain status — if already funded (1), need to submit first
      const onchainStatus = await getOnchainJobStatus(BigInt(jobId))
      
      if (onchainStatus === 1) {
        // Funded — provider needs to submit on-chain
        console.log(`[evaluator] Submitting on-chain for job ${jobId}...`)
        await executeSubmit(BigInt(jobId), job.deliverable_content)
      }

      // Now complete
      console.log(`[evaluator] Completing on-chain for job ${jobId}...`)
      txHash = await executeComplete(BigInt(jobId), result.reasoning)
      console.log(`[evaluator] APPROVED job ${openJobId} — tx=${txHash}`)

      await updateJobAfterEvaluation(openJobId, 'completed', { completedTx: txHash })
    } catch (err: any) {
      console.error(`[evaluator] On-chain error for job ${openJobId}:`, err.message)
      return // Don't store evaluation — retry next poll
    }

  } else if (result.decision === 'failed' && jobId) {
    // FINAL FAILURE: submit on-chain → reject on-chain
    // Note: contract's reject() automatically refunds USDC to client
    try {
      const onchainStatus = await getOnchainJobStatus(BigInt(jobId))
      
      if (onchainStatus === 1) {
        console.log(`[evaluator] Submitting on-chain for final rejection of job ${jobId}...`)
        await executeSubmit(BigInt(jobId), job.deliverable_content)
      }

      console.log(`[evaluator] Rejecting on-chain for job ${jobId}...`)
      txHash = await executeReject(BigInt(jobId), result.reasoning)
      console.log(`[evaluator] FAILED job ${openJobId} — reject tx=${txHash} (refund included)`)

      // reject() auto-refunds, so mark as refunded immediately
      await updateJobAfterEvaluation(openJobId, 'refunded', {
        revisionCount: revisionNumber + 1,
      })
      await recordRefund(openJobId, txHash)

      // Notify client about refund
      if (job.client_address) {
        await notifyAgent(job.client_address, 'job_refunded', openJobId,
          `Job "${job.title}" failed. USDC refunded. tx: ${txHash}`)
      }
    } catch (err: any) {
      console.error(`[evaluator] On-chain reject error for job ${openJobId}:`, err.message)
      return
    }

  } else if (result.decision === 'rejected') {
    // REVISION REQUESTED: off-chain only
    console.log(`[evaluator] Revision ${revisionNumber + 1}/${job.max_revisions || CONFIG.MAX_REVISIONS} requested for job ${openJobId}`)
    await updateJobAfterEvaluation(openJobId, 'revision_requested', {
      revisionCount: revisionNumber + 1,
    })
  }

  // Store evaluation
  await storeEvaluation({
    openJobId,
    deliverableId: job.deliverable_id,
    version: job.version,
    score: result.score,
    breakdown: result.breakdown,
    reasoning: result.reasoning,
    suggestions: result.suggestions,
    status: result.decision,
    evaluatorAddress: CONFIG.EVALUATOR_ADDRESS,
    txHash,
    llmModel: CONFIG.LLM_MODEL,
  })

  // Notify agent
  if (job.selected_applicant) {
    let msg: string
    if (result.decision === 'approved') {
      msg = `✓ Deliverable for "${job.title}" scored ${result.score}/100. Approved! Payment released.`
    } else if (result.decision === 'rejected') {
      msg = `✗ Deliverable for "${job.title}" scored ${result.score}/100. Revision needed: ${result.reasoning}`
    } else {
      msg = `✗ Deliverable for "${job.title}" scored ${result.score}/100. Job failed after ${revisionNumber + 1} attempts. ${result.reasoning}`
    }
    await notifyAgent(job.selected_applicant, 'evaluation_result', openJobId, msg)
  }
}
