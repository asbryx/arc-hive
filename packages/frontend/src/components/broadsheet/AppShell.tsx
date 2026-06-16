import type { ReactNode } from 'react'

interface Props {
  children: ReactNode
}

/**
 * Broadsheet shell: full-bleed cream substrate, nav on top, footer on bottom.
 * The center column is full-bleed (max 1600px) and pages own their internal
 * layout. No global maxWidth or centered narrow column — pages decide.
 */
export default function AppShell({ children }: Props) {
  return (
    <main
      id="main-content"
      aria-label="Main content"
      style={{
        flex: 1,
        width: '100%',
        maxWidth: 'var(--max-broadsheet)',
        margin: '0 auto',
        paddingTop: 'var(--nav-height)',
        paddingBottom: 'var(--s-14)',
        position: 'relative',
        zIndex: 1,
      }}
    >
      {children}
    </main>
  )
}
