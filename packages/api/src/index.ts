import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serve } from '@hono/node-server'
import { bodyLimit } from 'hono/body-limit'
import 'dotenv/config'

import { agents } from './routes/agents.js'
import { jobs } from './routes/jobs.js'
import { stats } from './routes/stats.js'
import { openJobs } from './routes/open-jobs.js'
import { keys } from './routes/keys.js'
import { fileRoutes, cleanupExpiredFiles } from './routes/files.js'
import { auth } from './routes/auth.js'
import { errorHandler } from './middleware/error.js'
import { rateLimiter } from './middleware/rate-limit.js'
import { securityHeaders } from './middleware/security-headers.js'

const app = new Hono()

// x402 Payment Protocol (uncomment to enforce payment for /api/* routes):
// import { x402PaymentRequired } from './middleware/x402.js'
// app.use('/api/*', x402PaymentRequired({ priceUsd: 0.01 }))

// Security headers — applied before all else
app.use('*', securityHeaders())

// T-FZ03: Default request body cap is 100KB — applied to non-file routes only.
// File-upload routes mount under /api/open-jobs/:id/deliver and /api/open-jobs/:id/files
// (see fileRoutes) and need up to 10 files × 10MB each = ~100MB; they get a higher
// cap below. Anything else is JSON-only and 100KB is plenty.
const DEFAULT_BODY_LIMIT = 100 * 1024
const FILE_UPLOAD_BODY_LIMIT = 110 * 1024 * 1024 // 10 files × 10MB + multipart overhead

// Apply the default cap everywhere except the file-upload deliver route.
// The deliver route enforces its own per-file size limit (10MB) and file-count
// limit (10) inside files.ts after authentication; the body-limit here is just
// a coarse first-line DoS guard.
app.use('*', async (c, next) => {
  const path = c.req.path
  const isFileUpload =
    c.req.method === 'POST' &&
    /^\/api\/open-jobs\/[^/]+\/deliver$/.test(path) &&
    (c.req.header('content-type') || '').includes('multipart/form-data')
  const limit = isFileUpload ? FILE_UPLOAD_BODY_LIMIT : DEFAULT_BODY_LIMIT
  return bodyLimit({ maxSize: limit })(c, next)
})

// Global middleware
const corsOrigins = [
  'https://arcs-hive.vercel.app',
  'https://archive-kappa-weld.vercel.app',
]
if (process.env.CORS_ORIGIN) {
  corsOrigins.push(process.env.CORS_ORIGIN)
}
if (process.env.NODE_ENV === 'development') {
  corsOrigins.push('http://localhost:5173')
}

app.use('*', cors({
  origin: corsOrigins,
}))
app.use('/api/*', rateLimiter())
app.onError(errorHandler)

// Routes
app.route('/api/agents', agents)
app.route('/api/jobs', jobs)
app.route('/api/stats', stats)
app.route('/api/open-jobs', openJobs)
app.route('/api/open-jobs', fileRoutes) // file upload/download routes
app.route('/api/keys', keys)
app.route('/api/auth', auth)

// GET /api/files/cleanup — Vercel Cron endpoint for expired-file cleanup
app.get('/api/files/cleanup', async (c) => {
  const cronSecret = process.env.CRON_SECRET || process.env.SERVICE_AUTH_KEY
  if (!cronSecret) {
    return c.json({ error: 'Cleanup endpoint not configured' }, 500)
  }
  const authHeader = c.req.header('Authorization') || ''
  const queryKey = c.req.query('key')
  const provided = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : queryKey
  if (provided !== cronSecret) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  const { deleted, failed } = await cleanupExpiredFiles()
  return c.json({ deleted, failed })
})

// T-MO01: Health check — API + DB + indexer + evaluator
app.get('/api/health', async (c) => {
  const checks: any = { api: 'ok' }
  const errors: string[] = []

  // Check DB connectivity
  try {
    const { query } = await import('./db.js')
    await query('SELECT 1')
    checks.db = 'ok'
  } catch (err: any) {
    checks.db = 'error'
    errors.push(`db: ${err.message}`)
  }

  // Check indexer
  try {
    const res = await fetch('http://localhost:3001/health', { signal: AbortSignal.timeout(5000) })
    const data = await res.json()
    const syncing = data.historicalProgress?.some((p: any) => p.progress !== '100%') || false
    checks.indexer = 'ok'
    checks.syncing = syncing
    checks.liveSync = data.liveSync
    checks.block = data.contracts?.[0]?.last_synced_block
  } catch {
    checks.indexer = 'unreachable'
    errors.push('indexer: unreachable')
  }

  // Check evaluator (polls DB every 10s, check if evaluating_pending or evaluating jobs are recent)
  try {
    const { query } = await import('./db.js')
    const stale = await query(
      `SELECT COUNT(*) FROM open_jobs WHERE status IN ('evaluating', 'evaluating_pending') AND updated_at < NOW() - INTERVAL '5 minutes'`
    )
    checks.evaluator = parseInt(stale.rows[0].count) === 0 ? 'ok' : 'stale_jobs'
  } catch {
    checks.evaluator = 'unknown'
  }

  const healthy = errors.length === 0
  return c.json(checks, healthy ? 200 : 503)
})

// Root
app.get('/', (c) => c.json({
  name: 'ArcHive API',
  version: '0.1.0',
  description: 'Agent Intelligence Layer for Arc Network',
  endpoints: {
    agents: '/api/agents',
    jobs: '/api/jobs',
    stats: '/api/stats',
  },
}))

const port = parseInt(process.env.API_PORT || '3000')
const hostname = process.env.API_HOST || '0.0.0.0'
const server = serve({ fetch: app.fetch, port, hostname })
console.log(`[API] ArcHive API listening on ${hostname}:${port}`)

// Periodically remove expired deliverable files from storage and DB metadata.
const cleanupInterval = setInterval(async () => {
  try {
    const { deleted, failed } = await cleanupExpiredFiles()
    if (deleted || failed) console.log(`[API] file cleanup: deleted=${deleted} failed=${failed}`)
  } catch (err: any) {
    console.error('[API] file cleanup failed:', err.message)
  }
}, 60 * 60 * 1000)
cleanupInterval.unref()

// Graceful shutdown
const shutdown = () => {
  console.log('[API] Shutting down gracefully...')
  clearInterval(cleanupInterval)
  server.close(() => {
    console.log('[API] Closed')
    process.exit(0)
  })
  // Force exit after 10s
  setTimeout(() => process.exit(1), 10000)
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
