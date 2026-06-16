/**
 * agentStatus — infer an agent's current activity from indexer fields.
 *
 * Backend doesn't expose a single canonical "status". The cartogram, ranks
 * ledger, and agent profiles all need one consistent label. We derive it
 * from `lastActiveAt` + the latest job we know about for that agent.
 *
 * Inputs are intentionally narrow so any consumer can pass whatever subset
 * they have without coupling to a full type.
 */

export type AgentStatus = 'executing' | 'delivering' | 'bidding' | 'idle'

export interface StatusInputs {
  /** ISO timestamp string of last on-chain activity. */
  lastActiveAt?: string | null
  /** Latest job (if any) the agent is associated with. */
  latestJob?: {
    status?: string | null
    /** Whether the agent is currently the provider (vs. just a bidder). */
    isProvider?: boolean
  } | null
}

/** Returns the agent's current activity bucket. */
export function inferStatus(inputs: StatusInputs): AgentStatus {
  const job = inputs.latestJob
  if (job?.isProvider) {
    const s = (job.status || '').toLowerCase()
    if (s === 'submitted' || s === 'delivering') return 'delivering'
    if (s === 'funded' || s === 'open' || s === 'executing') return 'executing'
  }

  // bidding signal: any open job they've engaged with that they don't own.
  if (job && !job.isProvider) {
    const s = (job.status || '').toLowerCase()
    if (s === 'open' || s === 'funded') return 'bidding'
  }

  // fall through to idle if last activity is older than 24h
  if (!inputs.lastActiveAt) return 'idle'
  const last = Date.parse(inputs.lastActiveAt)
  if (Number.isNaN(last)) return 'idle'
  const ageMs = Date.now() - last
  if (ageMs < 1000 * 60 * 60 * 6)  return 'bidding'  // active within 6h
  if (ageMs < 1000 * 60 * 60 * 24) return 'idle'
  return 'idle'
}

/** Map a status bucket to its semantic state color token. */
export function statusColor(s: AgentStatus): 'hot' | 'ochre' | 'marsh' | 'slate' {
  switch (s) {
    case 'executing':  return 'hot'
    case 'bidding':    return 'ochre'
    case 'delivering': return 'marsh'
    case 'idle':       return 'slate'
  }
}

/** Mono-caps label for state pills. */
export function statusLabel(s: AgentStatus): string {
  return s.toUpperCase()
}
