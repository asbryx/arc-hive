import { CONFIG } from './config.js'
import {
  query,
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

        // claimRefund() works for status 1 (FUNDED, never delivered) or
        // 5 (EXPIRED, contract self-marked).
        //
        // Audit T12 (2026-06-15): status 4 (REJECTED) is now handled inline
        // by failJobOnChain() — reject() instantly refunds in the same tx
        // and the off-chain row records refund_tx immediately. Keep the
        // status=4 branch here ONLY as a safety net for jobs that were
        // reject()'d BEFORE this fix shipped and never had their refund
        // recorded. Those rows will appear in `pollForRefunds` with
        // status='failed', refund_tx IS NULL — see getExpiredFundedJobs
        // for the actual selector.
        const includeStatus4 = await needsLegacyClaimRefund(openJobId)
        const eligibleStatuses = includeStatus4
          ? [1, 4, 5]
          : [1, 5]
        if (onchainExpired && eligibleStatuses.includes(onchainStatus)) {
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

  // Fetch files from deliverable_files table + analyze them.
  //
  // Audit T10/T11 (2026-06-15): this loop used to silently no-op when
  // Supabase was unreachable — every getFileAsText returned null, the
  // `if (content)` guard skipped the push, fileContents stayed empty,
  // and the LLM evaluated only the cover-note text. Now we count fetch
  // outcomes and shout when files exist in the DB but none reach the
  // evaluator (the only honest interpretation of that state).
  //
  // Scope note: this query intentionally returns ALL versions of all
  // files for the job, not just the latest version's files. That matches
  // the historic behaviour and is fine for prompts (the analyzer caps
  // per-file content), but worth revisiting if jobs accumulate many
  // revisions with bulky files.
  const { analyzeFile } = await import('./file-analyzer.js')
  let fileContents: { filename: string; fileType: string; content: string; analysis?: any }[] = []
  let dbFileCount = 0
  let fetchFailures = 0
  try {
    const filesResult = await query(
      `SELECT filename, file_type, storage_path FROM deliverable_files WHERE open_job_id = $1 ORDER BY id ASC`,
      [openJobId]
    )
    dbFileCount = filesResult.rows.length
    for (const file of filesResult.rows) {
      try {
        const { getFileAsText } = await import('./supabase.js')
        const content = await getFileAsText(file.storage_path)
        if (content) {
          const analysis = analyzeFile(file.filename, content)
          console.log(`[evaluator]   File: ${analysis.summary}`)
          fileContents.push({
            filename: file.filename,
            fileType: file.file_type,
            content: content.slice(0, 5000),
            analysis,
          })
        } else {
          fetchFailures++
          console.warn(`[evaluator] File fetch returned empty for ${file.filename} (path=${file.storage_path}) — see [supabase] error above`)
        }
      } catch (err) {
        fetchFailures++
        console.warn(`[evaluator] Could not read file ${file.filename}:`, (err as Error).message)
      }
    }
    if (fileContents.length > 0) {
      console.log(`[evaluator] Loaded ${fileContents.length}/${dbFileCount} files for job ${openJobId}`)
    } else if (dbFileCount > 0) {
      console.error(
        `[evaluator] CRITICAL: deliverable_files has ${dbFileCount} rows for job ${openJobId} ` +
          `but ZERO were loaded — Supabase misconfigured? LLM will only see the cover note text.`,
      )
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

    // Audit T9 (2026-06-15): pre-validation failures must count as strikes.
    // Previously this path just bumped revisionCount → 'revision_requested'
    // for every funded job (only the onchainStatus===2 branch terminated),
    // letting an agent re-submit garbage forever and never trip the
    // 3-strike refund. Now: treat preval the same as an LLM 'failed'
    // verdict on the final strike, so the on-chain reject + refund actually
    // fires and the client gets their money back.
    const maxStrikes = (job.max_revisions ?? CONFIG.MAX_REVISIONS) + 1
    const isFinalStrike = revisionNumber + 1 >= maxStrikes

    if (isFinalStrike && jobId) {
      console.log(`[evaluator] Pre-validation: final strike (${revisionNumber + 1}/${maxStrikes}) for job ${openJobId} — failing job`)
      await failJobOnChain(openJobId, jobId, job, validation.reason!, revisionNumber)
    } else if (jobId) {
      console.log(`[evaluator] Pre-validation: strike ${revisionNumber + 1}/${maxStrikes} for job ${openJobId} — revision requested`)
      await updateJobAfterEvaluation(openJobId, 'revision_requested', { revisionCount: revisionNumber + 1 })
    } else {
      // No on-chain job — purely off-chain test path
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
    // FINAL FAILURE: submit on-chain → reject on-chain (which refunds the client).
    try {
      txHash = await failJobOnChain(openJobId, jobId, job, result.reasoning, revisionNumber)
    } catch (err: any) {
      console.error(`[evaluator] On-chain reject error for job ${openJobId}:`, err.message)
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
 * Fail a job on-chain: submit-if-needed, reject (which refunds the client),
 * record the off-chain status + refund_tx + refunded_at, notify both sides.
 *
 * Audit fix T12 (2026-06-15): the contract's reject() INSTANTLY refunds the
 * client via an internal USDC Transfer in the same tx — verified on-chain
 * via job 65's reject tx 0xfa300b…72391. Previously this code claimed reject
 * was non-refunding and waited for a separate post-expiry claimRefund() to
 * trigger the refund. That was wrong; clients can wait up to 24h for nothing.
 *
 * The receipt parse in executeReject() returns the actual refund details so
 * the off-chain row records `refund_tx` = the reject tx hash (since the
 * Transfer log is inside it). The deadline-cron's claimRefund-for-rejected
 * path is now backwards-compat only (for jobs reject()'d before this fix).
 *
 * Returns the reject tx hash. Throws on on-chain failure; caller is
 * expected to release the lock and let the next poll retry.
 */
/**
 * True when an on-chain-REJECTED job in our DB has no refund_tx recorded,
 * meaning it was reject()'d before the T12 fix that records the refund
 * inline. Used to keep the deadline-cron's claimRefund path available
 * for those legacy rows only. New rejections are recorded synchronously.
 */
async function needsLegacyClaimRefund(openJobId: number): Promise<boolean> {
  const r = await query(
    `SELECT 1 FROM open_jobs WHERE id = $1 AND status IN ('failed', 'rejected') AND refund_tx IS NULL LIMIT 1`,
    [openJobId],
  )
  return r.rows.length > 0
}

async function failJobOnChain(
  openJobId: number,
  jobId: number,
  job: any,
  reason: string,
  revisionNumber: number,
): Promise<string> {
  const onchainStatus = await getOnchainJobStatus(BigInt(jobId))

  if (onchainStatus === 1) {
    console.log(`[evaluator] Submitting on-chain for final rejection of job ${jobId}...`)
    await executeSubmit(BigInt(jobId), job.deliverable_content || reason)
  }

  console.log(`[evaluator] Rejecting on-chain for job ${jobId}...`)
  const rejectResult = await executeReject(BigInt(jobId), reason)
  console.log(`[evaluator] FAILED job ${openJobId} — reject tx=${rejectResult.txHash}`)

  if (rejectResult.refund) {
    const usdc = Number(rejectResult.refund.amount) / 1_000_000
    console.log(`[evaluator] Refund: ${usdc} USDC -> ${rejectResult.refund.to} (inside reject tx)`)

    // Record the refund immediately. The reject tx IS the refund tx — they're
    // the same transaction; the USDC Transfer log lives inside it.
    await query(
      `UPDATE open_jobs
          SET status        = 'refunded',
              refund_tx     = $2,
              refunded_at   = NOW(),
              revision_count = $3,
              updated_at    = NOW()
        WHERE id = $1`,
      [openJobId, rejectResult.txHash, revisionNumber + 1],
    )
  } else {
    // Belt-and-braces fallback: if reject() ever stops auto-refunding (contract
    // upgrade, etc.), don't lie to the client. Mark as 'failed' and let the
    // deadline cron call claimRefund() after expiredAt.
    console.warn(`[evaluator] reject() did NOT emit a USDC Transfer log — falling back to deferred-refund flow. Investigate contract behaviour.`)
    await updateJobAfterEvaluation(openJobId, 'failed', { revisionCount: revisionNumber + 1 })
  }

  // Notify both sides factually based on what actually happened
  const refunded = !!rejectResult.refund
  if (job.client_address) {
    const msg = refunded
      ? `Job "${job.title}" failed evaluation (max attempts exceeded). USDC refunded. tx: ${rejectResult.txHash}`
      : `Job "${job.title}" failed evaluation (max attempts exceeded). USDC will be refunded once the deadline passes. reject tx: ${rejectResult.txHash}`
    await notifyAgent(job.client_address, refunded ? 'job_refunded' : 'job_failed', openJobId, msg)
  }
  if (job.selected_applicant) {
    await notifyAgent(
      job.selected_applicant,
      'job_failed',
      openJobId,
      `Job "${job.title}" was rejected after max attempts. No payment will be released.`,
    )
  }

  return rejectResult.txHash
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
