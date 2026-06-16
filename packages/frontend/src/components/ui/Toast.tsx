import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'

interface ToastItem {
  id: number
  kind: 'info' | 'success' | 'error'
  message: string
}

interface ToastApi {
  show: (message: string, kind?: ToastItem['kind']) => void
}

const Ctx = createContext<ToastApi | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])

  const show = useCallback<ToastApi['show']>((message, kind = 'info') => {
    const id = Date.now() + Math.random()
    setItems(curr => [...curr, { id, kind, message }])
    window.setTimeout(() => {
      setItems(curr => curr.filter(t => t.id !== id))
    }, 5000)
  }, [])

  return (
    <Ctx.Provider value={{ show }}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        style={{
          position: 'fixed',
          right: 16,
          bottom: 56,
          zIndex: 5000,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          pointerEvents: 'none',
        }}
      >
        {items.map(t => (
          <div
            key={t.id}
            style={{
              pointerEvents: 'auto',
              background: 'var(--ink)',
              color: 'var(--cream)',
              padding: '12px 16px',
              borderLeft: `3px solid ${
                t.kind === 'success' ? 'var(--marsh)' :
                t.kind === 'error' ? 'var(--hot)' : 'var(--ochre)'
              }`,
              fontFamily: 'var(--serif)',
              fontSize: 'var(--t-meta)',
              maxWidth: 320,
              minWidth: 240,
            }}
          >
            {t.message}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}

export function useToast() {
  const ctx = useContext(Ctx)
  if (!ctx) {
    // graceful fallback for pages used before provider mounts
    return { show: (m: string) => console.log('[toast]', m) }
  }
  return ctx
}
