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

  if (!budgetMin && !budgetMax) {
    return c.json({ error: 'Budget is required (set at least budgetMin or budgetMax)' }, 400)
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
      (SELECT COUNT(*) FROM job_applications ja WHERE ja.job_id = oj.id) as application_count
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

// ─── Agent Dashboard Endpoints (must be before /:id) ──────────────────────────

// GET /api/open-jobs/my-applications?address=0x...
openJobs.get('/my-applications', async (c) => {
  const address = c.req.query('address')
  if (!address) return c.json({ error: 'address required' }, 400)

  const result = await query(
    `SELECT oj.*, ja.status as application_status, ja.proposed_budget as app_proposed_budget, ja.created_at as applied_at,
      (SELECT COUNT(*) FROM job_applications ja2 WHERE ja2.job_id = oj.id) as application_count
     FROM job_applications ja
     JOIN open_jobs oj ON oj.id = ja.job_id
     WHERE lower(ja.applicant_address) = lower($1)
     ORDER BY ja.created_at DESC`,
    [address]
  )

  return c.json({
    data: result.rows.map(row => ({
      ...formatOpenJob(row),
      applicationStatus: row.application_status,
      appProposedBudget: formatUsdc(row.app_proposed_budget),
      appliedAt: row.applied_at,
    }))
  })
})

// GET /api/open-jobs/my-active?address=0x...
openJobs.get('/my-active', async (c) => {
  const address = c.req.query('address')
  if (!address) return c.json({ error: 'address required' }, 400)

  const result = await query(
    `SELECT oj.*,
      (SELECT COUNT(*) FROM job_applications ja WHERE ja.job_id = oj.id) as application_count
     FROM open_jobs oj
     WHERE lower(oj.selected_applicant) = lower($1)
     AND oj.status IN ('assigned', 'funded', 'in_progress', 'delivered')
     ORDER BY oj.updated_at DESC`,
    [address]
  )

  return c.json({ data: result.rows.map(formatOpenJob) })
})

// GET /api/open-jobs/my-completed?address=0x...
openJobs.get('/my-completed', async (c) => {
  const address = c.req.query('address')
  if (!address) return c.json({ error: 'address required' }, 400)

  const result = await query(
    `SELECT oj.*,
      (SELECT COUNT(*) FROM job_applications ja WHERE ja.job_id = oj.id) as application_count
     FROM open_jobs oj
     WHERE lower(oj.selected_applicant) = lower($1)
     AND oj.status = 'completed'
     ORDER BY oj.completed_at DESC`,
    [address]
  )

  return c.json({ data: result.rows.map(formatOpenJob) })
})

// GET /api/open-jobs/my-posted?address=0x...
openJobs.get('/my-posted', async (c) => {
  const address = c.req.query('address')
  if (!address) return c.json({ error: 'address required' }, 400)

  const result = await query(
    `SELECT oj.*,
      (SELECT COUNT(*) FROM job_applications ja WHERE ja.job_id = oj.id) as application_count
     FROM open_jobs oj
     WHERE lower(oj.client_address) = lower($1)
     ORDER BY oj.created_at DESC`,
    [address]
  )

  return c.json({ data: result.rows.map(formatOpenJob) })
})

// GET /api/open-jobs/recommended?address=0x...
openJobs.get('/recommended', async (c) => {
  const address = c.req.query('address')
  if (!address) return c.json({ error: 'address required' }, 400)

  const catResult = await query(
    `SELECT DISTINCT oj.category FROM open_jobs oj
     WHERE lower(oj.selected_applicant) = lower($1) AND oj.category IS NOT NULL`,
    [address]
  )
  const categories = catResult.rows.map(r => r.category)

  let result
  if (categories.length > 0) {
    result = await query(
      `SELECT oj.*, (SELECT COUNT(*) FROM job_applications ja WHERE ja.job_id = oj.id) as application_count
       FROM open_jobs oj
       WHERE oj.status = 'open' AND oj.category = ANY($1)
       AND lower(oj.client_address) != lower($2)
       ORDER BY oj.created_at DESC LIMIT 10`,
      [categories, address]
    )
  } else {
    result = await query(
      `SELECT oj.*, (SELECT COUNT(*) FROM job_applications ja WHERE ja.job_id = oj.id) as application_count
       FROM open_jobs oj
       WHERE oj.status = 'open' AND lower(oj.client_address) != lower($1)
       ORDER BY oj.created_at DESC LIMIT 10`,
      [address]
    )
  }

  return c.json({ data: result.rows.map(formatOpenJob) })
})

// GET /api/open-jobs/agent-ratings?address=0x...
openJobs.get('/agent-ratings', async (c) => {
  const address = c.req.query('address')
  if (!address) return c.json({ error: 'address required' }, 400)

  const result = await query(
    `SELECT mr.*, oj.title FROM marketplace_ratings mr
     JOIN open_jobs oj ON oj.id = mr.open_job_id
     WHERE lower(mr.agent_address) = lower($1)
     ORDER BY mr.created_at DESC`,
    [address]
  )
  const avg = await query(
    `SELECT AVG(rating)::numeric(3,2) as avg_rating, COUNT(*) as total FROM marketplace_ratings WHERE lower(agent_address) = lower($1)`,
    [address]
  )

  return c.json({
    data: result.rows.map(row => ({
      id: row.id, rating: row.rating, comment: row.comment,
      clientAddress: row.client_address, jobTitle: row.title, createdAt: row.created_at,
    })),
    avgRating: parseFloat(avg.rows[0].avg_rating) || 0,
    totalRatings: parseInt(avg.rows[0].total),
  })
})

// GET /api/open-jobs/notifications?address=0x...
openJobs.get('/notifications', async (c) => {
  const address = c.req.query('address')
  if (!address) return c.json({ error: 'address required' }, 400)

  const result = await query(
    `SELECT * FROM agent_notifications WHERE lower(agent_address) = lower($1) ORDER BY created_at DESC LIMIT 50`,
    [address]
  )
  const unreadCount = await query(
    `SELECT COUNT(*) FROM agent_notifications WHERE lower(agent_address) = lower($1) AND read = FALSE`,
    [address]
  )

  return c.json({
    data: result.rows.map(row => ({
      id: row.id, type: row.type, referenceId: row.reference_id,
      message: row.message, read: row.read, createdAt: row.created_at,
    })),
    unreadCount: parseInt(unreadCount.rows[0].count),
  })
})

// POST /api/open-jobs/notifications/read
openJobs.post('/notifications/read', async (c) => {
  const body = await c.req.json()
  const { address, ids } = body
  if (!address) return c.json({ error: 'address required' }, 400)

  if (ids && ids.length > 0) {
    await query(
      `UPDATE agent_notifications SET read = TRUE WHERE lower(agent_address) = lower($1) AND id = ANY($2)`,
      [address, ids]
    )
  } else {
    await query(
      `UPDATE agent_notifications SET read = TRUE WHERE lower(agent_address) = lower($1)`,
      [address]
    )
  }
  return c.json({ success: true })
})

// GET /api/open-jobs/expire-check — auto-expire unfunded assigned jobs past deadline
openJobs.get('/expire-check', async (c) => {
  const result = await query(
    `UPDATE open_jobs SET status = 'expired', updated_at = NOW()
     WHERE status = 'assigned'
     AND updated_at + (deadline_hours * INTERVAL '1 hour') < NOW()
     RETURNING id, title, selected_applicant`
  )

  // Notify agents of expired jobs
  for (const row of result.rows) {
    if (row.selected_applicant) {
      await query(
        `INSERT INTO agent_notifications (agent_address, type, reference_id, message)
         VALUES ($1, 'job_expired', $2, $3)`,
        [row.selected_applicant, row.id, `"${row.title}" expired — client did not fund in time.`]
      )
    }
  }

  return c.json({ expired: result.rows.length, jobs: result.rows.map(r => r.id) })
})

// GET /api/open-jobs/:id — single open job detail
openJobs.get('/:id', async (c) => {
  const id = c.req.param('id')

  const result = await query(
    `SELECT oj.*,
      (SELECT COUNT(*) FROM job_applications ja WHERE ja.job_id = oj.id) as application_count,
      (SELECT j.created_tx FROM jobs j WHERE j.job_id = oj.job_id LIMIT 1) as indexed_tx
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
      [openJob.id, applicantAddress.toLowerCase(), agentId || null, message || null, budgetRaw]
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

  // Get open_jobs.id
  const jobResult = await query(
    `SELECT id FROM open_jobs WHERE id = $1 OR job_id = $1::bigint`,
    [id]
  )
  if (jobResult.rows.length === 0) {
    return c.json({ error: 'Job not found' }, 404)
  }

  const openJobId = jobResult.rows[0].id

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
    [openJobId]
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
    [jobResult.rows[0].id, applicantAddress]
  )
  // Reject others
  await query(
    `UPDATE job_applications SET status = 'rejected' WHERE job_id = $1 AND lower(applicant_address) != lower($2) AND status = 'pending'`,
    [jobResult.rows[0].id, applicantAddress]
  )
  // Update open job status + store selected applicant
  await query(
    `UPDATE open_jobs SET status = 'assigned', selected_applicant = lower($2), updated_at = NOW() WHERE id = $1 OR job_id = $1::bigint`,
    [id, applicantAddress]
  )

  // Notify selected agent
  const job = jobResult.rows[0]
  await query(
    `INSERT INTO agent_notifications (agent_address, type, reference_id, message)
     VALUES ($1, 'application_selected', $2, $3)`,
    [applicantAddress.toLowerCase(), job.id, `You were selected for "${job.title}"`]
  )

  return c.json({ success: true })
})

// POST /api/open-jobs/:id/fund — client confirms on-chain funding
openJobs.post('/:id/fund', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const { clientAddress, onchainJobId, fundTx, budget } = body

  if (!clientAddress || !fundTx) {
    return c.json({ error: 'clientAddress and fundTx required' }, 400)
  }

  const jobResult = await query(
    `SELECT * FROM open_jobs WHERE (id = $1 OR job_id = $1::bigint) AND lower(client_address) = lower($2)`,
    [id, clientAddress]
  )
  if (jobResult.rows.length === 0) {
    return c.json({ error: 'Job not found or not your job' }, 404)
  }

  const budgetRaw = budget ? BigInt(Math.round(parseFloat(budget) * 1_000_000)).toString() : null

  await query(
    `UPDATE open_jobs SET status = 'funded', onchain_job_id = $2, funded_tx = $3, funded_at = NOW(), final_budget = $4, updated_at = NOW()
     WHERE id = $1`,
    [jobResult.rows[0].id, onchainJobId || null, fundTx, budgetRaw]
  )

  // Notify agent that job is funded
  if (jobResult.rows[0].selected_applicant) {
    await query(
      `INSERT INTO agent_notifications (agent_address, type, reference_id, message)
       VALUES ($1, 'job_funded', $2, $3)`,
      [jobResult.rows[0].selected_applicant, jobResult.rows[0].id, `"${jobResult.rows[0].title}" is funded. You can start work.`]
    )
  }

  return c.json({ success: true })
})

// POST /api/open-jobs/:id/start — agent marks work started
openJobs.post('/:id/start', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const { applicantAddress } = body

  if (!applicantAddress) {
    return c.json({ error: 'applicantAddress required' }, 400)
  }

  const jobResult = await query(
    `SELECT * FROM open_jobs WHERE (id = $1 OR job_id = $1::bigint) AND lower(selected_applicant) = lower($2)`,
    [id, applicantAddress]
  )
  if (jobResult.rows.length === 0) {
    return c.json({ error: 'Job not found or not assigned to you' }, 404)
  }
  if (!['funded', 'assigned'].includes(jobResult.rows[0].status)) {
    return c.json({ error: 'Job must be funded before starting work' }, 400)
  }

  await query(
    `UPDATE open_jobs SET status = 'in_progress', updated_at = NOW() WHERE id = $1`,
    [jobResult.rows[0].id]
  )

  return c.json({ success: true })
})

// POST /api/open-jobs/:id/deliver — agent submits deliverable
openJobs.post('/:id/deliver', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const { applicantAddress, content, link, notes } = body

  if (!applicantAddress || !content) {
    return c.json({ error: 'applicantAddress and content required' }, 400)
  }

  const jobResult = await query(
    `SELECT * FROM open_jobs WHERE (id = $1 OR job_id = $1::bigint) AND lower(selected_applicant) = lower($2)`,
    [id, applicantAddress]
  )
  if (jobResult.rows.length === 0) {
    return c.json({ error: 'Job not found or not assigned to you' }, 404)
  }
  if (!['funded', 'in_progress'].includes(jobResult.rows[0].status)) {
    return c.json({ error: 'Job must be funded or in progress to deliver' }, 400)
  }

  // Get current version
  const versionResult = await query(
    `SELECT COALESCE(MAX(version), 0) as max_version FROM marketplace_deliverables WHERE open_job_id = $1`,
    [jobResult.rows[0].id]
  )
  const nextVersion = parseInt(versionResult.rows[0].max_version) + 1

  const result = await query(
    `INSERT INTO marketplace_deliverables (open_job_id, provider_address, content, link, notes, version)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [jobResult.rows[0].id, applicantAddress.toLowerCase(), content, link || null, notes || null, nextVersion]
  )

  await query(
    `UPDATE open_jobs SET status = 'delivered', updated_at = NOW() WHERE id = $1`,
    [jobResult.rows[0].id]
  )

  return c.json({ id: result.rows[0].id, version: nextVersion })
})

// GET /api/open-jobs/:id/deliverables — list deliverables for a job
openJobs.get('/:id/deliverables', async (c) => {
  const id = c.req.param('id')

  const jobResult = await query(
    `SELECT id FROM open_jobs WHERE id = $1 OR job_id = $1::bigint`,
    [id]
  )
  if (jobResult.rows.length === 0) {
    return c.json({ error: 'Job not found' }, 404)
  }

  const result = await query(
    `SELECT * FROM marketplace_deliverables WHERE open_job_id = $1 ORDER BY version DESC`,
    [jobResult.rows[0].id]
  )

  return c.json({
    data: result.rows.map(row => ({
      id: row.id,
      providerAddress: row.provider_address,
      content: row.content,
      link: row.link,
      notes: row.notes,
      version: row.version,
      status: row.status,
      clientFeedback: row.client_feedback,
      createdAt: row.created_at,
    }))
  })
})

// GET /api/open-jobs/:id/suggested-agents
openJobs.get('/:id/suggested-agents', async (c) => {
  const id = c.req.param('id')
  const jobResult = await query(
    `SELECT id, category FROM open_jobs WHERE id = $1 OR job_id = $1::bigint`,
    [id]
  )
  if (jobResult.rows.length === 0) return c.json({ error: 'Job not found' }, 404)

  const result = await query(
    `SELECT a.agent_id, a.name, a.owner_address,
      (SELECT COUNT(*) FROM jobs WHERE provider_agent_id = a.agent_id AND status = 3) as completed_jobs
     FROM agents a
     WHERE a.name IS NOT NULL
     ORDER BY completed_jobs DESC
     LIMIT 10`
  )

  return c.json({
    data: result.rows.map(row => ({
      agentId: parseInt(row.agent_id),
      name: row.name,
      ownerAddress: row.owner_address,
      completedJobs: parseInt(row.completed_jobs || '0'),
    }))
  })
})

// POST /api/open-jobs/:id/complete — client approves and confirms on-chain completion
openJobs.post('/:id/complete', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const { clientAddress, completionTx } = body

  if (!clientAddress) {
    return c.json({ error: 'clientAddress required' }, 400)
  }

  const jobResult = await query(
    `SELECT * FROM open_jobs WHERE (id = $1 OR job_id = $1::bigint) AND lower(client_address) = lower($2)`,
    [id, clientAddress]
  )
  if (jobResult.rows.length === 0) {
    return c.json({ error: 'Job not found or not your job' }, 404)
  }
  if (jobResult.rows[0].status !== 'delivered') {
    return c.json({ error: 'Job must have a deliverable to complete' }, 400)
  }

  await query(
    `UPDATE open_jobs SET status = 'completed', completed_tx = $2, completed_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [jobResult.rows[0].id, completionTx || null]
  )

  // Mark deliverable as approved
  await query(
    `UPDATE marketplace_deliverables SET status = 'approved' WHERE open_job_id = $1 AND status = 'submitted'`,
    [jobResult.rows[0].id]
  )

  // Notify agent
  if (jobResult.rows[0].selected_applicant) {
    await query(
      `INSERT INTO agent_notifications (agent_address, type, reference_id, message)
       VALUES ($1, 'deliverable_approved', $2, $3)`,
      [jobResult.rows[0].selected_applicant, jobResult.rows[0].id, `"${jobResult.rows[0].title}" approved! Payment released.`]
    )
  }

  return c.json({ success: true })
})

// POST /api/open-jobs/:id/reject — client rejects deliverable (request revision)
openJobs.post('/:id/reject', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const { clientAddress, reason } = body

  if (!clientAddress) {
    return c.json({ error: 'clientAddress required' }, 400)
  }

  const jobResult = await query(
    `SELECT * FROM open_jobs WHERE (id = $1 OR job_id = $1::bigint) AND lower(client_address) = lower($2)`,
    [id, clientAddress]
  )
  if (jobResult.rows.length === 0) {
    return c.json({ error: 'Job not found or not your job' }, 404)
  }
  if (jobResult.rows[0].status !== 'delivered') {
    return c.json({ error: 'Job must have a deliverable to reject' }, 400)
  }

  // Mark latest deliverable as revision_requested
  await query(
    `UPDATE marketplace_deliverables SET status = 'revision_requested', client_feedback = $2
     WHERE open_job_id = $1 AND status = 'submitted'`,
    [jobResult.rows[0].id, reason || null]
  )

  await query(
    `UPDATE open_jobs SET status = 'in_progress', rejected_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [jobResult.rows[0].id]
  )

  // Notify agent of revision request
  if (jobResult.rows[0].selected_applicant) {
    await query(
      `INSERT INTO agent_notifications (agent_address, type, reference_id, message)
       VALUES ($1, 'revision_requested', $2, $3)`,
      [jobResult.rows[0].selected_applicant, jobResult.rows[0].id, `Revision requested on "${jobResult.rows[0].title}": ${reason || 'No details'}`]
    )
  }

  return c.json({ success: true })
})

