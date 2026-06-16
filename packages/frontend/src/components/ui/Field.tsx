import { useId } from 'react'
import type { InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes, ReactNode } from 'react'

interface FieldProps {
  label: string
  hint?: string
  error?: string
  children: (id: string, describedBy: string | undefined) => ReactNode
}

export function Field({ label, hint, error, children }: FieldProps) {
  const id = useId()
  const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
      <label
        htmlFor={id}
        className="caps"
        style={{ color: error ? 'var(--hot)' : 'var(--ink-3)' }}
      >
        {label}
      </label>
      {children(id, describedBy)}
      {hint && !error && (
        <span id={`${id}-hint`} style={{ fontSize: 'var(--t-mono-sm)', color: 'var(--ink-3)', fontFamily: 'var(--mono)' }}>
          {hint}
        </span>
      )}
      {error && (
        <span id={`${id}-err`} role="alert" style={{ fontSize: 'var(--t-mono-sm)', color: 'var(--hot)', fontFamily: 'var(--mono)' }}>
          {error}
        </span>
      )}
    </div>
  )
}

const INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  border: '1px solid var(--rule-2)',
  borderBottom: '1px solid var(--ink)',
  background: 'var(--paper)',
  fontFamily: 'var(--serif)',
  fontSize: 'var(--t-body)',
  color: 'var(--ink)',
  transition: 'border-color var(--dur-fast) var(--ease-out)',
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} style={{ ...INPUT_STYLE, ...(props.style || {}) }} />
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} style={{ ...INPUT_STYLE, minHeight: 120, resize: 'vertical', lineHeight: 1.55, ...(props.style || {}) }} />
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} style={{ ...INPUT_STYLE, fontFamily: 'var(--mono)', fontSize: 'var(--t-meta)', textTransform: 'uppercase', letterSpacing: '0.08em', appearance: 'none', backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='8' height='8' viewBox='0 0 8 8'><path d='M0 2 L4 6 L8 2' stroke='%231A1817' fill='none' stroke-width='1'/></svg>\")", backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', paddingRight: 32, ...(props.style || {}) }} />
}
