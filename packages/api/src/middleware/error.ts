import type { ErrorHandler } from 'hono'

const SAFE_PATTERNS = ['not found', 'unauthorized', 'forbidden', 'bad request', 'conflict', 'required', 'invalid', 'expired', 'limit']

function sanitizeErrorMessage(status: number, message: string | undefined): string {
  if (status >= 500) return 'Internal server error'
  if (!message) return 'Request failed'
  const lower = message.toLowerCase()
  if (SAFE_PATTERNS.some(p => lower.includes(p))) return message
  return 'Request failed'
}

export const errorHandler: ErrorHandler = (err, c) => {
  // T-MO02: Structured error logging with timestamp, context, and stack trace
  const timestamp = new Date().toISOString()
  const method = c.req.method
  const path = c.req.path

  // T-FZ03/FZ04: Handle JSON parse errors and oversized bodies as 400
  if (err.message?.includes('Invalid JSON') || err.message?.includes('JSON') || err.message?.includes('parse') || err.message?.includes('Unexpected token') || err.message?.includes('too large') || err.message?.includes('Body limit') || err.message?.includes('null byte')) {
    return c.json({ error: 'Bad request', status: 400 }, 400)
  }

  console.error(`[API] ${timestamp} ${method} ${path} Error:`, err.message)
  if (err.stack) console.error(err.stack)

  const status = (err as any).status || 500
  return c.json({
    error: sanitizeErrorMessage(status, err.message),
    status,
    requestId: c.req.header('x-request-id') || undefined,
  }, status)
}
