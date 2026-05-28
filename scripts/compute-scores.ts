import pg from 'pg'

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not set')
  process.exit(1)
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
})

async function main() {
  // Get all agents with reputation or jobs
  const agents = await pool.query(`
    SELECT DISTINCT agent_id FROM (
      SELECT agent_id FROM reputation_events WHERE NOT is_revoked
      UNION
      SELECT provider_agent_id as agent_id FROM jobs WHERE provider_agent_id IS NOT NULL
    ) combined WHERE agent_id IS NOT NULL
  `)
  console.log('Agents with activity:', agents.rows.length)

  let computed = 0
  for (const row of agents.rows) {
    const r = await pool.query(`
      SELECT COUNT(*) as total, AVG(value) as avg, COUNT(DISTINCT client_address) as raters
      FROM reputation_events WHERE agent_id = $1 AND NOT is_revoked
    `, [row.agent_id])

    const j = await pool.query(`
      SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = 3) as completed,
      COALESCE(SUM(payment_released), 0) as earned
      FROM jobs WHERE provider_agent_id = $1
    `, [row.agent_id])

    const totalJobs = parseInt(j.rows[0].total)
    const completed = parseInt(j.rows[0].completed)
    const rate = totalJobs > 0 ? completed / totalJobs : null
    const avgScore = r.rows[0].avg ? parseFloat(r.rows[0].avg) : null
    let tier = 0
    if (completed >= 10) tier = 2
    else if (completed >= 3) tier = 1

    await pool.query(`
      INSERT INTO agent_scores (agent_id, avg_score, total_feedback_count, unique_raters, total_jobs, completed_jobs, completion_rate, total_earned, trust_tier, computed_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      ON CONFLICT (agent_id) DO UPDATE SET
        avg_score = EXCLUDED.avg_score, total_feedback_count = EXCLUDED.total_feedback_count,
        unique_raters = EXCLUDED.unique_raters, total_jobs = EXCLUDED.total_jobs,
        completed_jobs = EXCLUDED.completed_jobs, completion_rate = EXCLUDED.completion_rate,
        total_earned = EXCLUDED.total_earned, trust_tier = EXCLUDED.trust_tier, computed_at = NOW()
    `, [row.agent_id, avgScore, parseInt(r.rows[0].total), parseInt(r.rows[0].raters), totalJobs, completed, rate, j.rows[0].earned, tier])
    computed++
  }

  console.log(`Computed scores for ${computed} agents`)
  const count = await pool.query('SELECT COUNT(*) FROM agent_scores')
  console.log('Total in agent_scores:', count.rows[0].count)

  await pool.end()
}

main().catch(e => { console.error(e); process.exit(1) })
