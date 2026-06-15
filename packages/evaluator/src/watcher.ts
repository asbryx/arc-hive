import { CONFIG } from './config.js'
import {
  getPendingEvaluations, getPreviousEvaluations, storeEvaluation,
  updateJobAfterEvaluation, notifyAgent, recordRefund,
  getExpiredFundedJobs, getExpiredAssignedJobs,
  getStaleOpenJobs, getStaleAssignedUnfundedJobs,
  claimPayoutSlot, recordPayoutTx, releasePayoutSlot,
} from './db.js'
import { evaluateDeliverable, EvalResult } from './evaluate.js'
import { executeSubmit, executeComplete, executeReject, executeClaimRefund, executePayoutForward, getOnchainJobStatus, getOnchainJob } from './execute.js'

export async function initWatcher() {
  console.log('[evaluator] Watcher initialized — polling DB for deliverables to evaluate')
}

export async function pollForEvaluations() {
  try {
    // Step 1: Expire stale evaluating_locked locks.
    //
    // Audit fix T1 sub-P0 (2026-06-15): TTL was 10 minutes, but the LLM
    // call's own timeout is CONFIG.LLM_TIMEOUT_MS (default 60_000 = 60s).
    // If the LLM stalled between 60s and 10min, the lock sat idle for the
    // remainder of the TTL and the row was effectively stuck. Tightening
    // to 2 minutes — comfortably above the 60s LLM timeout, well below
    // the 15s poll interval × any reasonable backlog. If a future change
    // raises LLM_TIMEOUT_MS above 90s, raise this in proportion.
    try {
      const { query } = await import('./db.js')
      const expiredLocks = await query(
        `UPDATE open_jobs SET status = 'evaluating', updated_at = NOW()
         WHERE status = 'evaluating_locked'
         AND updated_at < NOW() - INTERVAL '2 minutes'
         RETURNING id, title`
      )
      if (expiredLocks.rows.length > 0) {
        console.log(`[evaluator] Released ${expiredLocks.rows.length} stale locks: ${expiredLocks.rows.map((r: any) => r.id).join(', ')}`)
      }
    } catch (err: any) {
      console.error('[evaluator] Lock cleanup error:', err.message)
    }

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
    // 0. Clean up stale open jobs (no applications after 48 hours)
    const staleOpen = await getStaleOpenJobs()
    if (staleOpen.length > 0) {
      console.log(`[deadline] Closed ${staleOpen.length} stale open job(s) (no applications after 48h)`)
      for (const job of staleOpen) {
        if (job.client_address) {
          await notifyAgent(job.client_address, 'job_expired', job.id,
            `"${job.title}" closed — no applications received after 48 hours.`)
        }
      }
    }

    // 0b. Clean up stale assigned jobs (selected but not funded after 24 hours)
    const staleAssigned = await getStaleAssignedUnfundedJobs()
    if (staleAssigned.length > 0) {
      console.log(`[deadline] Expired ${staleAssigned.length} stale assigned job(s) (not funded after 24h)`)
      for (const job of staleAssigned) {
        if (job.selected_applicant) {
          await notifyAgent(job.selected_applicant, 'job_expired', job.id,
            `"${job.title}" expired — client did not fund within 24 hours.`)
        }
        if (job.client_address) {
          await notifyAgent(job.client_address, 'job_expired', job.id,
            `"${job.title}" expired — you did not fund within 24 hours of selecting an agent.`)
        }
      }
    }

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

        // claimRefund() works for status 1 (FUNDED, never delivered),
        // 4 (REJECTED, after 3-strike fail), or 5 (EXPIRED, contract self-marked).
        // Bug fixed 2026-06-15: status 4 was missing — 3-strike-failed jobs
        // never got their refund triggered.
        if (onchainExpired && (onchainStatus === 1 || onchainStatus === 4 || onchainStatus === 5)) {
          console.log(`[deadline] Job ${openJobId} (on-chain ${jobId}) deadline passed (expiredAt=${new Date(Number(onchainJob.expiredAt) * 1000).toISOString()}), claiming refund...`)
          const txHash = await claimRefundWithRetry(BigInt(jobId))
          if (!txHash) {
            const { query } = await import('./db.js')
            await query(
              `UPDATE open_jobs SET status = 'refund_failed', updated_at = NOW() WHERE id = $1`,
              [openJobId]
            )
            console.error(`[CRITICAL] claimRefund failed after 3 attempts for job ${openJobId}. Manual intervention required.`)
            continue
          }
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

async function claimRefundWithRetry(jobId: bigint, maxAttempts = 3): Promise<string | null> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const txHash = await executeClaimRefund(jobId)
      return txHash
    } catch (err: any) {
      console.error(`[evaluator] claimRefund attempt ${attempt + 1}/${maxAttempts} failed for job ${jobId}:`, err.message)
      if (attempt < maxAttempts - 1) {
        await new Promise(r => setTimeout(r, 5000 * (attempt + 1)))
      }
    }
  }
  return null // All attempts failed
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

  // === PRE-VALIDATION: reject garbage before wasting LLM tokens ===
  const { preValidate } = await import('./validate.js')
  // We'll validate after fetching files (need content + files together)

  // Fetch files from deliverable_files table + analyze them
  const { analyzeFile } = await import('./file-analyzer.js')
  let fileContents: { filename: string; fileType: string; content: string; analysis?: any }[] = []
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
          // Analyze file
          const analysis = analyzeFile(file.filename, content)
          console.log(`[evaluator]   File: ${analysis.summary}`)
          fileContents.push({
            filename: file.filename,
            fileType: file.file_type,
            content: content.slice(0, 5000), // cap per file
            analysis,
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

  // Pre-validate deliverable (content + files)
  const validation = preValidate(job.deliverable_content, fileContents)
  if (!validation.valid) {
    console.log(`[evaluator] Pre-validation failed for job ${openJobId}: ${validation.reason}`)
    // Store as failed evaluation without calling LLM. Bug fixed 2026-06-15:
    // omitting evaluator_address violated the NOT NULL constraint, so every
    // pre-validation rejection threw and the deliverable looped on each poll.
    await query(
      `INSERT INTO evaluations (open_job_id, version, score, reasoning, suggestions, status, llm_model, evaluator_address)
       VALUES ($1, $2, 0, $3, 'Improve your deliverable and resubmit.', 'failed', 'pre-validation', $4)`,
      [openJobId, revisionNumber + 1, validation.reason, CONFIG.EVALUATOR_ADDRESS.toLowerCase()]
    )
    // Reject on-chain if needed
    if (jobId) {
      try {
        const onchainStatus = await getOnchainJobStatus(BigInt(jobId))
        if (onchainStatus === 2) {
          // Submitted on-chain — reject
          const txHash = await executeReject(BigInt(jobId), validation.reason!)
          console.log(`[evaluator] Rejected job ${openJobId} on-chain — tx=${txHash}`)
          await updateJobAfterEvaluation(openJobId, 'failed', { revisionCount: revisionNumber })
        } else {
          // Not submitted on-chain — just update DB
          await updateJobAfterEvaluation(openJobId, 'revision_requested', { revisionCount: revisionNumber + 1 })
        }
      } catch (err) {
        console.error(`[evaluator] On-chain reject error:`, (err as Error).message)
        await updateJobAfterEvaluation(openJobId, 'revision_requested', { revisionCount: revisionNumber + 1 })
      }
    } else {
      await updateJobAfterEvaluation(openJobId, 'revision_requested', { revisionCount: revisionNumber + 1 })
    }
    return
  }
  if (validation.warnings) {
    console.log(`[evaluator] Pre-validation warnings: ${validation.warnings.join(', ')}`)
  }

  // === CALL LLM (with fallback + multi-model) ===
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
      category: job.category || null,
      sectorConfig,
      files: fileContents.length > 0 ? fileContents : undefined,
    }, job.max_revisions ?? CONFIG.MAX_REVISIONS)
  } catch (err) {
    console.error(`[evaluator] All LLM providers failed for job ${openJobId}:`, (err as Error).message)
    // Queue for manual review instead of getting stuck in retry loop (E-06)
    await query(`UPDATE open_jobs SET status = 'evaluating_pending' WHERE id = $1`, [openJobId])
    console.warn(`[evaluator] Job ${openJobId} set to evaluating_pending — manual review needed`)
    return
  }

  const totalTokens = result.tokensUsed.input + result.tokensUsed.output
  console.log(`[evaluator] Job ${openJobId}: score=${result.score} decision=${result.decision} provider=${result.providerUsed} tokens=${totalTokens} cost=$${result.estimatedCost.toFixed(4)}`)

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

      // Step 3: route the off-chain transition through the canonical helper
      // so the deliverable row also flips to status='approved' and the
      // expires_at gets stamped. Bug fixed 2026-06-15: previously this
      // path only updated open_jobs.status, leaving the deliverable as
      // 'submitted' — files.deliverableStatus stayed 'submitted', the
      // /files endpoint returned downloadable=false to the client, and
      // the UI showed '⏳ Pending approval' next to the file forever
      // even though the job was complete and the agent had been paid.
      await updateJobAfterEvaluation(openJobId, 'completed', { completedTx: txHash })

      // Step 4: forward escrowed USDC from PLATFORM_RELAY → agent.
      // Audit fix T9 (2026-06-15): without this step the agent never sees a
      // cent — `complete()` releases funds to PLATFORM_RELAY, not to the
      // selected_applicant. Idempotent via the (claim → send → record) trio
      // and the unique index on open_jobs.payout_tx.
      await forwardPayoutToAgent(openJobId, job).catch((err: any) => {
        // Do NOT throw — `complete()` has already landed and the job is in
        // 'completed' status. A payout failure here is recoverable via the
        // reconcile sweep (getUnpaidCompletedJobs / scripts/backfill-payouts.ts).
        console.error(`[evaluator] Payout forward failed for job ${openJobId}: ${err.message} — will be picked up by reconcile sweep`)
      })
    } catch (err: any) {
      console.error(`[evaluator] On-chain error for job ${openJobId}:`, err.message)
      // Release the lock so it can be retried
      try {
        await query(
          `UPDATE open_jobs SET status = 'funded', updated_at = NOW() WHERE id = $1 AND status = 'evaluating_locked'`,
          [openJobId]
        )
      } catch (unlockErr: any) {
        console.error(`[evaluator] Failed to release lock for job ${openJobId}:`, unlockErr.message)
      }
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
      console.log(`[evaluator] FAILED job ${openJobId} — reject tx=${txHash}`)

      // IMPORTANT (bug fixed 2026-06-15): reject() does NOT auto-refund.
      // The contract just transitions status to REJECTED (4); funds stay
      // escrowed until expiredAt passes and someone calls claimRefund(),
      // which is what the deadline cron at the top of pollForEvaluations
      // does. We were marking the off-chain row as 'refunded' here and
      // emailing the client "USDC refunded" while their balance hadn't
      // actually moved — for up to 24 hours.
      //
      // Mark off-chain as 'failed' (terminal but still pre-refund). The
      // deadline-watcher will flip it to 'refunded' + record the actual
      // refund tx once claimRefund succeeds after expiredAt.
      await updateJobAfterEvaluation(openJobId, 'failed', {
        revisionCount: revisionNumber + 1,
      })

      // Notify client + agent (factual messages — refund pending, not done)
      if (job.client_address) {
        await notifyAgent(job.client_address, 'job_failed', openJobId,
          `Job "${job.title}" failed evaluation (3 attempts under threshold). USDC will be refunded once the job's deadline passes. reject tx: ${txHash}`)
      }
      if (job.selected_applicant) {
        await notifyAgent(job.selected_applicant, 'job_failed', openJobId,
          `Job "${job.title}" was rejected after 3 attempts. No payment will be released.`)
      }
    } catch (err: any) {
      console.error(`[evaluator] On-chain reject error for job ${openJobId}:`, err.message)
      // Release the lock so it can be retried
      try {
        await query(
          `UPDATE open_jobs SET status = 'funded', updated_at = NOW() WHERE id = $1 AND status = 'evaluating_locked'`,
          [openJobId]
        )
      } catch (unlockErr: any) {
        console.error(`[evaluator] Failed to release lock for job ${openJobId}:`, unlockErr.message)
      }
      return
    }

  } else if (result.decision === 'rejected') {
    // REVISION REQUESTED: off-chain only
    console.log(`[evaluator] Revision ${revisionNumber + 1}/${job.max_revisions ?? CONFIG.MAX_REVISIONS} requested for job ${openJobId}`)
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
    tokensUsed: totalTokens,
    costUsd: result.estimatedCost,
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

/**
 * Forward escrowed USDC from PLATFORM_RELAY → agent after a successful
 * on-chain complete(). Idempotent: claims a slot in open_jobs, sends the
 * tx, then records the hash. A second concurrent caller (different
 * evaluator process or a retry of the same poll) loses the claim and
 * exits without sending a duplicate transfer.
 *
 * Inputs come from the job row joined in getPendingEvaluations():
 *   - job.selected_applicant: recipient address (lowercased)
 *   - job.final_budget:       payout amount in USDC base units (string/numeric)
 *
 * If the on-chain transfer fails we release the claim so the next reconcile
 * sweep can retry. If the transfer succeeds but the record-tx write fails,
 * the unique partial index on open_jobs.payout_tx still protects against
 * a second send: on retry, claimPayoutSlot returns false (recipient already
 * set) and we read back the missing tx via getOnchainJob — actually no, we
 * just no-op and log. The relay's USDC balance is the source of truth.
 */
async function forwardPayoutToAgent(openJobId: number, job: any): Promise<void> {
  const recipient = (job.selected_applicant || '').toLowerCase()
  const finalBudget = job.final_budget

  if (!recipient || !/^0x[a-f0-9]{40}$/.test(recipient)) {
    console.warn(`[payout] Job ${openJobId}: missing/invalid selected_applicant, skipping payout`)
    return
  }
  if (!finalBudget) {
    console.warn(`[payout] Job ${openJobId}: missing final_budget, skipping payout`)
    return
  }

  const amount = BigInt(String(finalBudget))
  if (amount <= 0n) {
    console.warn(`[payout] Job ${openJobId}: non-positive final_budget=${finalBudget}, skipping payout`)
    return
  }

  // Phase 1: atomic claim — only one caller wins.
  const claimed = await claimPayoutSlot(openJobId, recipient, amount)
  if (!claimed) {
    console.log(`[payout] Job ${openJobId}: payout already claimed by another worker, skipping`)
    return
  }

  // Phase 2: send the on-chain transfer.
  let payoutTx: string
  try {
    payoutTx = await executePayoutForward(recipient as `0x${string}`, amount)
  } catch (err: any) {
    // Release the claim so the reconcile sweep can retry. If a tx actually
    // landed despite the throw (e.g. receipt timeout), the relay balance
    // will reflect it and a manual reconcile can be run.
    await releasePayoutSlot(openJobId).catch(() => {})
    throw new Error(`payout transfer failed: ${err.message}`)
  }

  // Phase 3: record the tx hash, locking the unique partial index.
  await recordPayoutTx(openJobId, payoutTx)
  console.log(`[payout] Job ${openJobId}: forwarded ${amount} USDC base-units to ${recipient} — tx=${payoutTx}`)
}

/**
 * Reconcile sweep: catch payouts that should have been forwarded but weren't.
 * Runs in the poll loop. Picks up:
 *   - jobs the evaluator completed before this fix shipped (handled by the
 *     standalone backfill script, but this is the runtime guard)
 *   - jobs where complete() landed but the forward step crashed mid-poll
 *
 * Safe to call frequently — the claim+send+record pattern is idempotent.
 */
export async function pollForUnpaidCompletedJobs() {
  try {
    const { getUnpaidCompletedJobs } = await import('./db.js')
    const jobs = await getUnpaidCompletedJobs()
    if (jobs.length === 0) return

    console.log(`[payout] Reconcile sweep: ${jobs.length} completed job(s) without payout_tx`)
    for (const job of jobs) {
      try {
        await forwardPayoutToAgent(job.id, job)
      } catch (err: any) {
        console.error(`[payout] Reconcile failed for job ${job.id}: ${err.message}`)
      }
    }
  } catch (err: any) {
    console.error(`[payout] Reconcile sweep error: ${err.message}`)
  }
}
