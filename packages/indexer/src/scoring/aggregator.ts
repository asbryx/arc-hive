import { query } from '../db/client.js'

const dirtyAgents = new Set<string>()

export function markDirty(agentId: bigint): void {
  dirtyAgents.add(agentId.toString())
}

export async function recomputeScores(): Promise<void> {
  if (dirtyAgents.size === 0) return

  const agentIds = [...dirtyAgents]
  dirtyAgents.clear()

  console.log(`[Scoring] Recomputing scores for ${agentIds.length} agents`)

  for (const agentIdStr of agentIds) {
    try {
      await recomputeAgentScore(BigInt(agentIdStr))
    } catch (err) {
      console.error(`[Scoring] Error for agent ${agentIdStr}:`, (err as Error).message)
    }
  }
}

async function recomputeAgentScore(agentId: bigint): Promise<void> {
  // Get reputation stats
  const repResult = await query(
    `SELECT
       COUNT(*) FILTER (WHERE NOT is_revoked) as total_feedback,
       COUNT(*) FILTER (WHERE NOT is_revoked AND value > 0) as positive,
       COUNT(*) FILTER (WHERE NOT is_revoked AND value < 0) as negative,
       COUNT(DISTINCT client_address) FILTER (WHERE NOT is_revoked) as unique_raters,
       AVG(value) FILTER (WHERE NOT is_revoked) as avg_score
     FROM reputation_events WHERE agent_id = $1`,
    [agentId.toString()]
  )

  // Get job stats (match by agent_id OR owner address)
  const agentOwnerResult = await query(
    `SELECT owner_address FROM agents WHERE agent_id = $1`,
    [agentId.toString()]
  )
  const ownerAddress = agentOwnerResult.rows[0]?.owner_address

  const jobResult = await query(
    `SELECT
       COUNT(*) as total_jobs,
       COUNT(*) FILTER (WHERE status = 3) as completed,
       COUNT(*) FILTER (WHERE status = 4) as rejected,
       COUNT(*) FILTER (WHERE status = 5) as expired,
       COALESCE(SUM(payment_released::numeric), 0) as total_earned
     FROM jobs WHERE provider_agent_id = $1 OR ($2 IS NOT NULL AND provider_address = $2)`,
    [agentId.toString(), ownerAddress || null]
  )

  // Get validation stats
  const valResult = await query(
    `SELECT
       COUNT(*) as total_validations,
       COUNT(*) FILTER (WHERE response_status = 1) as approved
     FROM validations WHERE agent_id = $1`,
    [agentId.toString()]
  )

  const rep = repResult.rows[0]
  const job = jobResult.rows[0]
  const val = valResult.rows[0]

  const totalJobs = parseInt(job.total_jobs) || 0
  const completedJobs = parseInt(job.completed) || 0
  const completionRate = totalJobs > 0 ? completedJobs / totalJobs : null
  const avgScore = rep.avg_score ? parseFloat(rep.avg_score) : null
  const approvedValidations = parseInt(val.approved) || 0

  // Compute trust tier
  let trustTier = 0
  if (completedJobs >= 3) trustTier = 1
  if (completedJobs >= 10 && (avgScore || 0) >= 70 && approvedValidations >= 1) trustTier = 2
  if (completedJobs >= 50 && (avgScore || 0) >= 90 && approvedValidations >= 2) trustTier = 3

  // Get activity timestamps
  const activityResult = await query(
    `SELECT
       MIN(block_timestamp) as first_active,
       MAX(block_timestamp) as last_active
     FROM (
       SELECT block_timestamp FROM reputation_events WHERE agent_id = $1
       UNION ALL
       SELECT created_timestamp as block_timestamp FROM jobs WHERE provider_agent_id = $1 OR ($2 IS NOT NULL AND provider_address = $2)
     ) combined`,
    [agentId.toString(), ownerAddress || null]
  )
  const activity = activityResult.rows[0]

  // Upsert score
  await query(
    `INSERT INTO agent_scores (
       agent_id, avg_score, total_feedback_count, positive_feedback_count, negative_feedback_count,
       unique_raters, total_jobs, completed_jobs, rejected_jobs, expired_jobs, completion_rate,
       total_earned, total_validations, approved_validations, trust_tier,
       first_active_at, last_active_at, computed_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW())
     ON CONFLICT (agent_id) DO UPDATE SET
       avg_score = EXCLUDED.avg_score,
       total_feedback_count = EXCLUDED.total_feedback_count,
       positive_feedback_count = EXCLUDED.positive_feedback_count,
       negative_feedback_count = EXCLUDED.negative_feedback_count,
       unique_raters = EXCLUDED.unique_raters,
       total_jobs = EXCLUDED.total_jobs,
       completed_jobs = EXCLUDED.completed_jobs,
       rejected_jobs = EXCLUDED.rejected_jobs,
       expired_jobs = EXCLUDED.expired_jobs,
       completion_rate = EXCLUDED.completion_rate,
       total_earned = EXCLUDED.total_earned,
       total_validations = EXCLUDED.total_validations,
       approved_validations = EXCLUDED.approved_validations,
       trust_tier = EXCLUDED.trust_tier,
       first_active_at = EXCLUDED.first_active_at,
       last_active_at = EXCLUDED.last_active_at,
       computed_at = NOW()`,
    [
      agentId.toString(), avgScore,
      parseInt(rep.total_feedback) || 0, parseInt(rep.positive) || 0, parseInt(rep.negative) || 0,
      parseInt(rep.unique_raters) || 0,
      totalJobs, completedJobs, parseInt(job.rejected) || 0, parseInt(job.expired) || 0,
      completionRate, job.total_earned || '0',
      parseInt(val.total_validations) || 0, approvedValidations, trustTier,
      activity?.first_active || null, activity?.last_active || null,
    ]
  )
}

let scoreInterval: ReturnType<typeof setInterval> | null = null

export function startScoring(): void {
  const interval = parseInt(process.env.SCORE_RECOMPUTE_INTERVAL_MS || '60000')
  console.log(`[Scoring] Starting (interval: ${interval}ms)`)

  scoreInterval = setInterval(async () => {
    try {
      await recomputeScores()
    } catch (err) {
      console.error(`[Scoring] Recompute error:`, (err as Error).message)
    }
  }, interval)
}

export function stopScoring(): void {
  if (scoreInterval) {
    clearInterval(scoreInterval)
    scoreInterval = null
  }
}
