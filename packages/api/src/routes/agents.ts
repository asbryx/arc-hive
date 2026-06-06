import { Hono } from 'hono'
import { query, queryAgents } from '../db.js'

export const agents = new Hono()

// Helper: parse pagination (validates NaN)
function paginate(c: any) {
  const rawPage = parseInt(c.req.query('page') || '1')
  const rawLimit = parseInt(c.req.query('limit') || '20')
  const page = Number.isFinite(rawPage) ? Math.max(1, rawPage) : 1
  const limit = Number.isFinite(rawLimit) ? Math.min(100, Math.max(1, rawLimit)) : 20
  const offset = (page - 1) * limit
  return { page, limit, offset }
}

// GET /api/agents — list all agents (paginated, filterable)
agents.get('/', async (c) => {
  const { page, limit, offset } = paginate(c)

  // Filters
  const capability = c.req.query('capability')
  const minScore = c.req.query('min_score')
  const trustTier = c.req.query('trust_tier')
  const activeSince = c.req.query('active_since')
  const minJobs = c.req.query('min_jobs')
  const owner = c.req.query('owner')
  const sort = c.req.query('sort') || 'newest'

  const conditions: string[] = []
  const params: unknown[] = []
  let paramIdx = 1

  if (capability) {
    conditions.push(`a.capabilities @> ARRAY[$${paramIdx}]::text[]`)
    params.push(capability)
    paramIdx++
  }
  if (minScore) {
    conditions.push(`s.avg_score >= $${paramIdx}`)
    params.push(parseFloat(minScore))
    paramIdx++
  }
  if (trustTier) {
    conditions.push(`s.trust_tier >= $${paramIdx}`)
    params.push(parseInt(trustTier))
    paramIdx++
  }
  if (activeSince) {
    const days = parseInt(activeSince.replace('d', ''))
    if (Number.isFinite(days) && days > 0 && days < 3650) {
      conditions.push(`s.last_active_at >= NOW() - INTERVAL '${days} days'`)
    }
  }
  if (minJobs) {
    conditions.push(`s.completed_jobs >= $${paramIdx}`)
    params.push(parseInt(minJobs))
    paramIdx++
  }
  if (owner) {
    conditions.push(`a.owner_address = $${paramIdx}`)
    params.push(owner.toLowerCase())
    paramIdx++
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  // Sort
  const sortMap: Record<string, string> = {
    newest: 'a.registered_at DESC',
    oldest: 'a.registered_at ASC',
    score_desc: 'COALESCE(s.avg_score, 0) DESC',
    score_asc: 'COALESCE(s.avg_score, 0) ASC',
    earnings_desc: 'COALESCE(s.total_earned, 0) DESC',
    jobs_desc: 'COALESCE(s.completed_jobs, 0) DESC',
  }
  const orderBy = sortMap[sort] || sortMap.newest

  // Count
  const countResult = await queryAgents(
    `SELECT COUNT(*) FROM agents a LEFT JOIN agent_scores s ON a.agent_id = s.agent_id ${where}`,
    params
  )
  const total = parseInt(countResult.rows[0].count)

  // Data
  const dataResult = await queryAgents(
    `SELECT
       a.agent_id, a.name, a.owner_address, a.image_uri, a.capabilities,
       a.agent_type, a.registered_at,
       s.avg_score, s.trust_tier, s.completed_jobs, s.total_earned, s.last_active_at
     FROM agents a
     LEFT JOIN agent_scores s ON a.agent_id = s.agent_id
     ${where}
     ORDER BY ${orderBy}
     LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
    [...params, limit, offset]
  )

  return c.json({
    data: dataResult.rows.map(formatAgentListItem),
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
  })
})

// GET /api/agents/search — full-text search (or browse all if no query)
agents.get('/search', async (c) => {
  const q = c.req.query('q') || ''
  const { page, limit, offset } = paginate(c)

  let searchResult: any
  let countResult: any

  if (q) {
    const searchQLike = `%${q}%`
    const searchQ = q.toLowerCase()
    searchResult = await queryAgents(
      `SELECT
         a.agent_id, a.name, a.owner_address, a.image_uri, a.capabilities,
         a.agent_type, a.registered_at,
         s.avg_score, s.trust_tier, s.completed_jobs, s.total_earned, s.last_active_at
       FROM agents a
       LEFT JOIN agent_scores s ON a.agent_id = s.agent_id
       WHERE a.name ILIKE $1 OR a.description ILIKE $1 OR $2 = ANY(a.capabilities)
         OR a.owner_address ILIKE $1 OR CAST(a.agent_id AS TEXT) = $2
       ORDER BY COALESCE(s.avg_score, 0) DESC
       LIMIT $3 OFFSET $4`,
      [searchQLike, searchQ, limit, offset]
    )
    countResult = await queryAgents(
      `SELECT COUNT(*) FROM agents a WHERE a.name ILIKE $1 OR a.description ILIKE $1 OR $2 = ANY(a.capabilities)
         OR a.owner_address ILIKE $1 OR CAST(a.agent_id AS TEXT) = $2`,
      [searchQLike, searchQ]
    )
  } else {
    // No query — return all agents, ordered by score
    searchResult = await queryAgents(
      `SELECT
         a.agent_id, a.name, a.owner_address, a.image_uri, a.capabilities,
         a.agent_type, a.registered_at,
         s.avg_score, s.trust_tier, s.completed_jobs, s.total_earned, s.last_active_at
       FROM agents a
       LEFT JOIN agent_scores s ON a.agent_id = s.agent_id
       ORDER BY COALESCE(s.avg_score, 0) DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    )
    countResult = await queryAgents(`SELECT COUNT(*) FROM agents`)
  }

  return c.json({
    data: searchResult.rows.map(formatAgentListItem),
    total: parseInt(countResult.rows[0].count),
    page,
    limit,
    pages: Math.ceil(parseInt(countResult.rows[0].count) / limit),
  })
})