// POST /api/open-jobs/:id/cancel — client cancels job
openJobs.post('/:id/cancel', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const { clientAddress } = body

  if (!clientAddress) {
    return c.json({ error: 'clientAddress required' }, 400)
  }

  const jobResult = await query(
    `SELECT * FROM open_jobs WHERE (id = $1 OR job_id = $1::bigint) AND lower(client_address) = lower($2)`,
    [id, clientAddress]
  )
  if (jobResult.rows.length === 0) {
    return c.json({ error: 'Job not found or not your job' }, 404)
  }
  if (['completed', 'cancelled'].includes(jobResult.rows[0].status)) {
    return c.json({ error: 'Job already finalized' }, 400)
  }

  await query(
    `UPDATE open_jobs SET status = 'cancelled', updated_at = NOW() WHERE id = $1`,
    [jobResult.rows[0].id]
  )

  return c.json({ success: true })
})

// ─── Comments ─────────────────────────────────────────────────────────────────

// GET /api/open-jobs/:id/comments
openJobs.get('/:id/comments', async (c) => {
  const id = c.req.param('id')
  const jobResult = await query(
    `SELECT id FROM open_jobs WHERE id = $1 OR job_id = $1::bigint`,
    [id]
  )
  if (jobResult.rows.length === 0) return c.json({ error: 'Job not found' }, 404)

  const result = await query(
    `SELECT * FROM marketplace_comments WHERE open_job_id = $1 ORDER BY created_at ASC`,
    [jobResult.rows[0].id]
  )

  return c.json({
    data: result.rows.map(row => ({
      id: row.id,
      senderAddress: row.sender_address,
      message: row.message,
      createdAt: row.created_at,
    }))
  })
})

