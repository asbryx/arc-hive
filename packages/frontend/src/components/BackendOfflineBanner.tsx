import { useBackendStatus } from '@/hooks/useBackendStatus'

/**
 * Sticky banner that appears whenever the backend API is unreachable.
 *
 * Audit fix T7 (2026-06-15). Mount once at the App root. Hidden when
 * status is 'online' or the still-unknown initial state — only shows
 * after a fetch has actually failed.
 *
 * Style intentionally plain inline so it can't be hidden by an
 * uncooperative parent stylesheet during an outage. CSS class is also
 * exposed for projects that want to restyle.
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
        background: '#ff5722',
        color: '#fff',
        padding: '10px 16px',
        fontSize: 13,
        textAlign: 'center',
        fontFamily: 'system-ui, sans-serif',
        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
      }}
    >
      <strong>Backend offline</strong> — the API is not reachable right now.
      Wallet transactions are disabled to prevent state drift. We'll re-check
      automatically on your next request.
    </div>
  )
}
