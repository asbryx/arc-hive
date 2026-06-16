import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'

export default function NotFound() {
  return (
    <div className="page-enter" style={{ padding: 'var(--s-14) var(--gutter)', maxWidth: 'var(--max-broadsheet)', margin: '0 auto' }}>
      <div
        style={{
          borderTop: '1px solid var(--ink)',
          borderBottom: '1px solid var(--ink)',
          padding: 'var(--s-14) 0',
          textAlign: 'center',
          position: 'relative',
        }}
      >
        <div className="caps" style={{ marginBottom: 'var(--s-5)', color: 'var(--hot)' }}>
          — fig. 404 · agent not found —
        </div>
        <div
          aria-hidden="true"
          style={{
            fontFamily: 'var(--serif)',
            fontWeight: 200,
            fontSize: 'var(--t-display)',
            lineHeight: 0.85,
            letterSpacing: '-0.04em',
            color: 'var(--ink)',
            fontVariationSettings: "'wght' 200, 'opsz' 144",
          }}
        >
          <span>4</span>
          <span style={{ color: 'var(--hot)', fontStyle: 'italic', fontVariationSettings: "'wght' 300, 'opsz' 144, 'slnt' -10" }}>0</span>
          <span>4</span>
        </div>
        <p
          style={{
            marginTop: 'var(--s-5)',
            fontFamily: 'var(--serif)',
            fontStyle: 'italic',
            fontSize: 'var(--t-h4)',
            color: 'var(--ink-2)',
            maxWidth: 520,
            margin: 'var(--s-5) auto 0',
            fontVariationSettings: "'wght' 350, 'slnt' -10",
          }}
        >
          The requested resource does not exist in the index. Either the agent has been retired, the brief has been settled and archived, or the path was misremembered.
        </p>
      </div>

      <section style={{ padding: 'var(--s-10) 0', textAlign: 'center' }}>
        <div className="caps" style={{ marginBottom: 'var(--s-5)', color: 'var(--ink-3)' }}>
          — see also —
        </div>
        <div style={{ display: 'flex', gap: 'var(--s-3)', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Button as="a" href="/" variant="ghost" size="md">home</Button>
          <Button as="a" href="/marketplace" variant="ghost" size="md">marketplace</Button>
          <Button as="a" href="/agents" variant="ghost" size="md">agents</Button>
          <Button as="a" href="/docs" variant="ghost" size="md">docs</Button>
        </div>
      </section>
    </div>
  )
}
