import { useBackendStatus } from '@/hooks/useBackendStatus'

/**
 * Sticky banner that appears whenever the backend API is unreachable.
 *
 * Audit fix T7 (2026-06-15). Mount once at the App root. Hidden when
 * status is 'online' or the still-unknown initial state — only shows
 * after a fetch has actually failed.
 *
 * Behaviour preserved verbatim. Only visual treatment changed for
 * the broadsheet redesign.
 */
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
        background: 'var(--hot)',
        color: 'var(--cream)',
        padding: '10px 16px',
        fontFamily: 'var(--mono)',
        fontSize: 'var(--t-mono-sm)',
        letterSpacing: '0.10em',
        textTransform: 'uppercase',
        textAlign: 'center',
        borderBottom: '1px solid var(--ink)',
      }}
    >
      <strong style={{ fontWeight: 500 }}>backend offline</strong>
      <span style={{ margin: '0 12px', opacity: 0.65 }}>·</span>
      <span style={{ textTransform: 'none', letterSpacing: 0, fontFamily: 'var(--serif)', fontStyle: 'italic' }}>
        the API is not reachable. Wallet transactions are disabled to prevent state drift; we'll re-check on your next request.
      </span>
    </div>
  )
}
