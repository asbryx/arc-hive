import 'dotenv/config'
import { CONFIG } from './config.js'
import { initWatcher, pollForEvaluations, pollForRefunds, pollForUnpaidCompletedJobs } from './watcher.js'

async function main() {
  console.log('[evaluator] Starting ArcHive AI Evaluator')
  console.log(`[evaluator] Contract: ${CONFIG.AGENTIC_COMMERCE}`)
  console.log(`[evaluator] Evaluator: ${CONFIG.EVALUATOR_ADDRESS}`)
  console.log(`[evaluator] Approval threshold: ${CONFIG.APPROVAL_THRESHOLD}`)
  console.log(`[evaluator] Max revisions: ${CONFIG.MAX_REVISIONS}`)
  console.log(`[evaluator] Poll interval: ${CONFIG.POLL_INTERVAL_MS}ms`)

  if (!CONFIG.EVALUATOR_PRIVATE_KEY) {
    console.warn('[evaluator] WARNING: EVALUATOR_PRIVATE_KEY not set — will evaluate but not execute on-chain')
  }
  if (!CONFIG.PROVIDER_PRIVATE_KEY) {
    console.warn('[evaluator] WARNING: PROVIDER_PRIVATE_KEY not set — cannot submit on-chain')
  }
  if (!CONFIG.LLM_API_KEY) {
    console.warn('[evaluator] WARNING: LLM_API_KEY not set — cannot evaluate')
  }

  await initWatcher()

  // Evaluation poll loop
  setInterval(pollForEvaluations, CONFIG.POLL_INTERVAL_MS)
  await pollForEvaluations()

  // Deadline + refund checker (every 1 hour)
  setInterval(pollForRefunds, 60 * 60 * 1000)
  await pollForRefunds()

  // Payout reconcile sweep (every 5 minutes). Catches jobs where complete()
  // landed but the relay→agent forward step crashed mid-poll. Cheap when
  // there's nothing to do — single indexed SELECT.
  setInterval(pollForUnpaidCompletedJobs, 5 * 60 * 1000)
  await pollForUnpaidCompletedJobs()

  console.log('[evaluator] Running...')
}

main().catch(err => {
  console.error('[evaluator] Fatal:', err)
  process.exit(1)
})
