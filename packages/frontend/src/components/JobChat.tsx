import { useState, useEffect, useRef } from 'react'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

interface Comment {
  id: number
  sender_address: string
  message: string
  created_at: string
}

interface JobChatProps {
  jobId: string | number
  isParticipant: boolean
  userAddress?: string
}

export function JobChat({ jobId, isParticipant, userAddress }: JobChatProps) {
  const [comments, setComments] = useState<Comment[]>([])
  const [newComment, setNewComment] = useState('')
  const [sending, setSending] = useState(false)
  const messagesEnd = useRef<HTMLDivElement>(null)

  const fetchComments = () => {
    fetch(`${API_BASE}/open-jobs/${jobId}/comments`)
      .then(r => r.json())
      .then(data => setComments(data.data || data || []))
      .catch(() => {})
  }

  useEffect(() => {
    fetchComments()
    const interval = setInterval(fetchComments, 5000) // Poll every 5s
    return () => clearInterval(interval)
  }, [jobId])

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: 'smooth' })
  }, [comments])

  const handleSend = async () => {
    if (!newComment.trim() || !userAddress) return
    setSending(true)
    try {
      const res = await fetch(`${API_BASE}/open-jobs/${jobId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senderAddress: userAddress, message: newComment }),
      })
      if (res.ok) {
        setNewComment('')
        fetchComments()
      }
    } finally {
      setSending(false)
    }
  }

  return (
    <div style={{ border: '1px solid var(--dimmer)', marginTop: '2rem' }}>
      <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--dimmer)', color: 'var(--text)', fontSize: '0.85rem' }}>
        💬 COMMUNICATION ({comments.length})
      </div>
      <div style={{ height: '300px', overflowY: 'auto', padding: '1rem' }}>
        {comments.length === 0 && (
          <div style={{ color: 'var(--dim)', textAlign: 'center', padding: '2rem' }}>No messages yet</div>
        )}
        {comments.map(c => (
          <div key={c.id} style={{ marginBottom: '0.75rem' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--dim)' }}>
              {(c as any).senderAddress?.slice(0, 6) || c.sender_address?.slice(0, 6)}...{(c as any).senderAddress?.slice(-4) || c.sender_address?.slice(-4)} · {new Date((c as any).createdAt || c.created_at).toLocaleString()}
            </div>
            <div style={{ color: 'var(--text)', fontSize: '0.85rem', marginTop: '0.15rem' }}>{c.message}</div>
          </div>
        ))}
        <div ref={messagesEnd} />
      </div>
      {isParticipant && (
        <div style={{ display: 'flex', borderTop: '1px solid var(--dimmer)' }}>
          <input
            value={newComment}
            onChange={e => setNewComment(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder="Type a message..."
            style={{ flex: 1, padding: '0.75rem', background: 'transparent', border: 'none', color: 'var(--text)', fontFamily: 'var(--font)', fontSize: '0.85rem' }}
          />
          <button onClick={handleSend} disabled={sending} style={{ padding: '0.75rem 1.5rem', background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'var(--font)' }}>
            {sending ? '...' : '→'}
          </button>
        </div>
      )}
    </div>
  )
}
