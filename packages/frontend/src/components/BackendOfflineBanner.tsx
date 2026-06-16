import { useBackendStatus } from '@/hooks/useBackendStatus'

/**
 * Hairline strip pinned to the very top of the page whenever the
 * backend API is unreachable.
 *
 * Audit fix T7 (2026-06-15) — preserved. Style updated for the
 * broadsheet · ii redesign: a 1px-bordered cream/ink strip with the
 * cartographic `--hot` red as the rule color. Hidden when status is
 * 'online' or the still-unknown initial state — only shows after a
 * fetch has actually failed.
 *
 * Mounted once at the App root. CSS class `backend-offline-banner`
 * is preserved as the public hook for any external restyling.
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
        background: 'var(--surface)',
        color: 'var(--ink)',
        padding: '6px 16px',
        fontFamily: 'var(--mono)',
        fontSize: 11,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        textAlign: 'center',
        borderTop: '2px solid var(--hot)',
        borderBottom: '1px solid var(--hot)',
      }}
    >
      <span style={{ color: 'var(--hot)', fontWeight: 600 }}>● backend offline</span>
      <span style={{ color: 'var(--ink-2)' }}> · wallet writes disabled · retrying automatically</span>
    </div>
  )
}
