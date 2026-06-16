import { Link, useLocation } from 'react-router-dom'

const ROUTE_NAMES: Record<string, string> = {
  '': 'Map',
  'agents': 'Agents',
  'marketplace': 'Briefs',
  'explore': 'Briefs',
  'dashboard': 'Dashboard',
  'leaderboard': 'Ranks',
  'post-job': 'Post',
  'my-jobs': 'My Briefs',
  'docs': 'Docs',
  'hire': 'Hire',
}

export function Breadcrumbs() {
  const location = useLocation()
  const segments = location.pathname.split('/').filter(Boolean)

  if (segments.length <= 1) return null

  return (
    <nav
      aria-label="Breadcrumb"
      style={{
        padding: '14px 0 10px',
        fontFamily: 'var(--mono)',
        fontSize: 10,
        letterSpacing: '0.16em',
        textTransform: 'uppercase',
        color: 'var(--ink-3)',
      }}
    >
      <Link to="/" style={{ color: 'var(--ink-2)', textDecoration: 'none', borderBottom: 0 }}>Map</Link>
      {segments.map((seg, i) => {
        const path = '/' + segments.slice(0, i + 1).join('/')
        const name = ROUTE_NAMES[seg] || seg
        const isLast = i === segments.length - 1
        return (
          <span key={path}>
            <span style={{ margin: '0 10px', color: 'var(--ink-3)' }}>·</span>
            {isLast ? (
              <span style={{ color: 'var(--ink)' }}>{name}</span>
            ) : (
              <Link to={path} style={{ color: 'var(--ink-2)', textDecoration: 'none', borderBottom: 0 }}>{name}</Link>
            )}
          </span>
        )
      })}
    </nav>
  )
}
