import { Hono } from 'hono'
import { query } from '../db.js'

export const stats = new Hono()

// GET /api/stats — ecosystem overview
stats.get('/', async (c) => {
  const result = await query(`
    SELECT
      (SELECT COUNT(*) FROM agents) as total_agents,
      (SELECT COUNT(*) FROM reputation_events WHERE NOT is_revoked) as total_reputation_events,
      (SELECT COUNT(*) FROM validations) as total_validations,
      (SELECT COUNT(*) FROM jobs) as total_jobs,
      (SELECT COUNT(*) FROM jobs WHERE status = 3) as completed_jobs,
      (SELECT COALESCE(SUM(payment_released), 0) FROM jobs) as total_volume,
      (SELECT COUNT(DISTINCT client_address) FROM jobs) as unique_clients,
      (SELECT COUNT(DISTINCT provider_address) FROM jobs WHERE provider_address IS NOT NULL) as unique_providers,
      (SELECT COUNT(*) FROM agents WHERE registered_at > NOW() - INTERVAL '7 days') as agents_last_7d,
      (SELECT COUNT(*) FROM jobs WHERE created_timestamp > NOW() - INTERVAL '7 days') as jobs_last_7d
  `)

  const row = result.rows[0]
  return c.json({
    totalAgents: parseInt(row.total_agents),
    totalReputationEvents: parseInt(row.total_reputation_events),
    totalValidations: parseInt(row.total_validations),
    totalJobs: parseInt(row.total_jobs),
    completedJobs: parseInt(row.completed_jobs),
    totalVolume: formatUsdc(row.total_volume),
    uniqueClients: parseInt(row.unique_clients),
    uniqueProviders: parseInt(row.unique_providers),
    last7Days: {
      newAgents: parseInt(row.agents_last_7d),
      newJobs: parseInt(row.jobs_last_7d),
    },
  })
})

// GET /api/stats/daily — daily activity for charts
stats.get('/daily', async (c) => {
  const days = Math.min(90, parseInt(c.req.query('days') || '30'))

  const agentsDaily = await query(`
    SELECT DATE(registered_at) as day, COUNT(*) as count
    FROM agents
    WHERE registered_at > NOW() - INTERVAL '${days} days'
    GROUP BY DATE(registered_at)
    ORDER BY day
  `)

  const jobsDaily = await query(`
    SELECT DATE(created_timestamp) as day, COUNT(*) as count
    FROM jobs
    WHERE created_timestamp > NOW() - INTERVAL '${days} days'
    GROUP BY DATE(created_timestamp)
    ORDER BY day
  `)

  const reputationDaily = await query(`
    SELECT DATE(block_timestamp) as day, COUNT(*) as count
    FROM reputation_events
    WHERE block_timestamp > NOW() - INTERVAL '${days} days' AND NOT is_revoked
    GROUP BY DATE(block_timestamp)
    ORDER BY day
  `)

  const volumeDaily = await query(`
    SELECT DATE(completed_at) as day, COALESCE(SUM(payment_released), 0) as total
    FROM jobs
    WHERE completed_at > NOW() - INTERVAL '${days} days' AND payment_released > 0
    GROUP BY DATE(completed_at)
    ORDER BY day
  `)

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
