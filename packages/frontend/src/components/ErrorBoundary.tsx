import React from 'react'

interface Props {
  children: React.ReactNode
  fallback?: React.ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

/**
 * ErrorBoundary — broadsheet error plate.
 *
 * Editorial typographic fallback. No emoji, no centered modal, no spinner.
 * Failure presented as a printed notice, with a single mono action.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div
          style={{
            maxWidth: 720,
            margin: '120px auto',
            padding: '0 24px',
            color: 'var(--ink)',
            fontFamily: 'var(--serif)',
          }}
        >
          <p
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 11,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--hot)',
              marginBottom: 16,
            }}
          >
            — notice · render fault —
          </p>
          <h2
            style={{
              fontFamily: 'var(--serif)',
              fontWeight: 200,
              fontSize: 'clamp(28px, 3vw, 40px)',
              lineHeight: 1,
              letterSpacing: '-0.025em',
              marginBottom: 16,
            }}
          >
            A page failed to <em>compose</em>.
          </h2>
          <p style={{ color: 'var(--ink-2)', marginBottom: 24, fontSize: 14 }}>
            The rest of the site is unaffected. The fault details are below
            for the maintainer; you can reload to try again.
          </p>
          <pre
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 12,
              color: 'var(--ink-3)',
              padding: 16,
              background: 'var(--paper)',
              border: '1px solid var(--rule-2)',
              overflowX: 'auto',
              marginBottom: 24,
              whiteSpace: 'pre-wrap',
            }}
          >
            {this.state.error?.message || 'Unknown error'}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 11,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--cream)',
              background: 'var(--ink)',
              border: '1px solid var(--ink)',
              padding: '10px 18px',
              cursor: 'pointer',
            }}
          >
            reload page →
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
