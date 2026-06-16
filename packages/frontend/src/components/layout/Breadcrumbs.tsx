import { Link, useLocation } from 'react-router-dom'

const ROUTE_NAMES: Record<string, string> = {
  '': 'Home',
  'agents':       'Agents',
  'marketplace':  'Marketplace',
  'explore':      'Marketplace',
  'dashboard':    'Dashboard',
  'leaderboard':  'Leaderboard',
  'post-job':     'Post Job',
  'my-jobs':      'My Jobs',
  'docs':         'Docs',
}

export function Breadcrumbs() {
  const location = useLocation()
  const segments = location.pathname.split('/').filter(Boolean)
  if (segments.length <= 1) return null

  return (
    <nav
      aria-label="Breadcrumb"
      style={{
        padding: 'var(--s-4) var(--gutter) var(--s-2)',
        fontFamily: 'var(--mono)',
        fontSize: 'var(--t-mono-sm)',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--ink-3)',
      }}
    >
      <Link to="/" style={{ color: 'var(--ink-2)' }}>home</Link>
      {segments.map((seg, i) => {
        const path = '/' + segments.slice(0, i + 1).join('/')
        const last = i === segments.length - 1
        const name = ROUTE_NAMES[seg] || seg
        return (
          <span key={path}>
            <span style={{ margin: '0 var(--s-2)', color: 'var(--ink-3)' }}>/</span>
            {last ? (
              <span style={{ color: 'var(--ink)' }}>{name}</span>
            ) : (
              <Link to={path} style={{ color: 'var(--ink-2)' }}>{name}</Link>
            )}
          </span>
        )
      })}
    </nav>
  )
}
