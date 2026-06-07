import { Link } from 'react-router-dom'

interface EmptyStateProps {
  title: string
  description?: string
  action?: { label: string; to: string }
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '4rem 2rem',
      textAlign: 'center',
      color: '#666',
      fontFamily: 'JetBrains Mono, monospace',
    }}>
      <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.3 }}>∅</div>
      <h3 style={{ color: '#999', marginBottom: '0.5rem' }}>{title}</h3>
      {description && <p style={{ maxWidth: '400px', lineHeight: 1.6 }}>{description}</p>}
      {action && (
        <Link to={action.to} style={{
          marginTop: '1.5rem',
          padding: '0.5rem 1.5rem',
          background: '#273F4F',
          color: 'white',
          textDecoration: 'none',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: '0.85rem',
        }}>
          {action.label}
        </Link>
      )}
    </div>
  )
}
