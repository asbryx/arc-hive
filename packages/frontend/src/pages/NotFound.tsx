export default function NotFound() {
  return (
    <div className="page-enter" style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '60vh',
      padding: 24,
    }}>
      <pre style={{ fontSize: 12, color: 'var(--dim)', marginBottom: 24, textAlign: 'center' }}>
{`
 ██╗  ██╗ ██████╗ ██╗  ██╗
 ██║  ██║██╔═████╗██║  ██║
 ███████║██║██╔██║███████║
 ╚════██║████╔╝██║╚════██║
      ██║╚██████╔╝     ██║
      ╚═╝ ╚═════╝      ╚═╝
`}
      </pre>
      <div style={{ fontSize: 13, color: 'var(--dim)', marginBottom: 8 }}>
        agent not found
      </div>
      <div style={{ fontSize: 11, color: 'var(--dimmer)' }}>
        the requested resource does not exist in the index
      </div>
    </div>
  )
}
