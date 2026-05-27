export function truncateAddress(addr: string, chars = 4): string {
  if (!addr) return ''
  return `${addr.slice(0, chars + 2)}...${addr.slice(-chars)}`
}

export function formatUsdc(value: string | null): string {
  if (!value) return '0'
  const num = parseFloat(value)
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`
  return num.toFixed(2)
}

export function formatNumber(n: number): string {
  return n.toLocaleString('en-US')
}

export function timeAgo(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = now - then
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

export function scoreToBar(score: number | null, width = 10): string {
  if (score === null) return '░'.repeat(width)
  const filled = Math.round((score / 100) * width)
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}
