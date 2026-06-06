import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serve } from '@hono/node-server'
import 'dotenv/config'

import { agents } from './routes/agents.js'
import { jobs } from './routes/jobs.js'
import { stats } from './routes/stats.js'
import { openJobs } from './routes/open-jobs.js'
import { keys } from './routes/keys.js'
import { fileRoutes } from './routes/files.js'
import { auth } from './routes/auth.js'
import { errorHandler } from './middleware/error.js'
import { rateLimiter } from './middleware/rate-limit.js'
import { securityHeaders } from './middleware/security-headers.js'

const app = new Hono()

// Security headers — applied before all else
app.use('*', securityHeaders())

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

// Proxy indexer health
app.get('/api/health', async (c) => {
  try {
    const res = await fetch('http://localhost:3001/health', { signal: AbortSignal.timeout(5000) })
    const data = await res.json()
    const syncing = data.historicalProgress?.some((p: any) => p.progress !== '100%') || false
    return c.json({ syncing, liveSync: data.liveSync, block: data.contracts?.[0]?.last_synced_block })
  } catch {
    return c.json({ syncing: false, liveSync: false, block: null })
  }
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
const server = serve({ fetch: app.fetch, port })
console.log(`[API] ArcHive API listening on :${port}`)

// Graceful shutdown
const shutdown = () => {
  console.log('[API] Shutting down gracefully...')
  server.close(() => {
    console.log('[API] Closed')
    process.exit(0)
  })
  // Force exit after 10s
  setTimeout(() => process.exit(1), 10000)
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
