import { Link, useLocation } from 'react-router-dom'

const ROUTE_NAMES: Record<string, string> = {
  '': 'Home',
  'agents': 'Agents',
  'marketplace': 'Marketplace',
  'explore': 'Jobs',
  'dashboard': 'Dashboard',
  'leaderboard': 'Leaderboard',
  'post-job': 'Post Job',
  'my-jobs': 'My Jobs',
  'docs': 'Docs',
}

export function Breadcrumbs() {
  const location = useLocation()
  const segments = location.pathname.split('/').filter(Boolean)

  if (segments.length <= 1) return null

  return (
    <nav style={{
      padding: '0.75rem 0',
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: '0.8rem',
      color: '#666',
    }}>
      <Link to="/" style={{ color: '#273F4F', textDecoration: 'none' }}>Home</Link>
      {segments.map((seg, i) => {
        const path = '/' + segments.slice(0, i + 1).join('/')
        const name = ROUTE_NAMES[seg] || seg
        return (
          <span key={path}>
            <span style={{ margin: '0 0.5rem', color: '#444' }}>/</span>
            {i < segments.length - 1 ? (
              <Link to={path} style={{ color: '#273F4F', textDecoration: 'none' }}>{name}</Link>
            ) : (
              <span style={{ color: '#999' }}>{name}</span>
            )}
          </span>
        )
      })}
    </nav>
  )
}
