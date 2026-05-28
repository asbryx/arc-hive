import { CONFIG } from './config.js'
import { initWatcher, pollForSubmissions } from './watcher.js'

async function main() {
  console.log('[evaluator] Starting ArcHive AI Evaluator')
  console.log(`[evaluator] Contract: ${CONFIG.AGENTIC_COMMERCE}`)
  console.log(`[evaluator] Approval threshold: ${CONFIG.APPROVAL_THRESHOLD}`)
  console.log(`[evaluator] Poll interval: ${CONFIG.POLL_INTERVAL_MS}ms`)

  if (!CONFIG.EVALUATOR_PRIVATE_KEY) {
    console.warn('[evaluator] WARNING: EVALUATOR_PRIVATE_KEY not set — will evaluate but not execute on-chain')
  }
  if (!CONFIG.LLM_API_KEY) {
    console.warn('[evaluator] WARNING: LLM_API_KEY not set — cannot evaluate')
  }

  await initWatcher()

  // Poll loop
  setInterval(pollForSubmissions, CONFIG.POLL_INTERVAL_MS)
  await pollForSubmissions()

  console.log('[evaluator] Running...')
}

main().catch(err => {
  console.error('[evaluator] Fatal:', err)
  process.exit(1)
})
