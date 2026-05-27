import { query, closePool } from '../packages/indexer/src/db/client.js'

async function main() {
  // Get all agents that have scores
  const agents = await query(`SELECT agent_id FROM agent_scores`)
  console.log(`Recomputing ${agents.rows.length} agents...`)

  for (const row of agents.rows) {
    const agentId = row.agent_id.toString()

    // Get reputation stats
    const repResult = await query(
      `SELECT
         COUNT(*) FILTER (WHERE NOT is_revoked) as total_feedback,
         COUNT(*) FILTER (WHERE NOT is_revoked AND value > 0) as positive,
         COUNT(*) FILTER (WHERE NOT is_revoked AND value < 0) as negative,
         COUNT(DISTINCT client_address) FILTER (WHERE NOT is_revoked) as unique_raters,
         AVG(value) FILTER (WHERE NOT is_revoked) as avg_score
       FROM reputation_events WHERE agent_id = $1`,
      [agentId]
    )

    // Get owner address
    const agentOwnerResult = await query(
      `SELECT owner_address FROM agents WHERE agent_id = $1`,
      [agentId]
    )
    const ownerAddress = agentOwnerResult.rows[0]?.owner_address

    // Get job stats
    const jobResult = await query(
      `SELECT
         COUNT(*) as total_jobs,
         COUNT(*) FILTER (WHERE status = 3) as completed,
         COALESCE(SUM(payment_released::numeric), 0) as total_earned
       FROM jobs WHERE provider_agent_id = $1 OR ($2::text IS NOT NULL AND provider_address = $2::text)`,
      [agentId, ownerAddress || null]
    )

    const rep = repResult.rows[0]
    const job = jobResult.rows[0]

    const completedJobs = parseInt(job.completed) || 0
    const avgScore = rep.avg_score ? parseFloat(rep.avg_score) : null
    const uniqueRaters = parseInt(rep.unique_raters) || 0
    const totalEarned = parseFloat(job.total_earned) || 0

    // Composite score
    const jobScore = Math.min(completedJobs / 50, 1) * 100
    const earnedUsdc = totalEarned / 1e6
    const earningsScore = earnedUsdc > 0 ? Math.min(Math.log10(earnedUsdc + 1) / 3, 1) * 100 : 0
    const repScore = avgScore ? (avgScore / 10000) * 100 : 0
    const raterScore = Math.min(uniqueRaters / 10, 1) * 100

    const hasJobs = completedJobs > 0
    const compositeScore = hasJobs
      ? (jobScore * 0.35) + (earningsScore * 0.35) + (repScore * 0.20) + (raterScore * 0.10)
      : (repScore * 0.15) + (raterScore * 0.05)

    await query(
      `UPDATE agent_scores SET composite_score = $1, computed_at = NOW() WHERE agent_id = $2`,
      [compositeScore, agentId]
    )
  }

  console.log('Done')
  await closePool()
}

main().catch(console.error)
