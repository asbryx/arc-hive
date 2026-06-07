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
  console.error(`[API] Error:`, err.message)

  const status = (err as any).status || 500
  return c.json({
    error: sanitizeErrorMessage(status, err.message),
    status,
  }, status)
}
