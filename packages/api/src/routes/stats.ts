import { Hono } from 'hono'
import { query, queryAgents } from '../db.js'

export const stats = new Hono()

// GET /api/stats — ecosystem overview
stats.get('/', async (c) => {
  const [agentStats, marketplaceStats] = await Promise.all([
    queryAgents(`
      SELECT
        (SELECT COUNT(*) FROM agents) as total_agents,
        (SELECT COUNT(*) FROM reputation_events WHERE NOT is_revoked) as total_reputation_events,
        (SELECT COUNT(*) FROM validations) as total_validations,
        (SELECT COUNT(*) FROM agents WHERE registered_at > NOW() - INTERVAL '7 days') as agents_last_7d
    `),
    query(`
      SELECT
        (SELECT COUNT(*) FROM jobs) as total_jobs,
        (SELECT COUNT(*) FROM jobs WHERE status = 3) as completed_jobs,
        (SELECT COALESCE(SUM(payment_released), 0) FROM jobs) as total_volume,
        (SELECT COUNT(DISTINCT client_address) FROM jobs) as unique_clients,
        (SELECT COUNT(DISTINCT provider_address) FROM jobs WHERE provider_address IS NOT NULL) as unique_providers,
        (SELECT COUNT(*) FROM jobs WHERE created_timestamp > NOW() - INTERVAL '7 days') as jobs_last_7d
    `),
  ])

  const a = agentStats.rows[0]
  const m = marketplaceStats.rows[0]
  return c.json({
    totalAgents: parseInt(a.total_agents),
    totalReputationEvents: parseInt(a.total_reputation_events),
    totalValidations: parseInt(a.total_validations),
    totalJobs: parseInt(m.total_jobs),
    completedJobs: parseInt(m.completed_jobs),
    totalVolume: formatUsdc(m.total_volume),
    uniqueClients: parseInt(m.unique_clients),
    uniqueProviders: parseInt(m.unique_providers),
    last7Days: {
      newAgents: parseInt(a.agents_last_7d),
      newJobs: parseInt(m.jobs_last_7d),
    },
  })
})

// GET /api/stats/marketplace — ArcHive marketplace stats
stats.get('/marketplace', async (c) => {
  const result = await query(`
    SELECT
      (SELECT COUNT(*) FROM open_jobs) as total_marketplace_jobs,
      (SELECT COUNT(*) FROM open_jobs WHERE status IN ('open', 'assigned', 'funded', 'in_progress', 'delivered', 'evaluating', 'revision_requested')) as active_marketplace_jobs,
      (SELECT COUNT(*) FROM open_jobs WHERE status = 'completed') as completed_marketplace_jobs,
      (SELECT COALESCE(SUM(CAST(final_budget AS BIGINT)), 0) FROM open_jobs WHERE status = 'completed' AND final_budget IS NOT NULL) as marketplace_volume,
      (SELECT COUNT(*) FROM job_applications) as total_applications,
      (SELECT COUNT(DISTINCT client_address) FROM open_jobs) as marketplace_clients,
      (SELECT COUNT(DISTINCT selected_applicant) FROM open_jobs WHERE selected_applicant IS NOT NULL) as marketplace_providers
  `)
  const r = result.rows[0]
  return c.json({
    totalJobs: parseInt(r.total_marketplace_jobs),
    activeJobs: parseInt(r.active_marketplace_jobs),
    completedJobs: parseInt(r.completed_marketplace_jobs),
    volume: formatUsdc(r.marketplace_volume),
    totalApplications: parseInt(r.total_applications),
    clients: parseInt(r.marketplace_clients),
    providers: parseInt(r.marketplace_providers),
  })
})

// GET /api/stats/daily — daily activity for charts
stats.get('/daily', async (c) => {
  const rawDays = parseInt(c.req.query('days') || '30')
  const days = Number.isFinite(rawDays) ? Math.min(90, Math.max(1, rawDays)) : 30

  const [agentsDaily, jobsDaily, reputationDaily, volumeDaily] = await Promise.all([
    queryAgents(`
      SELECT DATE(registered_at) as day, COUNT(*) as count
      FROM agents
      WHERE registered_at > NOW() - INTERVAL '${days} days'
      GROUP BY DATE(registered_at)
      ORDER BY day
    `),
    query(`
      SELECT DATE(created_timestamp) as day, COUNT(*) as count
      FROM jobs
      WHERE created_timestamp > NOW() - INTERVAL '${days} days'
      GROUP BY DATE(created_timestamp)
      ORDER BY day
    `),
    queryAgents(`
      SELECT DATE(block_timestamp) as day, COUNT(*) as count
      FROM reputation_events
      WHERE block_timestamp > NOW() - INTERVAL '${days} days' AND NOT is_revoked
      GROUP BY DATE(block_timestamp)
      ORDER BY day
    `),
    query(`
      SELECT DATE(completed_at) as day, COALESCE(SUM(payment_released), 0) as total
      FROM jobs
      WHERE completed_at > NOW() - INTERVAL '${days} days' AND payment_released > 0
      GROUP BY DATE(completed_at)
      ORDER BY day
    `),
  ])

  return c.json({
    agents: agentsDaily.rows.map(r => ({ day: r.day, count: parseInt(r.count) })),
    jobs: jobsDaily.rows.map(r => ({ day: r.day, count: parseInt(r.count) })),
    reputation: reputationDaily.rows.map(r => ({ day: r.day, count: parseInt(r.count) })),
    volume: volumeDaily.rows.map(r => ({ day: r.day, count: Math.round(parseInt(r.total) / 1_000_000) })),
  })
})

function formatUsdc(raw: string | null): string | null {
  if (!raw || raw === '0') return null
  try {
    const num = BigInt(raw)
    const whole = num / 1_000_000n
    const frac = num % 1_000_000n
    return `${whole}.${frac.toString().padStart(6, '0').replace(/0+$/, '') || '0'}`
  } catch {
    return null
  }
}
