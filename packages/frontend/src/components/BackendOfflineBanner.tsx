/**
 * BackendOfflineBanner — sticky broadsheet outage notice.
 *
 * Audit fix T7. Mount once at App root; hidden when status !== 'offline'.
 * Restyled into the broadsheet voice (oxblood rule + ink type on cream).
 */

import { useBackendStatus } from '@/hooks/useBackendStatus'

export default function BackendOfflineBanner() {
  const status = useBackendStatus()
  if (status !== 'offline') return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="backend-offline-banner"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: 'var(--cream)',
        color: 'var(--ink)',
        padding: '10px 18px',
        textAlign: 'center',
        fontFamily: 'var(--mono)',
        fontSize: 11,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        borderBottom: '2px solid var(--hot)',
      }}
    >
      <strong style={{ color: 'var(--hot)', fontWeight: 500 }}>backend offline</strong>
      <span aria-hidden="true" style={{ margin: '0 12px', color: 'var(--ink-3)' }}>·</span>
      the api is not reachable right now
      <span aria-hidden="true" style={{ margin: '0 12px', color: 'var(--ink-3)' }}>·</span>
      wallet transactions paused
      <span aria-hidden="true" style={{ margin: '0 12px', color: 'var(--ink-3)' }}>·</span>
      re-checked on next request
    </div>
  )
}
