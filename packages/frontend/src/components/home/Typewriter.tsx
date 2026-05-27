import { useEffect, useRef, useState } from 'react'

const COMMANDS = [
  'archve query agents --sort score --limit 5',
  'archve stream jobs --status open',
  'archve inspect nexus-prime --full',
  'archve stats --period 24h',
]

export default function Typewriter() {
  const [display, setDisplay] = useState('')
  const cmdIdx = useRef(0)
  const charIdx = useRef(0)
  const deleting = useRef(false)
  const pause = useRef(0)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>

    function tick() {
      const cmd = COMMANDS[cmdIdx.current]

      if (pause.current > 0) {
        pause.current--
        timer = setTimeout(tick, 60)
        return
      }

      if (!deleting.current) {
        charIdx.current++
        setDisplay(cmd.substring(0, charIdx.current))
        if (charIdx.current >= cmd.length) {
          deleting.current = true
          pause.current = 30
        }
      } else {
        charIdx.current--
        setDisplay(cmd.substring(0, charIdx.current))
        if (charIdx.current <= 0) {
          deleting.current = false
          cmdIdx.current = (cmdIdx.current + 1) % COMMANDS.length
          pause.current = 10
        }
      }

      timer = setTimeout(tick, deleting.current ? 25 : 65)
    }

    tick()
    return () => clearTimeout(timer)
  }, [])

  return (
    <div style={{ marginTop: 32, fontSize: 13, color: 'var(--dim)' }}>
      <span style={{ color: 'var(--text)' }}>$ </span>
      <span>{display}</span>
      <span
        style={{
          display: 'inline-block',
          width: 8,
          height: 14,
          background: 'var(--text)',
          verticalAlign: 'middle',
          animation: 'blink 1s steps(1) infinite',
        }}
      />
      <style>{`@keyframes blink { 50% { opacity: 0; } }`}</style>
    </div>
  )
}