// GET /api/agents/leaderboard
agents.get('/leaderboard', async (c) => {
  const by = c.req.query('by') || 'score'
  const rawLimit = parseInt(c.req.query('limit') || '20')
  const limit = Number.isFinite(rawLimit) ? Math.min(50, Math.max(1, rawLimit)) : 20

  const orderMap: Record<string, string> = {
    score: 'COALESCE(s.composite_score, 0) DESC',
    earnings: 'COALESCE(s.total_earned, 0) DESC',
    jobs: 'COALESCE(s.completed_jobs, 0) DESC',
    reputation: 'COALESCE(s.avg_score, 0) DESC',
  }
  const orderBy = orderMap[by] || orderMap.score

  const result = await queryAgents(
    `SELECT
       a.agent_id, a.name, a.owner_address, a.image_uri, a.capabilities,
       s.avg_score, s.trust_tier, s.completed_jobs, s.total_earned,
       s.total_feedback_count, s.completion_rate, s.last_active_at, s.composite_score
     FROM agents a
     INNER JOIN agent_scores s ON a.agent_id = s.agent_id
     WHERE s.composite_score IS NOT NULL
     ORDER BY ${orderBy}
     LIMIT $1`,
    [limit]
  )

  return c.json({ data: result.rows.map(formatAgentListItem) })
})

// GET /api/agents/:id — full profile
agents.get('/:id', async (c) => {
  const id = c.req.param('id')

  // Detect if id is a wallet address (0x...) or numeric agent_id
  const isWallet = id.startsWith('0x') && id.length >= 40
  const whereClause = isWallet
    ? 'a.owner_address = $1'
    : 'a.agent_id = $1'
  // For wallet lookups, cast to BIGINT if numeric
  const param = isWallet ? id.toLowerCase() : id

  const agentResult = await queryAgents(
    `SELECT a.*, s.*
     FROM agents a
     LEFT JOIN agent_scores s ON a.agent_id = s.agent_id
     WHERE ${whereClause}`,
    [param]
  )

  if (agentResult.rows.length === 0) {
    return c.json({ error: 'Agent not found' }, 404)
  }

  const row = agentResult.rows[0]

  return c.json({
    agentId: parseInt(row.agent_id),
    name: row.name,
    description: row.description,
    owner: row.owner_address,
    imageUri: row.image_uri,
    metadataUri: row.metadata_uri,
    capabilities: row.capabilities || [],
    agentType: row.agent_type,
    version: row.version,
    agentWallet: row.agent_wallet,
    registeredAt: row.registered_at,
    score: {
      average: row.avg_score ? parseFloat(row.avg_score) : null,
      totalFeedback: parseInt(row.total_feedback_count || '0'),
      positive: parseInt(row.positive_feedback_count || '0'),
      negative: parseInt(row.negative_feedback_count || '0'),
      uniqueRaters: parseInt(row.unique_raters || '0'),
      completionRate: row.completion_rate ? parseFloat(row.completion_rate) : null,
    },
    jobs: {
      total: parseInt(row.total_jobs || '0'),
      completed: parseInt(row.completed_jobs || '0'),
      rejected: parseInt(row.rejected_jobs || '0'),
      expired: parseInt(row.expired_jobs || '0'),
      totalEarned: formatUsdc(row.total_earned),
    },
    validations: {
      total: parseInt(row.total_validations || '0'),
      approved: parseInt(row.approved_validations || '0'),
    },
    trustTier: parseInt(row.trust_tier || '0'),
    lastActiveAt: row.last_active_at,
  })
})

