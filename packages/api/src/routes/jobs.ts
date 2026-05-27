import { Hono } from 'hono'
import { query } from '../db.js'

export const jobs = new Hono()

function paginate(c: any) {
  const page = Math.max(1, parseInt(c.req.query('page') || '1'))
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') || '20')))
  const offset = (page - 1) * limit
  return { page, limit, offset }
}

// GET /api/jobs — list all jobs
jobs.get('/', async (c) => {
  const { page, limit, offset } = paginate(c)

  const status = c.req.query('status')
  const minBudget = c.req.query('min_budget')
  const maxBudget = c.req.query('max_budget')
  const client = c.req.query('client')
  const provider = c.req.query('provider')
  const agentId = c.req.query('agent_id')
  const sort = c.req.query('sort') || 'newest'

  const conditions: string[] = []
  const params: unknown[] = []
  let paramIdx = 1

  if (status) {
    const statusMap: Record<string, number> = {
      open: 0, funded: 1, submitted: 2, completed: 3, rejected: 4, expired: 5,
    }
    const statusInt = statusMap[status.toLowerCase()]
    if (statusInt !== undefined) {
      conditions.push(`status = $${paramIdx}`)
      params.push(statusInt)
      paramIdx++
    }
  }
  if (minBudget) {
    conditions.push(`budget >= $${paramIdx}`)
    params.push(BigInt(Math.round(parseFloat(minBudget) * 1_000_000)).toString())
    paramIdx++
  }
  if (maxBudget) {
    conditions.push(`budget <= $${paramIdx}`)
    params.push(BigInt(Math.round(parseFloat(maxBudget) * 1_000_000)).toString())
    paramIdx++
  }
  if (client) {
    conditions.push(`client_address = $${paramIdx}`)
    params.push(client.toLowerCase())
    paramIdx++
  }
  if (provider) {
    conditions.push(`provider_address = $${paramIdx}`)
    params.push(provider.toLowerCase())
    paramIdx++
  }
  if (agentId) {
    conditions.push(`provider_agent_id = $${paramIdx}`)
    params.push(agentId)
    paramIdx++
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  const sortMap: Record<string, string> = {
    newest: 'created_timestamp DESC',
    oldest: 'created_timestamp ASC',
    budget_desc: 'COALESCE(budget, 0) DESC',
    budget_asc: 'COALESCE(budget, 0) ASC',
  }
  const orderBy = sortMap[sort] || sortMap.newest

  const countResult = await query(`SELECT COUNT(*) FROM jobs ${where}`, params)
  const total = parseInt(countResult.rows[0].count)

  const dataResult = await query(
    `SELECT * FROM jobs ${where} ORDER BY ${orderBy} LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
    [...params, limit, offset]
  )

  return c.json({
    data: dataResult.rows.map(formatJob),
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
  })
})

// GET /api/jobs/open
jobs.get('/open', async (c) => {
  const { page, limit, offset } = paginate(c)

  const countResult = await query(`SELECT COUNT(*) FROM jobs WHERE status = 0`)
  const total = parseInt(countResult.rows[0].count)

  const result = await query(
    `SELECT * FROM jobs WHERE status = 0 ORDER BY created_timestamp DESC LIMIT $1 OFFSET $2`,
    [limit, offset]
  )

  return c.json({
    data: result.rows.map(formatJob),
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
  })
})

// GET /api/jobs/stats
jobs.get('/stats', async (c) => {
  const result = await query(`
    SELECT
      COUNT(*) as total_jobs,
      COUNT(*) FILTER (WHERE status = 0) as open_jobs,
      COUNT(*) FILTER (WHERE status = 3) as completed_jobs,
      COUNT(*) FILTER (WHERE status = 4) as rejected_jobs,
      COALESCE(SUM(budget), 0) as total_budget,
      COALESCE(SUM(payment_released), 0) as total_paid,
      COALESCE(AVG(budget) FILTER (WHERE budget > 0), 0) as avg_budget,
      COUNT(DISTINCT client_address) as unique_clients,
      COUNT(DISTINCT provider_address) FILTER (WHERE provider_address IS NOT NULL) as unique_providers
    FROM jobs
  `)

  const row = result.rows[0]
  return c.json({
    totalJobs: parseInt(row.total_jobs),
    openJobs: parseInt(row.open_jobs),
    completedJobs: parseInt(row.completed_jobs),
    rejectedJobs: parseInt(row.rejected_jobs),
    totalBudget: formatUsdc(row.total_budget),
    totalPaid: formatUsdc(row.total_paid),
    avgBudget: formatUsdc(Math.round(parseFloat(row.avg_budget)).toString()),
    uniqueClients: parseInt(row.unique_clients),
    uniqueProviders: parseInt(row.unique_providers),
  })
})

// GET /api/jobs/:id — job detail with event timeline
jobs.get('/:id', async (c) => {
  const id = c.req.param('id')

  const jobResult = await query(`SELECT * FROM jobs WHERE job_id = $1`, [id])
  if (jobResult.rows.length === 0) {
    return c.json({ error: 'Job not found' }, 404)
  }

  const eventsResult = await query(
    `SELECT event_name, event_data, block_timestamp, tx_hash FROM job_events WHERE job_id = $1 ORDER BY block_number, log_index`,
    [id]
  )

  const job = jobResult.rows[0]
  const statusNames = ['Open', 'Funded', 'Submitted', 'Completed', 'Rejected', 'Expired']

  return c.json({
    jobId: parseInt(job.job_id),
    client: job.client_address,
    provider: job.provider_address,
    evaluator: job.evaluator_address,
    providerAgentId: job.provider_agent_id ? parseInt(job.provider_agent_id) : null,
    description: job.description,
    status: statusNames[job.status] || 'Unknown',
    budget: formatUsdc(job.budget),
    paymentToken: job.payment_token,
    hook: job.hook_address,
    expiredAt: job.expired_at,
    submittedAt: job.submitted_at,
    completedAt: job.completed_at,
    rejectedAt: job.rejected_at,
    deliverableHash: job.deliverable_hash,
    completionReason: job.completion_reason,
    rejectionReason: job.rejection_reason,
    paymentReleased: formatUsdc(job.payment_released),
    platformFeePaid: formatUsdc(job.platform_fee_paid),
    evaluatorFeePaid: formatUsdc(job.evaluator_fee_paid),
    refundAmount: formatUsdc(job.refund_amount),
    createdAt: job.created_timestamp,
    createdTx: job.created_tx,
    timeline: eventsResult.rows.map(e => ({
      event: e.event_name,
      data: e.event_data,
      timestamp: e.block_timestamp,
      txHash: e.tx_hash,
    })),
  })
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatJob(row: any) {
  const statusNames = ['Open', 'Funded', 'Submitted', 'Completed', 'Rejected', 'Expired']
  return {
    jobId: parseInt(row.job_id),
    client: row.client_address,
    provider: row.provider_address,
    providerAgentId: row.provider_agent_id ? parseInt(row.provider_agent_id) : null,
    status: statusNames[row.status] || 'Unknown',
    budget: formatUsdc(row.budget),
    createdAt: row.created_timestamp,
    completedAt: row.completed_at,
  }
}

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
