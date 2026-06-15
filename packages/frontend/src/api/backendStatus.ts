/**
 * Backend liveness signaling for the SPA.
 *
 * Audit fix T7 (2026-06-15): when the API returns 502/503 (Vercel edge
 * cannot reach the ThinkPad-hosted backend), the frontend gave NO
 * indication anything was wrong. Worse: the wallet-tx buttons stayed
 * enabled, so a user could sign and broadcast on-chain transactions
 * (burning real gas) while the off-chain mirror was offline — leading
 * to in-flight inconsistencies that needed manual repair.
 *
 * This module is the single source of truth for "is the API reachable":
 *
 *   - `markBackendOffline()` — called by `authFetch` / `fetchApi` when a
 *      response status is in OFFLINE_STATUSES, or the fetch threw a
 *      network error
 *   - `markBackendOnline()`  — called when ANY response with status
 *      < 500 lands (the simplest live signal)
 *   - `subscribeBackendStatus(cb)` — for components to render a banner
 *   - `getBackendStatus()`   — for synchronous gating of write actions
 *
 * Implementation note: a tiny in-memory pubsub. We deliberately avoid
 * a state-management dep — this is one boolean.
 */

export type BackendStatus = 'online' | 'offline' | 'unknown'

const OFFLINE_STATUSES = new Set([502, 503, 504])

let current: BackendStatus = 'unknown'
const listeners = new Set<(s: BackendStatus) => void>()
let lastChangeAt = 0

function setStatus(next: BackendStatus): void {
  if (next === current) return
  current = next
  lastChangeAt = Date.now()
  for (const l of listeners) {
    try {
      l(next)
    } catch {
      // a single bad subscriber should not break the others
    }
  }
}

export function getBackendStatus(): BackendStatus {
  return current
}

export function getLastChangeAt(): number {
  return lastChangeAt
}

export function isBackendOnline(): boolean {
  return current !== 'offline'
}

export function subscribeBackendStatus(cb: (s: BackendStatus) => void): () => void {
  listeners.add(cb)
  // Push current state immediately so subscribers don't render stale UI
  try {
    cb(current)
  } catch {}
  return () => listeners.delete(cb)
}

/**
 * Apply a fetch outcome to the global status.
 *
 * `response` is the Response if one came back, or `null` if the fetch
 * itself rejected (network error, CORS, DNS, abort). Both code paths
 * end up here so all callers — `authFetch`, `fetchApi`, and anything
 * else later — funnel through one rule.
 */
export function applyFetchResult(response: Response | null, error?: unknown): void {
  if (!response) {
    // Distinguish AbortError (deliberate cancellation) from real network failure
    if (error && (error as any)?.name === 'AbortError') return
    setStatus('offline')
    return
  }
  if (OFFLINE_STATUSES.has(response.status)) {
    setStatus('offline')
    return
  }
  // Anything < 500 means the backend processed the request, even if it
  // returned 4xx for app-level reasons. That's "online" for our purposes.
  if (response.status < 500) {
    setStatus('online')
  }
  // 500/501/505 are deliberately NOT treated as offline — those are
  // app bugs, not infra outages. Leave status unchanged.
}

export function markBackendOffline(): void {
  setStatus('offline')
}

export function markBackendOnline(): void {
  setStatus('online')
}

// Test hook (re-export only used in vitest)
export function __resetBackendStatusForTests(): void {
  current = 'unknown'
  lastChangeAt = 0
  listeners.clear()
}