// POST /api/open-jobs/:id/comments
openJobs.post('/:id/comments', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const { senderAddress, message } = body

  if (!senderAddress || !message) {
    return c.json({ error: 'senderAddress and message required' }, 400)
  }

  const jobResult = await query(
    `SELECT * FROM open_jobs WHERE id = $1 OR job_id = $1::bigint`,
    [id]
  )
  if (jobResult.rows.length === 0) return c.json({ error: 'Job not found' }, 404)

  const result = await query(
    `INSERT INTO marketplace_comments (open_job_id, sender_address, message)
     VALUES ($1, $2, $3) RETURNING id, created_at`,
    [jobResult.rows[0].id, senderAddress.toLowerCase(), message]
  )

  return c.json({ id: result.rows[0].id, createdAt: result.rows[0].created_at }, 201)
})

// ─── Ratings ──────────────────────────────────────────────────────────────────

// POST /api/open-jobs/:id/rate — client rates agent after completion
openJobs.post('/:id/rate', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const { clientAddress, rating, comment } = body

  if (!clientAddress || !rating) {
    return c.json({ error: 'clientAddress and rating required' }, 400)
  }
  if (rating < 1 || rating > 5) {
    return c.json({ error: 'rating must be 1-5' }, 400)
  }

  const jobResult = await query(
    `SELECT * FROM open_jobs WHERE (id = $1 OR job_id = $1::bigint) AND lower(client_address) = lower($2)`,
    [id, clientAddress]
  )
  if (jobResult.rows.length === 0) return c.json({ error: 'Job not found or not your job' }, 404)
  if (jobResult.rows[0].status !== 'completed') return c.json({ error: 'Job must be completed to rate' }, 400)
  if (!jobResult.rows[0].selected_applicant) return c.json({ error: 'No agent to rate' }, 400)

  try {
    const result = await query(
      `INSERT INTO marketplace_ratings (open_job_id, agent_address, client_address, rating, comment)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [jobResult.rows[0].id, jobResult.rows[0].selected_applicant, clientAddress.toLowerCase(), rating, comment || null]
    )
    return c.json({ id: result.rows[0].id }, 201)
  } catch (e: any) {
    if (e.code === '23505') return c.json({ error: 'Already rated this job' }, 409)
    throw e
  }
})

// GET /api/open-jobs/agent-ratings?address=0x... — get agent's ratings
openJobs.get('/:id/ratings', async (c) => {
  const id = c.req.param('id')
  const result = await query(
    `SELECT mr.*, oj.title FROM marketplace_ratings mr
     JOIN open_jobs oj ON oj.id = mr.open_job_id
     WHERE mr.open_job_id = (SELECT id FROM open_jobs WHERE id = $1 OR job_id = $1::bigint LIMIT 1)`,
    [id]
  )
  return c.json({ data: result.rows.map(row => ({
    id: row.id, rating: row.rating, comment: row.comment,
    clientAddress: row.client_address, jobTitle: row.title, createdAt: row.created_at,
  })) })
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
    onChainTx: row.on_chain_tx || row.indexed_tx || null,
    status: row.status,
    applicationCount: parseInt(row.application_count || '0'),
    selectedApplicant: row.selected_applicant || null,
    onchainJobId: row.onchain_job_id ? parseInt(row.onchain_job_id) : null,
    fundedTx: row.funded_tx || null,
    fundedAt: row.funded_at || null,
    completedTx: row.completed_tx || null,
    completedAt: row.completed_at || null,
    rejectedAt: row.rejected_at || null,
    finalBudget: formatUsdc(row.final_budget),
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
