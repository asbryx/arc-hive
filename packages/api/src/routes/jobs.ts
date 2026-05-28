import { Hono } from 'hono'
import { query } from '../db.js'

export const jobs = new Hono()

function paginate(c: any) {
  const rawPage = parseInt(c.req.query('page') || '1')
  const rawLimit = parseInt(c.req.query('limit') || '20')
  const page = Number.isFinite(rawPage) ? Math.max(1, rawPage) : 1
  const limit = Number.isFinite(rawLimit) ? Math.min(100, Math.max(1, rawLimit)) : 20
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
  // Hide funded jobs with 0 budget (contract allows fund(0), looks broken in UI)
  conditions.push(`NOT (status = 1 AND (budget IS NULL OR budget = '0'))`)
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
    `SELECT j.*, (SELECT je.tx_hash FROM job_events je WHERE je.job_id = j.job_id AND je.event_name = 'JobCompleted' LIMIT 1) as completion_tx
     FROM jobs j ${where} ORDER BY ${orderBy} LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
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

// GET /api/jobs/open — only jobs with budget > 0
jobs.get('/open', async (c) => {
  const { page, limit, offset } = paginate(c)

  const countResult = await query(`SELECT COUNT(*) FROM jobs WHERE status = 0 AND budget IS NOT NULL AND budget != '0'`)
  const total = parseInt(countResult.rows[0].count)

  const result = await query(
    `SELECT * FROM jobs WHERE status = 0 AND budget IS NOT NULL AND budget != '0' ORDER BY created_timestamp DESC LIMIT $1 OFFSET $2`,
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

  // Get deliverable content if exists
  const deliverableResult = await query(
    `SELECT content, link, notes, created_at FROM job_deliverables WHERE job_id = $1`,
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
    deliverable: deliverableResult.rows.length > 0 ? {
      content: deliverableResult.rows[0].content,
      link: deliverableResult.rows[0].link,
      notes: deliverableResult.rows[0].notes,
      submittedAt: deliverableResult.rows[0].created_at,
    } : null,
    timeline: eventsResult.rows.map(e => ({
      event: e.event_name,
      data: e.event_data,
      timestamp: e.block_timestamp,
      txHash: e.tx_hash,
    })),
  })
})

// ─── Deliverables ─────────────────────────────────────────────────────────────

// POST /api/jobs/:id/deliverable — provider submits deliverable content
jobs.post('/:id/deliverable', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const { providerAddress, content, link, notes } = body

  if (!providerAddress || !content) {
    return c.json({ error: 'providerAddress and content required' }, 400)
  }

  // Verify job exists and caller is provider
  const jobResult = await query(`SELECT provider_address, status FROM jobs WHERE job_id = $1`, [id])
  if (jobResult.rows.length === 0) {
    return c.json({ error: 'Job not found' }, 404)
  }
  if (jobResult.rows[0].provider_address?.toLowerCase() !== providerAddress.toLowerCase()) {
    return c.json({ error: 'Only the provider can submit deliverables' }, 403)
  }

  try {
    await query(
      `INSERT INTO job_deliverables (job_id, provider_address, content, link, notes)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (job_id) DO UPDATE SET content = $3, link = $4, notes = $5, created_at = NOW()`,
      [id, providerAddress.toLowerCase(), content, link || null, notes || null]
    )
    return c.json({ success: true }, 201)
  } catch (e: any) {
    return c.json({ error: 'Failed to save deliverable' }, 500)
  }
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatJob(row: any) {
  const statusNames = ['Open', 'Funded', 'Submitted', 'Completed', 'Rejected', 'Expired']
  return {
    jobId: parseInt(row.job_id),
    client: row.client_address,
    provider: row.provider_address,
    providerAgentId: row.provider_agent_id ? parseInt(row.provider_agent_id) : null,
    description: row.description || null,
    status: statusNames[row.status] || 'Unknown',
    budget: formatUsdc(row.budget),
    createdAt: row.created_timestamp,
    completedAt: row.completed_at,
    txHash: row.completion_tx || null,
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
