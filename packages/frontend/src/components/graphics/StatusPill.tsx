import { STATUS_COLORS } from '@/utils/constants'

interface Props {
  status: string
}

export default function StatusPill({ status }: Props) {
  const color = STATUS_COLORS[status] || 'var(--dim)'

  return (
    <span style={{
      fontSize: 10,
      textTransform: 'uppercase',
      letterSpacing: 1,
      color,
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
    }}>
      <span style={{
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: color,
        opacity: status === 'Completed' || status === 'Expired' ? 0.5 : 1,
      }} />
      {status}
    </span>
  )
}
