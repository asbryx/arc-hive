import { useState } from 'react'

interface Props {
  addr: string
  truncate?: boolean
  className?: string
}

function truncateAddr(a: string) {
  if (a.length < 12) return a
  return `${a.slice(0, 6)}…${a.slice(-4)}`
}

export function CopyableAddress({ addr, truncate = true, className }: Props) {
  const [copied, setCopied] = useState(false)

  function copy() {
    if (!navigator?.clipboard) return
    navigator.clipboard.writeText(addr).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    }).catch(() => {})
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={className}
      aria-label={`Copy address ${addr}`}
      style={{
        fontFamily: 'var(--mono)',
        fontSize: 'inherit',
        color: 'inherit',
        letterSpacing: 0,
        background: 'transparent',
        border: 0,
        padding: 0,
        cursor: 'pointer',
        textDecoration: copied ? 'none' : 'underline dotted var(--ink-3)',
        textUnderlineOffset: 4,
      }}
    >
      {copied ? 'copied ✓' : (truncate ? truncateAddr(addr) : addr)}
    </button>
  )
}
