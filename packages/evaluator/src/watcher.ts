import { CONFIG } from './config.js'
import {
  getPendingEvaluations, getPreviousEvaluations, storeEvaluation,
  updateJobAfterEvaluation, notifyAgent, recordRefund,
  getExpiredFundedJobs, getExpiredAssignedJobs
} from './db.js'
import { evaluateDeliverable, EvalResult } from './evaluate.js'
import { executeSubmit, executeComplete, executeReject, executeClaimRefund, getOnchainJobStatus, getOnchainJob } from './execute.js'

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
  try {
    // 1. Expire assigned jobs (unfunded, past deadline)
    const expiredAssigned = await getExpiredAssignedJobs()
    if (expiredAssigned.length > 0) {
      console.log(`[deadline] Expired ${expiredAssigned.length} unfunded assigned job(s)`)
      for (const job of expiredAssigned) {
        if (job.selected_applicant) {
          await notifyAgent(job.selected_applicant, 'job_expired', job.id,
            `"${job.title}" expired — client did not fund in time.`)
        }
        if (job.client_address) {
          await notifyAgent(job.client_address, 'job_expired', job.id,
            `"${job.title}" expired — deadline passed without funding.`)
        }
      }
    }

    // 2. Check funded/in_progress jobs past deadline
    const expiredFunded = await getExpiredFundedJobs()
    if (expiredFunded.length === 0) return

    console.log(`[deadline] Found ${expiredFunded.length} funded job(s) past deadline`)

    for (const job of expiredFunded) {
      const openJobId = job.id
      const jobId = job.job_id

      if (!jobId) {
        const { query } = await import('./db.js')
        await query(`UPDATE open_jobs SET status = 'expired', updated_at = NOW() WHERE id = $1`, [openJobId])
        console.log(`[deadline] Expired marketplace job ${openJobId} (no on-chain job)`)
        if (job.client_address) {
          await notifyAgent(job.client_address, 'job_expired', openJobId,
            `"${job.title}" expired — deadline passed, no on-chain escrow.`)
        }
        continue
      }

      try {
        const onchainStatus = await getOnchainJobStatus(BigInt(jobId))

        // If on-chain deadline has passed, claim refund regardless of status
        // The contract status only updates to Expired when claimRefund() is called
        const onchainJob = await getOnchainJob(BigInt(jobId))
        const onchainExpired = onchainJob && Number(onchainJob.expiredAt) * 1000 < Date.now()

        if (onchainExpired && (onchainStatus === 1 || onchainStatus === 5)) {
          // Funded or Expired on-chain and deadline passed — claim refund
          console.log(`[deadline] Job ${openJobId} (on-chain ${jobId}) deadline passed (expiredAt=${new Date(Number(onchainJob.expiredAt) * 1000).toISOString()}), claiming refund...`)
          const txHash = await executeClaimRefund(BigInt(jobId))
          console.log(`[deadline] Refund claimed for job ${openJobId} — tx=${txHash}`)

          const { query } = await import('./db.js')
          await query(
            `UPDATE open_jobs SET status = 'refunded', refund_tx = $2, refunded_at = NOW(), updated_at = NOW() WHERE id = $1`,
            [openJobId, txHash]
          )

          if (job.client_address) {
            await notifyAgent(job.client_address, 'job_refunded', openJobId,
              `"${job.title}" expired. USDC refunded. tx: ${txHash}`)
          }
          if (job.selected_applicant) {
            await notifyAgent(job.selected_applicant, 'job_expired', openJobId,
              `"${job.title}" expired — deadline passed, USDC refunded to client.`)
          }
        } else if (onchainStatus === 1) {
          // Funded on-chain, deadline NOT passed yet
          console.log(`[deadline] Job ${openJobId} (on-chain ${jobId}) still funded on-chain, deadline not passed yet`)
        } else if (onchainStatus === 2) {
          // Submitted on-chain — let evaluator handle it
          console.log(`[deadline] Job ${openJobId} (on-chain ${jobId}) submitted on-chain, skipping`)
        } else {
          // Completed/Rejected on-chain — sync marketplace status
          const { query } = await import('./db.js')
          const statusMap: Record<number, string> = { 3: 'completed', 4: 'failed', 5: 'refunded' }
          const newStatus = statusMap[onchainStatus] || 'expired'
          await query(`UPDATE open_jobs SET status = $2, updated_at = NOW() WHERE id = $1`, [openJobId, newStatus])
          console.log(`[deadline] Synced job ${openJobId} to status ${newStatus} (on-chain status=${onchainStatus})`)
        }
      } catch (err: any) {
        console.error(`[deadline] Error processing job ${openJobId} (on-chain ${jobId}):`, err.message)
      }
    }
  } catch (err) {
    console.error('[deadline] Poll error:', (err as Error).message)
  }
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

  // Parse sector_config if stored as string (pg JSONB should auto-parse, but safety)
  const sectorConfig = typeof job.sector_config === 'string'
    ? JSON.parse(job.sector_config)
    : job.sector_config || null

  // Call LLM
  let result: EvalResult

  // Fetch files from deliverable_files table
  let fileContents: { filename: string; fileType: string; content: string }[] = []
  try {
    const filesResult = await query(
      `SELECT filename, file_type, storage_path FROM deliverable_files WHERE open_job_id = $1 ORDER BY id ASC`,
      [openJobId]
    )
    for (const file of filesResult.rows) {
      try {
        const { getFileAsText } = await import('./supabase.js')
        const content = await getFileAsText(file.storage_path)
        if (content) {
          fileContents.push({
            filename: file.filename,
            fileType: file.file_type,
            content: content.slice(0, 5000), // cap per file
          })
        }
      } catch (err) {
        console.warn(`[evaluator] Could not read file ${file.filename}:`, (err as Error).message)
      }
    }
    if (fileContents.length > 0) {
      console.log(`[evaluator] Loaded ${fileContents.length} files for job ${openJobId}`)
    }
  } catch (err) {
    console.warn(`[evaluator] Error fetching files:`, (err as Error).message)
  }

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
      category: job.category || null,
      sectorConfig,
      files: fileContents.length > 0 ? fileContents : undefined,
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
