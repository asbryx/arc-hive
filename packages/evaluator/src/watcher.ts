import { createPublicClient, http, parseAbiItem } from 'viem'
import { CONFIG } from './config.js'
import { getMarketplaceJob, storeEvaluation, notifyAgent, query } from './db.js'
import { evaluateDeliverable, EvalResult } from './evaluate.js'
import { executeComplete } from './execute.js'

const chain = {
  id: CONFIG.CHAIN_ID,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 6 },
  rpcUrls: { default: { http: [CONFIG.RPC_URL] } },
}

const publicClient = createPublicClient({ chain, transport: http(CONFIG.RPC_URL) })

let lastProcessedBlock = 0n

export async function initWatcher() {
  // Get last processed block from DB or start from recent
  const result = await query(
    `SELECT COALESCE(MAX(onchain_job_id), 0) as last FROM evaluations`
  )
  const headBlock = await publicClient.getBlockNumber()
  lastProcessedBlock = headBlock - 1000n // Look back 1000 blocks on startup
  console.log(`[evaluator] Starting from block ${lastProcessedBlock}, head: ${headBlock}`)
}

export async function pollForSubmissions() {
  try {
    const headBlock = await publicClient.getBlockNumber()
    if (lastProcessedBlock >= headBlock) return

    const logs = await publicClient.getLogs({
      address: CONFIG.AGENTIC_COMMERCE,
      event: parseAbiItem('event JobSubmitted(uint256 indexed jobId, address indexed provider, bytes32 deliverable)'),
      fromBlock: lastProcessedBlock + 1n,
      toBlock: headBlock,
    })

    for (const log of logs) {
      const jobId = log.args.jobId!
      await processSubmission(jobId)
    }

    lastProcessedBlock = headBlock
  } catch (err) {
    console.error('[evaluator] Poll error:', (err as Error).message)
  }
}

async function processSubmission(jobId: bigint) {
  const jobIdStr = jobId.toString()
  console.log(`[evaluator] Processing job ${jobIdStr}`)

  // Check if this is a marketplace job with us as evaluator
  const marketplaceJob = await getMarketplaceJob(jobIdStr)
  if (!marketplaceJob) {
    console.log(`[evaluator] Job ${jobIdStr} not in marketplace, skipping`)
    return
  }

  if (!marketplaceJob.deliverable_content) {
    console.log(`[evaluator] Job ${jobIdStr} has no deliverable content, skipping`)
    return
  }

  // Evaluate
  let result: EvalResult
  try {
    result = await evaluateDeliverable({
      jobTitle: marketplaceJob.title,
      jobDescription: marketplaceJob.description,
      requirements: marketplaceJob.requirements,
      deliverableContent: marketplaceJob.deliverable_content,
      deliverableLink: marketplaceJob.deliverable_link,
      deliverableNotes: marketplaceJob.deliverable_notes,
    })
  } catch (err) {
    console.error(`[evaluator] LLM error for job ${jobIdStr}:`, (err as Error).message)
    return
  }

  console.log(`[evaluator] Job ${jobIdStr}: score=${result.score} decision=${result.decision}`)

  // Execute decision
  let completionTx: string | undefined
  if (result.decision === 'approve') {
    try {
      completionTx = await executeComplete(jobId, result.reasoning)
      console.log(`[evaluator] APPROVED job ${jobIdStr} tx=${completionTx}`)
    } catch (err) {
      console.error(`[evaluator] Execute error for job ${jobIdStr}:`, (err as Error).message)
    }
  } else if (result.decision === 'revision') {
    // Don't execute on-chain, just notify
    console.log(`[evaluator] REVISION requested for job ${jobIdStr}`)
  } else {
    // Hard reject — let it expire
    console.log(`[evaluator] REJECTED job ${jobIdStr}`)
  }

  // Store evaluation
  await storeEvaluation({
    onchainJobId: jobIdStr,
    openJobId: marketplaceJob.id,
    score: result.score,
    reasoning: result.reasoning,
    decision: result.decision,
    completionTx,
  })

  // Notify agent
  if (marketplaceJob.selected_applicant) {
    const msg = result.decision === 'approve'
      ? `Your deliverable for "${marketplaceJob.title}" scored ${result.score}/100. Approved! Payment released.`
      : result.decision === 'revision'
      ? `Your deliverable for "${marketplaceJob.title}" scored ${result.score}/100. Revision needed: ${result.reasoning}`
      : `Your deliverable for "${marketplaceJob.title}" scored ${result.score}/100. Rejected.`

    await notifyAgent(marketplaceJob.selected_applicant, 'evaluation_result', marketplaceJob.id, msg)
  }
}
