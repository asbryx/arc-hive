import { Hono } from 'hono'
import { query } from '../db.js'

export const openJobs = new Hono()

// POST /api/open-jobs — create an open job listing
openJobs.post('/', async (c) => {
  const body = await c.req.json()
  const { title, description, category, requirements, budgetMin, budgetMax, deadlineHours, clientAddress, jobId, onChainTx } = body

  if (!title || !description || !clientAddress) {
    return c.json({ error: 'title, description, and clientAddress required' }, 400)
  }

  const budgetMinRaw = budgetMin ? BigInt(Math.round(parseFloat(budgetMin) * 1_000_000)).toString() : null
  const budgetMaxRaw = budgetMax ? BigInt(Math.round(parseFloat(budgetMax) * 1_000_000)).toString() : null

  const result = await query(
    `INSERT INTO open_jobs (job_id, title, description, category, requirements, budget_min, budget_max, deadline_hours, client_address, on_chain_tx)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id`,
    [jobId || null, title, description, category || null, requirements || null, budgetMinRaw, budgetMaxRaw, deadlineHours || 72, clientAddress.toLowerCase(), onChainTx || null]
  )

  return c.json({ id: result.rows[0].id, jobId }, 201)
})

// GET /api/open-jobs — list open job listings
openJobs.get('/', async (c) => {
  const page = Math.max(1, parseInt(c.req.query('page') || '1'))
  const limit = Math.min(50, Math.max(1, parseInt(c.req.query('limit') || '20')))
  const offset = (page - 1) * limit
  const category = c.req.query('category')

  let where = "WHERE status = 'open'"
  const params: unknown[] = []
  let paramIdx = 1

  if (category) {
    where += ` AND category = $${paramIdx}`
    params.push(category)
    paramIdx++
  }

  const countResult = await query(`SELECT COUNT(*) FROM open_jobs ${where}`, params)
  const total = parseInt(countResult.rows[0].count)

  const result = await query(
    `SELECT oj.*, 
      (SELECT COUNT(*) FROM job_applications ja WHERE ja.job_id = oj.job_id) as application_count
     FROM open_jobs oj ${where}
     ORDER BY oj.created_at DESC
     LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
    [...params, limit, offset]
  )

  return c.json({
    data: result.rows.map(formatOpenJob),
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
  })
})

// GET /api/open-jobs/:id — single open job detail
openJobs.get('/:id', async (c) => {
  const id = c.req.param('id')

  const result = await query(
    `SELECT oj.*,
      (SELECT COUNT(*) FROM job_applications ja WHERE ja.job_id = oj.job_id) as application_count
     FROM open_jobs oj WHERE oj.id = $1 OR oj.job_id = $1::bigint`,
    [id]
  )

  if (result.rows.length === 0) {
    return c.json({ error: 'Not found' }, 404)
  }

  return c.json(formatOpenJob(result.rows[0]))
})

// POST /api/open-jobs/:id/apply — agent applies to a job
openJobs.post('/:id/apply', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const { applicantAddress, agentId, message, proposedBudget } = body

  if (!applicantAddress) {
    return c.json({ error: 'applicantAddress required' }, 400)
  }

  const jobResult = await query(
    `SELECT * FROM open_jobs WHERE id = $1 OR job_id = $1::bigint`,
    [id]
  )
  if (jobResult.rows.length === 0) {
    return c.json({ error: 'Job not found' }, 404)
  }

  const openJob = jobResult.rows[0]
  if (openJob.status !== 'open') {
    return c.json({ error: 'Job is no longer accepting applications' }, 400)
  }

  const budgetRaw = proposedBudget ? BigInt(Math.round(parseFloat(proposedBudget) * 1_000_000)).toString() : null

  try {
    const result = await query(
      `INSERT INTO job_applications (job_id, applicant_address, agent_id, message, proposed_budget)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [openJob.job_id, applicantAddress.toLowerCase(), agentId || null, message || null, budgetRaw]
    )
    return c.json({ id: result.rows[0].id }, 201)
  } catch (e: any) {
    if (e.code === '23505') {
      return c.json({ error: 'Already applied to this job' }, 409)
    }
    throw e
  }
})

// GET /api/open-jobs/:id/applications — list applications for a job
openJobs.get('/:id/applications', async (c) => {
  const id = c.req.param('id')

  // Get job_id from open_jobs
  const jobResult = await query(
    `SELECT job_id FROM open_jobs WHERE id = $1 OR job_id = $1::bigint`,
    [id]
  )
  if (jobResult.rows.length === 0) {
    return c.json({ error: 'Job not found' }, 404)
  }

  const jobId = jobResult.rows[0].job_id

  const result = await query(
    `SELECT ja.*, a.name as agent_name, a.score, a.completed_jobs
     FROM job_applications ja
     LEFT JOIN (
       SELECT agent_id, owner_address, name,
         (SELECT COUNT(*) FROM jobs WHERE provider_agent_id = agents.agent_id AND status = 3) as completed_jobs,
         0 as score
       FROM agents
     ) a ON lower(a.owner_address) = lower(ja.applicant_address)
     WHERE ja.job_id = $1
     ORDER BY ja.created_at ASC`,
    [jobId]
  )

  return c.json({
    data: result.rows.map(row => ({
      id: row.id,
      applicantAddress: row.applicant_address,
      agentId: row.agent_id ? parseInt(row.agent_id) : null,
      agentName: row.agent_name || null,
      completedJobs: parseInt(row.completed_jobs || '0'),
      message: row.message,
      proposedBudget: formatUsdc(row.proposed_budget),
      status: row.status,
      createdAt: row.created_at,
    })),
  })
})

// POST /api/open-jobs/:id/select — client selects an applicant
openJobs.post('/:id/select', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const { applicantAddress, clientAddress } = body

  if (!applicantAddress || !clientAddress) {
    return c.json({ error: 'applicantAddress and clientAddress required' }, 400)
  }

  const jobResult = await query(
    `SELECT * FROM open_jobs WHERE (id = $1 OR job_id = $1::bigint) AND lower(client_address) = lower($2)`,
    [id, clientAddress]
  )
  if (jobResult.rows.length === 0) {
    return c.json({ error: 'Job not found or not your job' }, 404)
  }

  // Update application status
  await query(
    `UPDATE job_applications SET status = 'selected' WHERE job_id = $1 AND lower(applicant_address) = lower($2)`,
    [jobResult.rows[0].job_id, applicantAddress]
  )
  // Reject others
  await query(
    `UPDATE job_applications SET status = 'rejected' WHERE job_id = $1 AND lower(applicant_address) != lower($2) AND status = 'pending'`,
    [jobResult.rows[0].job_id, applicantAddress]
  )
  // Update open job status
  await query(
    `UPDATE open_jobs SET status = 'assigned', updated_at = NOW() WHERE id = $1 OR job_id = $1::bigint`,
    [id]
  )

  return c.json({ success: true, message: 'Call setProvider on-chain to finalize' })
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatOpenJob(row: any) {
  return {
    id: row.id,
    jobId: row.job_id ? parseInt(row.job_id) : null,
    title: row.title,
    description: row.description,
    category: row.category,
    requirements: row.requirements,
    budgetMin: formatUsdc(row.budget_min),
    budgetMax: formatUsdc(row.budget_max),
    deadlineHours: row.deadline_hours,
    clientAddress: row.client_address,
    onChainTx: row.on_chain_tx,
    status: row.status,
    applicationCount: parseInt(row.application_count || '0'),
    createdAt: row.created_at,
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
