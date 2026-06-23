/**
 * Webhook dispatcher — reusable across all job lifecycle events.
 *
 * Extracted from the inline `job.created` logic in open-jobs.ts so every
 * lifecycle transition (selected / funded / completed / revision_requested)
 * can notify subscribed agents, not just job creation. Preserves the
 * security + reliability properties of the original:
 *   - HMAC-SHA256 payload signature with the per-webhook secret
 *   - SEC-023 DNS-rebinding re-validation at fire time
 *   - SEC-024 refuse to follow redirects (to internal hosts)
 *   - retry up to 3x with backoff; deactivate after 10 consecutive failures
 *
 * Bugs fixed vs the original inline version:
 *   - matched on a non-existent `category` column → now `category_filter`
 *   - ignored the subscriber's `events` array → now `$event = ANY(events)`
 *   - only ever fired for job.created → now any event, optionally targeted
 *     at a specific agent (selected/funded/completed are agent-specific).
 */
import { createHmac } from 'crypto'
import { query } from '../db.js'

/** Canonical lifecycle events. Keep in sync with the SDK README. */
export type WebhookEvent =
  | 'job.created'
  | 'job.selected'
  | 'job.funded'
  | 'job.completed'
  | 'job.revision_requested'
  | 'job.rejected'

export const CANONICAL_EVENTS: WebhookEvent[] = [
  'job.created',
  'job.selected',
  'job.funded',
  'job.completed',
  'job.revision_requested',
  'job.rejected',
]

interface DispatchOpts {
  /** Job category, for category_filter matching (job.created fan-out). */
  category?: string | null
  /** Job budget, for budget_min matching. */
  budget?: number | null
  /**
   * When set, only deliver to webhooks owned by this agent address —
   * used for agent-specific events (selected/funded/completed/revision).
   */
  agentAddress?: string | null
  /** Arbitrary job payload included in the webhook body. */
  job: Record<string, unknown>
}

/**
 * Fire all webhooks subscribed to `event` that match the filters.
 * Non-blocking: returns immediately; deliveries run in the background.
 */
export async function dispatchWebhooks(event: WebhookEvent, opts: DispatchOpts): Promise<void> {
  try {
    const params: unknown[] = [event]
    let where = `active = true AND $1 = ANY(events)`

    // Agent-targeted events: only that agent's webhooks.
    if (opts.agentAddress) {
      params.push(opts.agentAddress.toLowerCase())
      where += ` AND lower(agent_address) = $${params.length}`
    }

    // Category filter (NULL filter = match all). Column is category_filter.
    if (opts.category !== undefined) {
      params.push(opts.category)
      where += ` AND (category_filter IS NULL OR category_filter = $${params.length})`
    }

    // Budget gate (subscriber's budget_min must be <= the job budget).
    if (opts.budget != null) {
      params.push(opts.budget)
      where += ` AND (budget_min IS NULL OR budget_min <= $${params.length})`
    }

    const webhooks = await query(`SELECT * FROM webhooks WHERE ${where}`, params)

    for (const wh of webhooks.rows) {
      const payload = JSON.stringify({ event, job: opts.job, timestamp: new Date().toISOString() })
      const signature = wh.secret ? createHmac('sha256', wh.secret).update(payload).digest('hex') : ''
      fireOne(wh, event, payload, signature, 0)
    }
  } catch (err: any) {
    console.warn(`[webhook] dispatch(${event}) matching error:`, err.message)
  }
}

async function fireOne(wh: any, event: string, payload: string, signature: string, attempt: number): Promise<void> {
  try {
    // SEC-023: re-validate URL at fire time to defeat DNS rebinding.
    const { _validateWebhookUrlForDelivery } = await import('../routes/keys.js')
    const stillSafe = await _validateWebhookUrlForDelivery(wh.url)
    if (!stillSafe) throw new Error('webhook url no longer resolves to a safe public host')

    const res = await fetch(wh.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-ArcHive-Event': event,
        'X-ArcHive-Signature': signature,
        'X-ArcHive-Timestamp': new Date().toISOString(),
        'User-Agent': 'archive-webhook/1.0',
      },
      body: payload,
      redirect: 'manual', // SEC-024
      signal: AbortSignal.timeout(10_000),
    })
    if (res.status >= 300 && res.status < 400) throw new Error(`webhook redirected (${res.status}) — refusing to follow`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    await query(`UPDATE webhooks SET failure_count = 0, last_triggered_at = NOW() WHERE id = $1`, [wh.id])
  } catch (err: any) {
    if (attempt < 2) {
      await new Promise(r => setTimeout(r, 2000 * (attempt + 1)))
      return fireOne(wh, event, payload, signature, attempt + 1)
    }
    console.warn(`[webhook] Failed to notify ${wh.url} (${event}) after ${attempt + 1} attempts: ${err.message}`)
    await query(
      `UPDATE webhooks SET failure_count = failure_count + 1, active = CASE WHEN failure_count >= 9 THEN FALSE ELSE active END WHERE id = $1`,
      [wh.id]
    )
  }
}
