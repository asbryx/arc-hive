import 'dotenv/config'
import { CONFIG } from './config.js'
import { initWatcher, pollForEvaluations, pollForRefunds } from './watcher.js'

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

  // Refund poll loop (every 5 min)
  setInterval(pollForRefunds, 5 * 60 * 1000)

  console.log('[evaluator] Running...')
}

main().catch(err => {
  console.error('[evaluator] Fatal:', err)
  process.exit(1)
})
