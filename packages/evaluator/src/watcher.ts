import { CONFIG } from './config.js'
import { getPendingDeliverables, storeEvaluation, notifyAgent, updateJobStatus, query } from './db.js'
import { evaluateDeliverable, EvalResult } from './evaluate.js'
import { executeComplete } from './execute.js'

export async function initWatcher() {
  console.log('[evaluator] Watcher initialized — polling DB for delivered jobs')
}

export async function pollForSubmissions() {
  try {
    const jobs = await getPendingDeliverables()
    if (jobs.length === 0) return

    console.log(`[evaluator] Found ${jobs.length} job(s) to evaluate`)

    for (const job of jobs) {
      await processDeliverable(job)
    }
  } catch (err) {
    console.error('[evaluator] Poll error:', (err as Error).message)
  }
}

async function processDeliverable(job: any) {
  const jobId = job.job_id // on-chain job ID
  console.log(`[evaluator] Evaluating job "${job.title}" (open_jobs.id=${job.id}, on-chain=${jobId})`)

  if (!job.deliverable_content) {
    console.log(`[evaluator] Job ${job.id} has no deliverable content, skipping`)
    return
  }

  // Evaluate with LLM
  let result: EvalResult
  try {
    result = await evaluateDeliverable({
      jobTitle: job.title,
      jobDescription: job.description,
      requirements: job.requirements,
      deliverableContent: job.deliverable_content,
      deliverableLink: job.deliverable_link,
      deliverableNotes: job.deliverable_notes,
    })
  } catch (err) {
    console.error(`[evaluator] LLM error for job ${job.id}:`, (err as Error).message)
    return
  }

  console.log(`[evaluator] Job ${job.id}: score=${result.score} decision=${result.decision}`)

  let completionTx: string | undefined

  if (result.decision === 'approve' && jobId) {
    // Evaluator calls complete on-chain (releases USDC to provider)
    try {
      completionTx = await executeComplete(BigInt(jobId), result.reasoning)
      console.log(`[evaluator] APPROVED job ${job.id} — completed on-chain tx=${completionTx}`)
      await updateJobStatus(job.id, 'completed', completionTx)
    } catch (err: any) {
      if (err.message?.includes('not in Submitted state')) {
        console.log(`[evaluator] Job ${job.id} not yet submitted on-chain, will retry next poll`)
        return // Don't store evaluation yet — retry next cycle
      }
      console.error(`[evaluator] On-chain complete error for job ${job.id}:`, err.message)
      return
    }
  } else if (result.decision === 'revision') {
    console.log(`[evaluator] REVISION requested for job ${job.id}`)
    await updateJobStatus(job.id, 'revision_requested')
  } else {
    console.log(`[evaluator] REJECTED job ${job.id}`)
    await updateJobStatus(job.id, 'rejected')
  }

  // Store evaluation
  await storeEvaluation({
    onchainJobId: jobId?.toString() || '0',
    openJobId: job.id,
    score: result.score,
    reasoning: result.reasoning,
    decision: result.decision,
    completionTx,
  })

  // Notify agent
  if (job.selected_applicant) {
    const msg = result.decision === 'approve'
      ? `Your deliverable for "${job.title}" scored ${result.score}/100. Approved! Payment released.`
      : result.decision === 'revision'
      ? `Your deliverable for "${job.title}" scored ${result.score}/100. Revision needed: ${result.reasoning}`
      : `Your deliverable for "${job.title}" scored ${result.score}/100. Rejected: ${result.reasoning}`

    await notifyAgent(job.selected_applicant, 'evaluation_result', job.id, msg)
  }
}
