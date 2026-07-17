import { Hono } from 'hono'
import { createPublicClient, http, keccak256, toBytes } from 'viem'
import { query } from '../db.js'
import { requireAuth } from '../middleware/auth.js'
import { hasSubmittedDeliverable } from '../lib/commerce-receipt.js'
import { formatUsdc } from '../lib/format.js'

export const jobs = new Hono()

const ARC_RPC = 'https://rpc.testnet.arc.network'
const AGENTIC_COMMERCE = '0x0747eef0706327138c69792bf28cd525089e4583'
const arcChain = {
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'ARC', symbol: 'ARC', decimals: 18 },
  rpcUrls: { default: { http: [ARC_RPC] } },
} as const

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
    const parsed = parseFloat(minBudget)
    if (!Number.isFinite(parsed) || parsed < 0) {
      return c.json({ error: 'minBudget must be a positive number' }, 400)
    }
    conditions.push(`budget >= $${paramIdx}`)
    params.push(BigInt(Math.round(parsed * 1_000_000)).toString())
    paramIdx++
  }
  if (maxBudget) {
    const parsedMax = parseFloat(maxBudget)
    if (!Number.isFinite(parsedMax) || parsedMax < 0) {
      return c.json({ error: 'maxBudget must be a positive number' }, 400)
    }
    conditions.push(`budget <= $${paramIdx}`)
    params.push(BigInt(Math.round(parsedMax * 1_000_000)).toString())
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

  if (!/^\d+$/.test(id)) {
    return c.json({ error: 'Invalid job ID. Must be numeric.' }, 400)
  }

  const jobResult = await query(
    `SELECT * FROM jobs WHERE job_id = $1 AND lower(source_contract) = $2`,
    [id, AGENTIC_COMMERCE]
  )
  if (jobResult.rows.length === 0) {
    return c.json({ error: 'Commerce job not found' }, 404)
  }

  const eventsResult = await query(
    `SELECT event_name, event_data, block_timestamp, tx_hash
     FROM job_events
     WHERE job_id = $1 AND lower(source_contract) = $2 ORDER BY block_number, log_index`,
    [id, AGENTIC_COMMERCE]
  )

  // Direct Explorer deliverables are keyed by the indexed chain identity.
  // Marketplace job_deliverables use local open_jobs.id and must never be read here.
  const deliverableResult = await query(
    `SELECT content, link, notes, created_at, submission_tx
     FROM indexed_job_deliverables
     WHERE job_id = $1 AND source_contract = $2`,
    [id, jobResult.rows[0].source_contract]
  )

  // Check if there's a matching open_jobs entry (marketplace metadata)
  const marketplaceResult = await query(
    `SELECT title, description, category, requirements, budget_min, budget_max, deadline_hours FROM open_jobs WHERE job_id = $1`,
    [id]
  )
  const marketplace = marketplaceResult.rows.length > 0 ? marketplaceResult.rows[0] : null

  // Get AI evaluation if exists (evaluations link via open_jobs)
  const evaluationResult = await query(
    `SELECT e.score, e.reasoning, e.status as decision, e.tx_hash as completion_tx, e.created_at as evaluated_at, e.llm_model
     FROM evaluations e
     JOIN open_jobs oj ON oj.id = e.open_job_id
     WHERE oj.job_id = $1
     ORDER BY e.version DESC LIMIT 1`,
    [id]
  )
  const evaluation = evaluationResult.rows.length > 0 ? evaluationResult.rows[0] : null

  const job = jobResult.rows[0]
  const statusNames = ['Open', 'Funded', 'Submitted', 'Completed', 'Rejected', 'Expired']

  // Use on-chain budget, fallback to marketplace budget range if 0
  let budget = formatUsdc(job.budget)
  let budgetMin = null
  let budgetMax = null
  if (!budget && marketplace) {
    budgetMin = formatUsdc(marketplace.budget_min)
    budgetMax = formatUsdc(marketplace.budget_max)
    budget = budgetMin && budgetMax ? `${budgetMin}–${budgetMax}` : budgetMax || budgetMin
  }

  return c.json({
    jobId: parseInt(job.job_id),
    client: job.client_address,
    provider: job.provider_address,
    evaluator: job.evaluator_address,
    providerAgentId: job.provider_agent_id ? parseInt(job.provider_agent_id) : null,
    description: job.description,
    status: statusNames[job.status] || 'Unknown',
    budget,
    budgetMin,
    budgetMax,
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
    sourceContract: job.source_contract,
    marketplace: marketplace ? {
      title: marketplace.title,
      description: marketplace.description,
      category: marketplace.category,
      requirements: marketplace.requirements,
      deadlineHours: marketplace.deadline_hours,
    } : null,
    deliverable: deliverableResult.rows.length > 0 ? {
      content: deliverableResult.rows[0].content,
      link: deliverableResult.rows[0].link,
      notes: deliverableResult.rows[0].notes,
      submittedAt: deliverableResult.rows[0].created_at,
    } : null,
    evaluation: evaluation ? {
      score: evaluation.score,
      reasoning: evaluation.reasoning,
      decision: evaluation.decision,
      completionTx: evaluation.completion_tx,
      evaluatedAt: evaluation.evaluated_at,
      model: evaluation.llm_model,
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
jobs.post('/:id/deliverable', requireAuth, async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const { providerAddress, content, link, notes, submissionTx } = body
  const authWallet = (c as any).get('wallet')?.toLowerCase()

  if (!id || !/^\d+$/.test(id)) {
    return c.json({ error: 'Invalid job ID. Must be numeric.' }, 400)
  }
  if (typeof providerAddress !== 'string' || typeof content !== 'string' || typeof submissionTx !== 'string') {
    return c.json({ error: 'providerAddress, content, and submissionTx required' }, 400)
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(providerAddress)) {
    return c.json({ error: 'Invalid provider address' }, 400)
  }
  if (!/^0x[a-fA-F0-9]{64}$/.test(submissionTx)) {
    return c.json({ error: 'submissionTx must be a transaction hash' }, 400)
  }
  const jobId = id
  const provider = providerAddress
  const deliverableContent = content
  const txHash = submissionTx as `0x${string}`

  // Verify authenticated wallet matches claimed provider
  if (authWallet && authWallet !== provider.toLowerCase()) {
    return c.json({ error: 'Authenticated wallet does not match provider' }, 403)
  }

  // Explorer is an indexed on-chain surface. Restrict this route to the known
  // commerce contract and bind the row to its composite on-chain identity.
  const jobResult = await query(
    `SELECT provider_address, status, source_contract
     FROM jobs
     WHERE job_id = $1 AND lower(source_contract) = $2`,
    [jobId, AGENTIC_COMMERCE]
  )
  if (jobResult.rows.length === 0) {
    return c.json({ error: 'Commerce job not found' }, 404)
  }
  const job = jobResult.rows[0]
  if (job.provider_address?.toLowerCase() !== provider.toLowerCase()) {
    return c.json({ error: 'Only the provider can submit deliverables' }, 403)
  }

  // Receipt validation is authoritative. The indexer may process JobSubmitted
  // before this request arrives, so both pre- and post-indexer states are valid.
  const currentStatus = job.status
  if (![1, 2, '1', '2', 'Funded', 'funded', 'Submitted', 'submitted'].includes(currentStatus)) {
    return c.json({ error: `Cannot synchronize deliverable for job in status: ${currentStatus}` }, 400)
  }

  try {
    const receipt = await createPublicClient({ chain: arcChain, transport: http(ARC_RPC) })
      .getTransactionReceipt({ hash: txHash })
    const deliverableHash = keccak256(toBytes(deliverableContent))
    if (!hasSubmittedDeliverable(receipt, BigInt(jobId), provider, deliverableHash)) {
      return c.json({ error: 'submissionTx is not a successful JobSubmitted transaction for this job, provider, and content' }, 400)
    }

    const sourceContract = job.source_contract.toLowerCase()
    const inserted = await query(
      `INSERT INTO indexed_job_deliverables
         (job_id, source_contract, provider_address, content, link, notes, deliverable_hash, submission_tx)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (job_id, source_contract) DO NOTHING
       RETURNING submission_tx`,
      [jobId, sourceContract, provider.toLowerCase(), deliverableContent, link || null, notes || null, deliverableHash, txHash]
    )

    if (inserted.rows.length === 0) {
      const existing = await query(
        `SELECT submission_tx FROM indexed_job_deliverables WHERE job_id = $1 AND source_contract = $2`,
        [jobId, sourceContract]
      )
      if (existing.rows[0]?.submission_tx?.toLowerCase() !== txHash.toLowerCase()) {
        return c.json({ error: 'A different on-chain deliverable is already synchronized for this job' }, 409)
      }
    }

    return c.json({ success: true, submissionTx: txHash }, inserted.rows.length > 0 ? 201 : 200)
  } catch {
    return c.json({ error: 'submissionTx was not found or could not be verified on Arc Testnet' }, 400)
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
    sourceContract: row.source_contract || null,
  }
}