// GET /api/agents/:id/reputation
agents.get('/:id/reputation', async (c) => {
  const id = c.req.param('id')
  const { page, limit, offset } = paginate(c)

  const result = await queryAgents(
    `SELECT * FROM reputation_events
     WHERE agent_id = $1 AND NOT is_revoked
     ORDER BY block_timestamp DESC
     LIMIT $2 OFFSET $3`,
    [id, limit, offset]
  )

  const countResult = await queryAgents(
    `SELECT COUNT(*) FROM reputation_events WHERE agent_id = $1 AND NOT is_revoked`,
    [id]
  )

  return c.json({
    data: result.rows.map(r => ({
      clientAddress: r.client_address,
      value: r.value,
      valueDecimals: r.value_decimals,
      tag1: r.tag1,
      tag2: r.tag2,
      feedbackUri: r.feedback_uri,
      timestamp: r.block_timestamp,
      txHash: r.tx_hash,
    })),
    total: parseInt(countResult.rows[0].count),
    page,
    limit,
  })
})

// GET /api/agents/:id/jobs
agents.get('/:id/jobs', async (c) => {
  const id = c.req.param('id')
  const { page, limit, offset } = paginate(c)

  // Get agent's owner address for matching
  const agentResult = await queryAgents(`SELECT owner_address FROM agents WHERE agent_id = $1`, [id])
  const ownerAddress = agentResult.rows[0]?.owner_address

  const result = await query(
    `SELECT j.*, (SELECT je.tx_hash FROM job_events je WHERE je.job_id = j.job_id AND je.event_name = 'JobCompleted' LIMIT 1) as completion_tx
     FROM jobs j
     WHERE j.provider_agent_id = $1 OR ($2::text IS NOT NULL AND j.provider_address = $2::text)
     ORDER BY j.created_timestamp DESC
     LIMIT $3 OFFSET $4`,
    [id, ownerAddress || null, limit, offset]
  )

  const countResult = await query(
    `SELECT COUNT(*) FROM jobs WHERE provider_agent_id = $1 OR ($2::text IS NOT NULL AND provider_address = $2::text)`,
    [id, ownerAddress || null]
  )

  return c.json({
    data: result.rows.map(formatJobListItem),
    total: parseInt(countResult.rows[0].count),
    page,
    limit,
  })
})

// GET /api/agents/:id/validations
agents.get('/:id/validations', async (c) => {
  const id = c.req.param('id')

  const result = await queryAgents(
    `SELECT * FROM validations WHERE agent_id = $1 ORDER BY request_timestamp DESC`,
    [id]
  )

  return c.json({
    data: result.rows.map(r => ({
      validatorAddress: r.validator_address,
      requestHash: r.request_hash,
      requestUri: r.request_uri,
      responseStatus: r.response_status,
      responseTag: r.response_tag,
      requestedAt: r.request_timestamp,
      respondedAt: r.responded_at,
    })),
  })
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatAgentListItem(row: any) {
  return {
    agentId: parseInt(row.agent_id),
    name: row.name,
    owner: row.owner_address,
    imageUri: row.image_uri,
    capabilities: row.capabilities || [],
    agentType: row.agent_type,
    score: row.composite_score ? parseFloat(row.composite_score) : (row.avg_score ? parseFloat(row.avg_score) : null),
    reputationScore: row.avg_score ? parseFloat(row.avg_score) : null,
    trustTier: parseInt(row.trust_tier || '0'),
    completedJobs: parseInt(row.completed_jobs || '0'),
    totalEarned: formatUsdc(row.total_earned),
    lastActiveAt: row.last_active_at,
    registeredAt: row.registered_at,
  }
}

function formatJobListItem(row: any) {
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
