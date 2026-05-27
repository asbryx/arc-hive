import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serve } from '@hono/node-server'
import 'dotenv/config'

import { agents } from './routes/agents.js'
import { jobs } from './routes/jobs.js'
import { stats } from './routes/stats.js'
import { errorHandler } from './middleware/error.js'
import { rateLimiter } from './middleware/rate-limit.js'

const app = new Hono()

// Global middleware
app.use('*', cors())
app.use('/api/*', rateLimiter())
app.onError(errorHandler)

// Routes
app.route('/api/agents', agents)
app.route('/api/jobs', jobs)
app.route('/api/stats', stats)

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
console.log(`[API] ArcHive API listening on :${port}`)
serve({ fetch: app.fetch, port })
