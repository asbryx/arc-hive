import { Hono } from 'hono'
import { query, queryAgents } from '../db.js'
import { createHmac, timingSafeEqual } from 'crypto'
import { createWalletClient, createPublicClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { requireAuth, verifyToken } from '../middleware/auth.js'
import { formatUsdc } from '../lib/format.js'
import { dispatchWebhooks } from '../lib/webhooks.js'

function requireServiceAuth(c: any): boolean {
  const serviceKey = c.req.header('x-service-key')
  const expected = process.env.SERVICE_API_KEY
  if (!serviceKey || !expected) return false
  // SEC-005: Length must match before timingSafeEqual or it throws and leaks length via timing
  const a = Buffer.from(serviceKey)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  try { return timingSafeEqual(a, b) } catch { return false }
}

/** Verify JWT and return authenticated wallet. Returns null + sets status on failure.
 *  SEC-006: Uses central verifyToken which enforces alg=HS256 + iss/aud, rejects alg=none. */
async function requireWalletAuth(c: any, address: string): Promise<string | null> {
  const authHeader = c.req.header('authorization')
  if (!authHeader?.startsWith('Bearer ')) { c.status(401); return null }
  const result = verifyToken(authHeader.slice(7))
  if (!result) { c.status(401); return null }
  if (result.wallet !== address.toLowerCase()) { c.status(403); return null }
  return result.wallet
}

const PROVIDER_KEY = process.env.PROVIDER_PRIVATE_KEY!
if (!PROVIDER_KEY) throw new Error('PROVIDER_PRIVATE_KEY env var required')
const ARC_RPC = 'https://rpc.testnet.arc.network'
const AGENTIC_COMMERCE = '0x0747EEf0706327138c69792bF28Cd525089e4583'
const USDC = '0x3600000000000000000000000000000000000000'
const arcChain = { id: 5042002, name: 'Arc Testnet', nativeCurrency: { name: 'ARC', symbol: 'ARC', decimals: 18 }, rpcUrls: { default: { http: [ARC_RPC] } } } as const

const SET_BUDGET_ABI = [{ inputs: [{ name: 'jobId', type: 'uint256' }, { name: 'amount', type: 'uint256' }, { name: 'optParams', type: 'bytes' }], name: 'setBudget', outputs: [], stateMutability: 'nonpayable', type: 'function' }]

const FIELD_LIMITS = {
  title: 200,
  description: 10000,
  message: 5000,
  notes: 2000,
  reason: 2000,
  requirements: 5000,
  feedback: 2000,
} as const

function validateFieldLength(value: string | undefined, field: keyof typeof FIELD_LIMITS): string | null {
  if (!value) return null
  if (value.length > FIELD_LIMITS[field]) {
    return `${field} must be ${FIELD_LIMITS[field]} characters or less (got ${value.length})`
  }
  return null
}

export const openJobs = new Hono()

// POST /api/open-jobs — create an open job listing
openJobs.post('/', requireAuth, async (c) => {
  const body = await c.req.json()
  const { title, description, category, requirements, budgetMin, budgetMax, deadlineHours, clientAddress, jobId, onChainTx, sectorConfig } = body
  const authWallet = ((c as any).get('wallet') as string)?.toLowerCase()

  const titleErr = validateFieldLength(title, 'title')
  const descErr = validateFieldLength(description, 'description')
  const reqErr = validateFieldLength(requirements, 'requirements')
  if (titleErr || descErr || reqErr) {
    return c.json({ error: titleErr || descErr || reqErr }, 400)
  }

  if (!title || !description || !clientAddress) {
    return c.json({ error: 'title, description, and clientAddress required' }, 400)
  }
  if (authWallet !== clientAddress.toLowerCase()) {
    return c.json({ error: 'Can only create jobs for your own wallet' }, 403)
  }

  if (!budgetMin && !budgetMax) {
    return c.json({ error: 'Budget is required (set at least budgetMin or budgetMax)' }, 400)
  }

  // Validate budgets: must be finite, non-negative, and min <= max (audit
  // 2026-06-23: negative budgets were accepted and written to the DB).
  const minNum = budgetMin != null ? parseFloat(budgetMin) : null
  const maxNum = budgetMax != null ? parseFloat(budgetMax) : null
  if ((minNum != null && (!Number.isFinite(minNum) || minNum < 0)) ||
      (maxNum != null && (!Number.isFinite(maxNum) || maxNum < 0))) {
    return c.json({ error: 'Budget must be a non-negative number' }, 400)
  }
  if (minNum != null && maxNum != null && minNum > maxNum) {
    return c.json({ error: 'budgetMin cannot exceed budgetMax' }, 400)
  }

  // Validate deadline (1h .. 1 year) and category against the known set
  // (audit 2026-06-23: negative deadlineHours and arbitrary/XSS category
  // strings were accepted and stored).
  const deadlineNum = deadlineHours != null ? parseInt(String(deadlineHours), 10) : 72
  if (!Number.isFinite(deadlineNum) || deadlineNum < 1 || deadlineNum > 8760) {
    return c.json({ error: 'deadlineHours must be between 1 and 8760' }, 400)
  }
  const ALLOWED_CATEGORIES = ['Code', 'Development', 'Data Analysis', 'Content Creation', 'Research', 'Trading', 'DeFi', 'Social Media', 'Monitoring', 'Other']
  if (category != null && category !== '' && !ALLOWED_CATEGORIES.includes(category)) {
    return c.json({ error: `Invalid category. Allowed: ${ALLOWED_CATEGORIES.join(', ')}` }, 400)
  }

  const budgetMinRaw = budgetMin ? BigInt(Math.round(parseFloat(budgetMin) * 1_000_000)).toString() : null
  const budgetMaxRaw = budgetMax ? BigInt(Math.round(parseFloat(budgetMax) * 1_000_000)).toString() : null

  const result = await query(
    `INSERT INTO open_jobs (job_id, title, description, category, requirements, budget_min, budget_max, deadline_hours, client_address, on_chain_tx, sector_config)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id`,
    [jobId || null, title, description, category || null, requirements || null, budgetMinRaw, budgetMaxRaw, deadlineNum, clientAddress.toLowerCase(), onChainTx || null, sectorConfig ? JSON.stringify(sectorConfig) : '{}']
  )

  const newJob = result.rows[0]

  // Fan out job.created to subscribed agents (category/budget matched).
  await dispatchWebhooks('job.created', {
    category,
    budget: budgetMax || budgetMin || null,
    job: {
      id: newJob.id,
      jobId,
      title,
      category,
      budget_min: budgetMin,
      budget_max: budgetMax,
      deadline_hours: deadlineHours,
      client_address: clientAddress,
    },
  })

  return c.json({ id: newJob.id, jobId }, 201)
})

// GET /api/open-jobs — list open job listings
openJobs.get('/', async (c) => {
  const page = Math.max(1, parseInt(c.req.query('page') || '1'))
  const limit = Math.min(50, Math.max(1, parseInt(c.req.query('limit') || '20')))
  const offset = (page - 1) * limit
  const category = c.req.query('category')
  const status = c.req.query('status')
  const minBudget = c.req.query('minBudget')
  const maxBudget = c.req.query('maxBudget')

  const whereParts: string[] = []
  const params: unknown[] = []
  let paramIdx = 1

  // Default to open jobs, but allow filtering by other statuses
  const statusFilter = status || 'open'
  whereParts.push(`status = $${paramIdx}`)
  params.push(statusFilter)
  paramIdx++

  if (category) {
    whereParts.push(`category = $${paramIdx}`)
    params.push(category)
    paramIdx++
  }

  if (minBudget) {
    const parsed = parseFloat(minBudget)
    if (!Number.isFinite(parsed)) {
      return c.json({ error: 'minBudget must be a number' }, 400)
    }
    whereParts.push(`budget_max::numeric >= $${paramIdx}::numeric`)
    params.push(parsed.toString())
    paramIdx++
  }

  if (maxBudget) {
    const parsed = parseFloat(maxBudget)
    if (!Number.isFinite(parsed)) {
      return c.json({ error: 'maxBudget must be a number' }, 400)
    }
    whereParts.push(`budget_min::numeric <= $${paramIdx}::numeric`)
    params.push(parsed.toString())
    paramIdx++
  }

  const where = 'WHERE ' + whereParts.join(' AND ')

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

  // Strict auth — reject if JWT invalid or wallet mismatch
  const authWallet = await requireWalletAuth(c, address)
  if (!authWallet) {
    return c.json({ error: 'Authentication required' }, 401)
  }

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

  // Strict auth — reject if JWT invalid or wallet mismatch
  const authWallet = await requireWalletAuth(c, address)
  if (!authWallet) {
    return c.json({ error: 'Authentication required' }, 401)
  }

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

// GET /api/open-jobs/my-active-all?address=0x...
// Combined active view: client's open/in-progress jobs + agent's applications + agent's active work
openJobs.get('/my-active-all', async (c) => {
  const address = c.req.query('address')
  if (!address) return c.json({ error: 'address required' }, 400)

  // Strict auth — reject if JWT invalid or wallet mismatch
  const authWallet = await requireWalletAuth(c, address)
  if (!authWallet) {
    return c.json({ error: 'Authentication required' }, 401)
  }

  const result = await query(
    `SELECT DISTINCT oj.*,
      (SELECT COUNT(*) FROM job_applications ja WHERE ja.job_id = oj.id) as application_count,
      ja_mine.status as application_status,
      ja_mine.proposed_budget as app_proposed_budget,
      ja_mine.created_at as applied_at,
      CASE
        WHEN lower(oj.client_address) = lower($1) THEN 'client'
        ELSE 'provider'
      END as role
     FROM open_jobs oj
     LEFT JOIN job_applications ja_mine ON ja_mine.job_id = oj.id AND lower(ja_mine.applicant_address) = lower($1)
     WHERE (
       (lower(oj.client_address) = lower($1) AND oj.status IN ('open', 'assigned', 'funded', 'in_progress', 'delivered', 'evaluating', 'revision_requested'))
       OR (lower(oj.selected_applicant) = lower($1) AND oj.status IN ('assigned', 'funded', 'in_progress', 'delivered', 'evaluating', 'revision_requested'))
       OR (ja_mine.id IS NOT NULL AND ja_mine.status = 'pending' AND oj.status = 'open')
     )
     ORDER BY oj.updated_at DESC`,
    [address]
  )

  return c.json({
    data: result.rows.map(row => ({
      ...formatOpenJob(row),
      applicationStatus: row.application_status,
      appProposedBudget: row.app_proposed_budget ? formatUsdc(row.app_proposed_budget) : null,
      appliedAt: row.applied_at,
      role: row.role,
    }))
  })
})

// GET /api/open-jobs/my-history?address=0x...
// Terminal states for both roles
openJobs.get('/my-history', async (c) => {
  const address = c.req.query('address')
  if (!address) return c.json({ error: 'address required' }, 400)

  // Strict auth — reject if JWT invalid or wallet mismatch
  const authWallet = await requireWalletAuth(c, address)
  if (!authWallet) {
    return c.json({ error: 'Authentication required' }, 401)
  }

  const result = await query(
    `SELECT oj.*,
      (SELECT COUNT(*) FROM job_applications ja WHERE ja.job_id = oj.id) as application_count,
      CASE
        WHEN lower(oj.client_address) = lower($1) THEN 'client'
        ELSE 'provider'
      END as role,
      e.score as eval_score,
      e.reasoning as eval_reasoning,
      e.status as eval_status,
      e.breakdown as eval_breakdown
     FROM open_jobs oj
     LEFT JOIN evaluations e ON e.open_job_id = oj.id AND e.version = (
       SELECT MAX(e2.version) FROM evaluations e2 WHERE e2.open_job_id = oj.id
     )
     WHERE (lower(oj.client_address) = lower($1) OR lower(oj.selected_applicant) = lower($1))
     AND oj.status IN ('completed', 'failed', 'rejected', 'refunded', 'cancelled', 'expired')
     ORDER BY oj.updated_at DESC`,
    [address]
  )

  return c.json({ data: result.rows.map(row => ({
    ...formatOpenJob(row),
    role: row.role,
    evalScore: row.eval_score ?? null,
    evalReasoning: row.eval_reasoning ?? null,
    evalStatus: row.eval_status ?? null,
    evalBreakdown: row.eval_breakdown ?? null,
  })) })
})

// GET /api/open-jobs/my-completed?address=0x...
openJobs.get('/my-completed', async (c) => {
  const address = c.req.query('address')
  if (!address) return c.json({ error: 'address required' }, 400)

  // Strict auth — reject if JWT invalid or wallet mismatch
  const authWallet = await requireWalletAuth(c, address)
  if (!authWallet) {
    return c.json({ error: 'Authentication required' }, 401)
  }

  // Return completed/failed jobs where user is either agent or client
  const result = await query(
    `SELECT oj.*,
      (SELECT COUNT(*) FROM job_applications ja WHERE ja.job_id = oj.id) as application_count
     FROM open_jobs oj
     WHERE (lower(oj.selected_applicant) = lower($1) OR lower(oj.client_address) = lower($1))
     AND oj.status IN ('completed', 'failed', 'rejected')
     ORDER BY oj.updated_at DESC`,
    [address]
  )

  return c.json({ data: result.rows.map(formatOpenJob) })
})

// GET /api/open-jobs/my-posted?address=0x...
openJobs.get('/my-posted', async (c) => {
  const address = c.req.query('address')
  if (!address) return c.json({ error: 'address required' }, 400)

  // Strict auth — reject if JWT invalid or wallet mismatch
  const authWallet = await requireWalletAuth(c, address)
  if (!authWallet) {
    return c.json({ error: 'Authentication required' }, 401)
  }

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

  // Strict auth — reject if JWT invalid or wallet mismatch
  const authWallet = await requireWalletAuth(c, address)
  if (!authWallet) {
    return c.json({ error: 'Authentication required' }, 401)
  }

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

  // Strict auth — reject if JWT invalid or wallet mismatch
  const authWallet = await requireWalletAuth(c, address)
  if (!authWallet) {
    return c.json({ error: 'Authentication required' }, 401)
  }

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
openJobs.get('/notifications', requireAuth, async (c) => {
  const address = c.req.query('address')
  const authWallet = ((c as any).get('wallet') as string)?.toLowerCase()
  if (!address) return c.json({ error: 'address required' }, 400)
  if (authWallet !== address.toLowerCase()) return c.json({ error: 'Can only read your own notifications' }, 403)

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
openJobs.post('/notifications/read', requireAuth, async (c) => {
  const body = await c.req.json()
  const { address, ids } = body
  const authWallet = ((c as any).get('wallet') as string)?.toLowerCase()
  if (!address) return c.json({ error: 'address required' }, 400)
  if (authWallet !== address.toLowerCase()) return c.json({ error: 'Can only update your own notifications' }, 403)

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

// POST /api/open-jobs/expire-check — auto-expire unfunded assigned jobs past deadline (auth required)
openJobs.post('/expire-check', requireAuth, async (c) => {
  if (!requireServiceAuth(c)) {
    return c.json({ error: 'Service authentication required' }, 403)
  }
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

  // Only allow numeric IDs to prevent SQL cast errors on route collisions
  if (!/^\d+$/.test(id)) return c.json({ error: 'Not found' }, 404)

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
openJobs.post('/:id/apply', requireAuth, async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const { applicantAddress, agentId, message, proposedBudget } = body
  const authWallet = ((c as any).get('wallet') as string)?.toLowerCase()

  const messageErr = validateFieldLength(message, 'message')
  if (messageErr) {
    return c.json({ error: messageErr }, 400)
  }

  if (!applicantAddress) {
    return c.json({ error: 'applicantAddress required' }, 400)
  }
  if (authWallet !== applicantAddress.toLowerCase()) {
    return c.json({ error: 'Can only apply as your own wallet' }, 403)
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

  // Validate proposed budget is within job's budget range
  if (proposedBudget) {
    const proposedRaw = BigInt(Math.round(parseFloat(proposedBudget) * 1_000_000))
    const minBudget = openJob.budget_min ? BigInt(openJob.budget_min) : null
    const maxBudget = openJob.budget_max ? BigInt(openJob.budget_max) : null
    if (minBudget && proposedRaw < minBudget) {
      return c.json({ error: `Proposed budget below minimum (${Number(minBudget) / 1_000_000} USDC)` }, 400)
    }
    if (maxBudget && proposedRaw > maxBudget) {
      return c.json({ error: `Proposed budget exceeds maximum (${Number(maxBudget) / 1_000_000} USDC)` }, 400)
    }
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
openJobs.get('/:id/applications', requireAuth, async (c) => {
  const authWallet = ((c as any).get('wallet') as string)?.toLowerCase()
  const id = c.req.param('id')

  // Get open_jobs.id and verify ownership
  const jobResult = await query(
    `SELECT id, client_address FROM open_jobs WHERE id = $1 OR job_id = $1::bigint`,
    [id]
  )
  if (jobResult.rows.length === 0) {
    return c.json({ error: 'Job not found' }, 404)
  }

  const isOwner = jobResult.rows[0].client_address?.toLowerCase() === authWallet
  if (!isOwner) {
    return c.json({ error: 'Only the job owner can view applications' }, 403)
  }

  const openJobId = jobResult.rows[0].id

  const result = await query(
    `SELECT ja.*
     FROM job_applications ja
     WHERE ja.job_id = $1
     ORDER BY ja.created_at ASC`,
    [openJobId]
  )

  // Enrich with agent names from explorer DB
  const addresses = result.rows.map(r => r.applicant_address?.toLowerCase()).filter(Boolean)
  let agentMap: Record<string, { name: string; score: number; completed_jobs: number }> = {}
  if (addresses.length > 0) {
    const agentResult = await queryAgents(
      `SELECT owner_address, name, agent_id FROM agents WHERE lower(owner_address) = ANY($1)`,
      [addresses]
    )
    // Get completed jobs count from marketplace DB
    for (const agent of agentResult.rows) {
      const jobCount = await query(
        `SELECT COUNT(*) FROM jobs WHERE provider_agent_id = $1 AND status = 3`,
        [agent.agent_id]
      )
      agentMap[agent.owner_address.toLowerCase()] = {
        name: agent.name,
        score: 0,
        completed_jobs: parseInt(jobCount.rows[0].count),
      }
    }
  }

  return c.json({
    data: result.rows.map(row => ({
      id: row.id,
      applicantAddress: row.applicant_address,
      agentId: row.agent_id ? parseInt(row.agent_id) : null,
      agentName: agentMap[row.applicant_address?.toLowerCase()]?.name || null,
      completedJobs: agentMap[row.applicant_address?.toLowerCase()]?.completed_jobs || 0,
      message: row.message,
      proposedBudget: formatUsdc(row.proposed_budget),
      status: row.status,
      createdAt: row.created_at,
    })),
  })
})

// POST /api/open-jobs/:id/link-chain — link an off-chain job to its on-chain ID
openJobs.post('/:id/link-chain', requireAuth, async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const { jobId, onChainTx, clientAddress } = body
  const authWallet = ((c as any).get('wallet') as string)?.toLowerCase()

  if (!jobId) return c.json({ error: 'jobId required' }, 400)
  if (!clientAddress) return c.json({ error: 'clientAddress required' }, 400)
  if (authWallet !== clientAddress.toLowerCase()) {
    return c.json({ error: 'Can only link your own jobs' }, 403)
  }

  // Verify job ownership
  const ownerCheck = await query(
    `SELECT id FROM open_jobs WHERE id = $1 AND lower(client_address) = lower($2)`,
    [id, clientAddress]
  )
  if (ownerCheck.rows.length === 0) return c.json({ error: 'Job not found or not yours' }, 404)

  await query(
    `UPDATE open_jobs SET job_id = $2, on_chain_tx = $3, updated_at = NOW() WHERE id = $1`,
    [id, jobId, onChainTx || null]
  )
  return c.json({ success: true })
})

// POST /api/open-jobs/:id/select — client selects an applicant
openJobs.post('/:id/select', requireAuth, async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const { applicantAddress, clientAddress } = body
  const authWallet = ((c as any).get('wallet') as string)?.toLowerCase()

  if (!applicantAddress || !clientAddress) {
    return c.json({ error: 'applicantAddress and clientAddress required' }, 400)
  }
  if (authWallet !== clientAddress.toLowerCase()) {
    return c.json({ error: 'Can only select applicants for your own jobs' }, 403)
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

  // Notify selected agent — in-app + webhook push
  const job = jobResult.rows[0]
  await query(
    `INSERT INTO agent_notifications (agent_address, type, reference_id, message)
     VALUES ($1, 'application_selected', $2, $3)`,
    [applicantAddress.toLowerCase(), job.id, `You were selected for "${job.title}"`]
  )
  await dispatchWebhooks('job.selected', {
    agentAddress: applicantAddress,
    job: { id: job.id, jobId: job.job_id, title: job.title, category: job.category, status: 'assigned' },
  })

    // setBudget is now handled by the /set-budget endpoint during the fund flow
  // (provider must be set on-chain first, which happens in the frontend)

  return c.json({ success: true })
})

// POST /api/open-jobs/:id/set-budget — provider wallet calls setBudget on-chain
openJobs.post('/:id/set-budget', requireAuth, async (c) => {
  // Auth = job-owner JWT only. We do NOT require x-service-key here because:
  //   1. The frontend cannot ship that secret to the browser anyway.
  //   2. We already verify (a) JWT signature, (b) JWT wallet === clientAddress,
  //      (c) clientAddress owns this open_job row. That's the same trust level.
  //   3. Bug fixed 2026-06-15: the live MarketplaceDetail.tsx never sent
  //      x-service-key, so every fund flow 403'd here and no one could fund a
  //      job. Service-auth gate was dead code.
  const id = c.req.param('id')
  const body = await c.req.json()
  const { budget, clientAddress, onchainJobId } = body
  const authWallet = ((c as any).get('wallet') as string)?.toLowerCase()

  if (!budget) return c.json({ error: 'budget required' }, 400)
  if (!clientAddress) return c.json({ error: 'clientAddress required' }, 400)
  if (authWallet !== clientAddress.toLowerCase()) {
    return c.json({ error: 'Can only set budget for your own jobs' }, 403)
  }

  // Validate budget is a positive, finite number BEFORE the on-chain call.
  // setBudget takes a uint256; a negative/zero/NaN value reverts on-chain and,
  // when retried, spams "Number -5000000 is not in safe 256-bit unsigned range"
  // every few minutes (observed live 2026-06-24). Reject at the boundary.
  const budgetNum = parseFloat(budget)
  if (!Number.isFinite(budgetNum) || budgetNum <= 0) {
    return c.json({ error: 'budget must be a positive number' }, 400)
  }

  const jobResult = await query(
    `SELECT * FROM open_jobs WHERE (id = $1 OR job_id = $1::bigint) AND lower(client_address) = lower($2)`,
    [id, clientAddress]
  )
  if (jobResult.rows.length === 0) return c.json({ error: 'Job not found or not yours' }, 404)

  const job = jobResult.rows[0]
  // Use onchainJobId from frontend if provided (for newly created on-chain jobs)
  const actualOnchainJobId = onchainJobId || job.job_id
  if (!actualOnchainJobId) return c.json({ error: 'No on-chain job ID' }, 400)

  const budgetAtomic = BigInt(Math.round(budgetNum * 1_000_000))

  try {
    const account = privateKeyToAccount(PROVIDER_KEY as `0x${string}`)
    const walletClient = createWalletClient({ account, chain: arcChain, transport: http(ARC_RPC) })
    const publicClient = createPublicClient({ chain: arcChain, transport: http(ARC_RPC) })

    const tx = await walletClient.writeContract({
      address: AGENTIC_COMMERCE as `0x${string}`,
      abi: SET_BUDGET_ABI,
      functionName: 'setBudget',
      args: [BigInt(actualOnchainJobId), budgetAtomic, '0x'],
    })
    await publicClient.waitForTransactionReceipt({ hash: tx })

    return c.json({ success: true, tx })
  } catch (e: any) {
    console.error('setBudget failed:', e.message)
    return c.json({ error: `setBudget failed: ${e.shortMessage || e.message}` }, 500)
  }
})

// POST /api/open-jobs/:id/fund — client confirms on-chain funding
openJobs.post('/:id/fund', requireAuth, async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const { clientAddress, onchainJobId, fundTx, budget } = body
  const authWallet = ((c as any).get('wallet') as string)?.toLowerCase()

  if (!clientAddress || !fundTx) {
    return c.json({ error: 'clientAddress and fundTx required' }, 400)
  }
  if (authWallet !== clientAddress.toLowerCase()) {
    return c.json({ error: 'Can only fund your own jobs' }, 403)
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

  // Notify agent that job is funded — in-app + webhook push
  if (jobResult.rows[0].selected_applicant) {
    await query(
      `INSERT INTO agent_notifications (agent_address, type, reference_id, message)
       VALUES ($1, 'job_funded', $2, $3)`,
      [jobResult.rows[0].selected_applicant, jobResult.rows[0].id, `"${jobResult.rows[0].title}" is funded. You can start work.`]
    )
    await dispatchWebhooks('job.funded', {
      agentAddress: jobResult.rows[0].selected_applicant,
      job: { id: jobResult.rows[0].id, jobId: jobResult.rows[0].job_id, title: jobResult.rows[0].title, status: 'funded' },
    })
  }

  return c.json({ success: true })
})

// POST /api/open-jobs/:id/start — agent marks work started
openJobs.post('/:id/start', requireAuth, async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const { applicantAddress } = body
  const authWallet = ((c as any).get('wallet') as string)?.toLowerCase()

  if (!applicantAddress) {
    return c.json({ error: 'applicantAddress required' }, 400)
  }
  if (authWallet !== applicantAddress.toLowerCase()) {
    return c.json({ error: 'Can only start work as your own wallet' }, 403)
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

// NOTE: Deliver endpoint moved to routes/files.ts (supports file uploads)
// POST /api/open-jobs/:id/deliver — see routes/files.ts

// GET /api/open-jobs/:id/deliverables — list deliverables for a job
// Auth optional: terminal-state jobs (completed/failed/refunded) are public
openJobs.get('/:id/deliverables', async (c) => {
  const id = c.req.param('id')

  // Try to get auth wallet (optional — don't reject if missing)
  // SEC-006: use central verifyToken (alg=HS256 + iss/aud + signature checks)
  let requester: string | null = null
  const authHeader = c.req.header('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const result = verifyToken(authHeader.slice(7))
    requester = result?.wallet || null
  }

  const jobResult = await query(
    `SELECT id, client_address, selected_applicant, status FROM open_jobs WHERE id = $1 OR job_id = $1::bigint`,
    [id]
  )
  if (jobResult.rows.length === 0) {
    return c.json({ error: 'Job not found' }, 404)
  }

  const job = jobResult.rows[0]
  const isClient = requester && job.client_address && requester === job.client_address.toLowerCase()
  const isProvider = requester && job.selected_applicant && requester === job.selected_applicant.toLowerCase()

  // Visibility rules (2026-06-15):
  //   AGENT (provider): always sees their own content/files.
  //   CLIENT: sees a deliverable's content ONLY when that deliverable's status
  //           is 'approved' (= it scored ≥70 and money was released). Across
  //           the 3-attempt cycle:
  //             - attempts 1 & 2 score <70 → 'revision_requested', client sees
  //               reasoning via /evaluations but NOT content/files.
  //             - attempt 3 scores <70 → job goes 'failed'/'refunded'. Money
  //               returns to client. Client sees all 3 reasonings but NEVER
  //               the content/files (they didn't pay for it; agent keeps work).
  //             - any attempt scores ≥70 → that deliverable is 'approved',
  //               job is 'completed', client unlocks content/files.
  //   ANON: only sees deliverables of jobs that reached 'completed' (= an
  //         approved deliverable exists). 'failed'/'refunded' jobs stay
  //         private — there's no public artefact to show.
  const isJobCompleted = job.status === 'completed'
  if (!requester && !isJobCompleted) {
    return c.json({ error: 'Authentication required' }, 401)
  }

  const result = await query(
    `SELECT * FROM marketplace_deliverables WHERE open_job_id = $1 ORDER BY version DESC`,
    [job.id]
  )

  return c.json({
    data: result.rows.map(row => {
      const isThisApproved = row.status === 'approved'
      // Provider: always see own work.
      // Client / anon: see content only if this specific deliverable is approved.
      const canSeeContent = isProvider || isThisApproved

      return {
        id: row.id,
        providerAddress: row.provider_address,
        content: canSeeContent ? row.content : null,
        link:    canSeeContent ? row.link    : null,
        notes:   canSeeContent ? row.notes   : null,
        version: row.version,
        status: row.status,
        clientFeedback: row.client_feedback,
        createdAt: row.created_at,
      }
    })
  })
})

// GET /api/open-jobs/:id/evaluations — list evaluations for a job
openJobs.get('/:id/evaluations', async (c) => {
  const id = c.req.param('id')

  const jobResult = await query(
    `SELECT id FROM open_jobs WHERE id = $1 OR job_id = $1::bigint`,
    [id]
  )
  if (jobResult.rows.length === 0) {
    return c.json({ error: 'Job not found' }, 404)
  }

  const result = await query(
    `SELECT * FROM evaluations WHERE open_job_id = $1 ORDER BY version ASC`,
    [jobResult.rows[0].id]
  )

  return c.json({
    data: result.rows.map(row => ({
      id: row.id,
      version: row.version,
      score: row.score,
      breakdown: row.breakdown,
      reasoning: row.reasoning,
      suggestions: row.suggestions,
      status: row.status,
      txHash: row.tx_hash,
      llmModel: row.llm_model,
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

  // Get agents from explorer DB
  const agentsResult = await queryAgents(
    `SELECT agent_id, name, owner_address FROM agents WHERE name IS NOT NULL`
  )

  // Count completed jobs from marketplace DB for each agent
  const agentsWithJobs = await Promise.all(
    agentsResult.rows.map(async (agent) => {
      const jobCount = await query(
        `SELECT COUNT(*) FROM jobs WHERE provider_agent_id = $1 AND status = 3`,
        [agent.agent_id]
      )
      return {
        agentId: parseInt(agent.agent_id),
        name: agent.name,
        ownerAddress: agent.owner_address,
        completedJobs: parseInt(jobCount.rows[0].count),
      }
    })
  )

  // Sort by completed jobs, take top 10
  agentsWithJobs.sort((a, b) => b.completedJobs - a.completedJobs)

  return c.json({
    data: agentsWithJobs.slice(0, 10)
  })
})

// POST /api/open-jobs/:id/complete — client approves and confirms on-chain completion
openJobs.post('/:id/complete', requireAuth, async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const { clientAddress, completionTx, completedTx } = body
  const authWallet = ((c as any).get('wallet') as string)?.toLowerCase()

  if (!clientAddress) return c.json({ error: 'clientAddress required' }, 400)
  if (authWallet !== clientAddress.toLowerCase()) return c.json({ error: 'Can only complete your own jobs' }, 403)

  const jobResult = await query(
    `SELECT * FROM open_jobs WHERE (id = $1 OR job_id = $1::bigint) AND lower(client_address) = lower($2)`,
    [id, clientAddress]
  )
  if (jobResult.rows.length === 0) {
    return c.json({ error: 'Job not found or not your job' }, 404)
  }
  // revision_requested is included so the client can OVERRIDE the evaluator
  // and approve anyway — the CaseFile UI shows the Approve button in that
  // state, so the API must accept it (audit: UI/API state-machine mismatch).
  if (!['delivered', 'funded', 'in_progress', 'evaluating', 'revision_requested'].includes(jobResult.rows[0].status)) {
    return c.json({ error: 'Job not in a completable state' }, 400)
  }

  await query(
    `UPDATE open_jobs SET status = 'completed', completed_tx = $2, completed_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [jobResult.rows[0].id, completionTx || completedTx || null]
  )

  // Mark deliverable as approved
  await query(
    `UPDATE marketplace_deliverables SET status = 'approved' WHERE open_job_id = $1 AND status = 'submitted'`,
    [jobResult.rows[0].id]
  )

  // Notify agent — in-app + webhook push
  if (jobResult.rows[0].selected_applicant) {
    await query(
      `INSERT INTO agent_notifications (agent_address, type, reference_id, message)
       VALUES ($1, 'deliverable_approved', $2, $3)`,
      [jobResult.rows[0].selected_applicant, jobResult.rows[0].id, `"${jobResult.rows[0].title}" approved! Payment released.`]
    )
    await dispatchWebhooks('job.completed', {
      agentAddress: jobResult.rows[0].selected_applicant,
      job: { id: jobResult.rows[0].id, jobId: jobResult.rows[0].job_id, title: jobResult.rows[0].title, status: 'completed' },
    })
  }

  return c.json({ success: true })
})

// POST /api/open-jobs/:id/reject — client rejects deliverable (request revision)
openJobs.post('/:id/reject', requireAuth, async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const { clientAddress, reason } = body
  const authWallet = ((c as any).get('wallet') as string)?.toLowerCase()

  const reasonErr = validateFieldLength(reason, 'reason')
  const feedbackErr = validateFieldLength(reason, 'feedback')
  if (reasonErr || feedbackErr) {
    return c.json({ error: reasonErr || feedbackErr }, 400)
  }

  if (!clientAddress) {
    return c.json({ error: 'clientAddress required' }, 400)
  }
  if (authWallet !== clientAddress.toLowerCase()) return c.json({ error: 'Can only reject deliverables for your own jobs' }, 403)

  const jobResult = await query(
    `SELECT * FROM open_jobs WHERE (id = $1 OR job_id = $1::bigint) AND lower(client_address) = lower($2)`,
    [id, clientAddress]
  )
  if (jobResult.rows.length === 0) {
    return c.json({ error: 'Job not found or not your job' }, 404)
  }
  // A deliverable exists once the job is delivered/evaluating/revision_requested.
  // The CaseFile Reject button shows for all of these (they map to 'filed'),
  // so the API must accept them all — not just 'delivered' (UI/API mismatch).
  if (!['delivered', 'evaluating', 'revision_requested'].includes(jobResult.rows[0].status)) {
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

  // Notify agent of revision request — in-app + webhook push
  if (jobResult.rows[0].selected_applicant) {
    await query(
      `INSERT INTO agent_notifications (agent_address, type, reference_id, message)
       VALUES ($1, 'revision_requested', $2, $3)`,
      [jobResult.rows[0].selected_applicant, jobResult.rows[0].id, `Revision requested on "${jobResult.rows[0].title}": ${reason || 'No details'}`]
    )
    await dispatchWebhooks('job.revision_requested', {
      agentAddress: jobResult.rows[0].selected_applicant,
      job: { id: jobResult.rows[0].id, jobId: jobResult.rows[0].job_id, title: jobResult.rows[0].title, status: 'revision_requested', reason: reason || null },
    })
  }

  return c.json({ success: true })
})

// POST /api/open-jobs/:id/cancel — client cancels job
openJobs.post('/:id/cancel', requireAuth, async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const { clientAddress } = body
  const authWallet = ((c as any).get('wallet') as string)?.toLowerCase()

  if (!clientAddress) {
    return c.json({ error: 'clientAddress required' }, 400)
  }
  if (authWallet !== clientAddress.toLowerCase()) return c.json({ error: 'Can only cancel your own jobs' }, 403)

  const jobResult = await query(
    `SELECT * FROM open_jobs WHERE (id = $1 OR job_id = $1::bigint) AND lower(client_address) = lower($2)`,
    [id, clientAddress]
  )
  if (jobResult.rows.length === 0) {
    return c.json({ error: 'Job not found or not your job' }, 404)
  }
  const job = jobResult.rows[0]
  if (['completed', 'cancelled'].includes(job.status)) {
    return c.json({ error: 'Job already finalized' }, 400)
  }

  // Cancellation is only valid BEFORE a job is funded. Once USDC is escrowed
  // on-chain, the AgenticCommerce contract has no client-side cancel path —
  // funds are released only by the evaluator's reject() (instant refund) or
  // by claimRefund() after the on-chain deadline. Allowing an off-chain
  // status='cancelled' here would strand the escrow (no refund_tx, funds
  // locked in the contract). See audit 2026-06-23 finding L3-2.
  if (job.funded_tx || !['open'].includes(job.status)) {
    return c.json({
      error: 'Funded jobs cannot be cancelled. Escrowed funds are refunded automatically if the provider is rejected or the on-chain deadline passes.',
      status: job.status,
    }, 400)
  }

  await query(
    `UPDATE open_jobs SET status = 'cancelled', updated_at = NOW() WHERE id = $1`,
    [job.id]
  )

  return c.json({ success: true })
})

// ─── Deadline Extension ────────────────────────────────────────────────────────

// POST /api/open-jobs/:id/extend
openJobs.post('/:id/extend', requireAuth, async (c) => {
  const authWallet = ((c as any).get('wallet') as string)?.toLowerCase()
  const id = c.req.param('id')
  const { additionalHours } = await c.req.json()

  if (!additionalHours || additionalHours < 1 || additionalHours > 720) {
    return c.json({ error: 'Extension must be 1-720 hours' }, 400)
  }

  // Verify ownership
  const job = await query(`SELECT client_address, deadline_hours, created_at FROM open_jobs WHERE id = $1`, [id])
  if (!job.rows.length) return c.json({ error: 'Job not found' }, 404)
  if (job.rows[0].client_address?.toLowerCase() !== authWallet) {
    return c.json({ error: 'Only the job owner can extend deadline' }, 403)
  }

  await query(
    `UPDATE open_jobs SET deadline_hours = deadline_hours + $2, updated_at = NOW() WHERE id = $1`,
    [id, additionalHours]
  )

  return c.json({ message: `Deadline extended by ${additionalHours} hours` })
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
openJobs.post('/:id/comments', requireAuth, async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const { senderAddress, message } = body
  const authWallet = ((c as any).get('wallet') as string)?.toLowerCase()

  const messageErr = validateFieldLength(message, 'message')
  if (messageErr) {
    return c.json({ error: messageErr }, 400)
  }

  if (!senderAddress || !message) {
    return c.json({ error: 'senderAddress and message required' }, 400)
  }
  if (authWallet !== senderAddress.toLowerCase()) {
    return c.json({ error: 'Can only post comments as your own wallet' }, 403)
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
openJobs.post('/:id/rate', requireAuth, async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const { clientAddress, rating, comment } = body

  const feedbackErr = validateFieldLength(comment, 'feedback')
  if (feedbackErr) {
    return c.json({ error: feedbackErr }, 400)
  }

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

// ─── Admin Override & Appeals ─────────────────────────────────────────────────

// POST /api/open-jobs/:id/override-evaluation (service auth required)
openJobs.post('/:id/override-evaluation', requireAuth, async (c) => {
  const authWallet = ((c as any).get('wallet') as string)?.toLowerCase()
  const id = c.req.param('id')
  const { decision, reason } = await c.req.json()

  if (!['approved', 'rejected'].includes(decision)) {
    return c.json({ error: 'Decision must be approved or rejected' }, 400)
  }
  if (!reason || reason.length < 10) {
    return c.json({ error: 'Reason required (min 10 chars)' }, 400)
  }

  // Only service/admin can override
  const serviceKey = c.req.header('x-service-key')
  if (serviceKey !== process.env.SERVICE_API_KEY) {
    return c.json({ error: 'Admin access required' }, 403)
  }

  // Update evaluation
  await query(
    `UPDATE evaluations SET decision = $2, reasoning = $3, status = 'overridden' WHERE open_job_id = $1`,
    [id, decision, `[OVERRIDE by ${authWallet}] ${reason}`]
  )

  // Update job status
  await query(
    `UPDATE open_jobs SET status = $2 WHERE id = $1`,
    [id, decision === 'approved' ? 'completed' : 'rejected']
  )

  return c.json({ message: `Evaluation overridden: ${decision}` })
})

// POST /api/open-jobs/:id/appeal (agent submits appeal)
openJobs.post('/:id/appeal', requireAuth, async (c) => {
  const authWallet = ((c as any).get('wallet') as string)?.toLowerCase()
  const id = c.req.param('id')
  const { reason } = await c.req.json()

  if (!reason || reason.length < 20) {
    return c.json({ error: 'Appeal reason must be at least 20 characters' }, 400)
  }

  // Verify the user is the agent (provider) for this job
  const job = await query(`SELECT selected_applicant FROM open_jobs WHERE id = $1`, [id])
  if (!job.rows.length || job.rows[0].selected_applicant?.toLowerCase() !== authWallet) {
    return c.json({ error: 'Only the assigned agent can appeal' }, 403)
  }

  // Check for existing appeal
  const existing = await query(`SELECT id FROM evaluation_appeals WHERE open_job_id = $1 AND status = 'pending'`, [id])
  if (existing.rows.length) {
    return c.json({ error: 'An appeal is already pending' }, 409)
  }

  // Get evaluation ID
  const evalResult = await query(`SELECT id FROM evaluations WHERE open_job_id = $1`, [id])

  await query(
    `INSERT INTO evaluation_appeals (evaluation_id, open_job_id, agent_address, reason) VALUES ($1, $2, $3, $4)`,
    [evalResult.rows[0]?.id || null, id, authWallet, reason]
  )

  return c.json({ message: 'Appeal submitted' }, 201)
})

// GET /api/open-jobs/appeals/pending (admin)
openJobs.get('/appeals/pending', async (c) => {
  const serviceKey = c.req.header('x-service-key')
  if (serviceKey !== process.env.SERVICE_API_KEY) {
    return c.json({ error: 'Admin access required' }, 403)
  }

  const result = await query(
    `SELECT a.*, e.score, e.decision, e.reasoning, j.title as job_title
     FROM evaluation_appeals a
     LEFT JOIN evaluations e ON a.evaluation_id = e.id
     LEFT JOIN open_jobs j ON a.open_job_id = j.id
     WHERE a.status = 'pending'
     ORDER BY a.created_at ASC`
  )

  return c.json({ data: result.rows })
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
    refundTx: row.refund_tx || null,
    refundedAt: row.refunded_at || null,
    finalBudget: formatUsdc(row.final_budget),
    maxRevisions: row.max_revisions || 2,
    revisionCount: row.revision_count || 0,
    sectorConfig: row.sector_config || null,
    createdAt: row.created_at,
  }
}

