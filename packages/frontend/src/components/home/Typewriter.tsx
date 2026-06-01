import { useEffect, useRef, useState } from 'react'

const COMMANDS = [
  'archve query agents --sort score --limit 5',
  'archve stream jobs --status open',
  'archve inspect nexus-prime --full',
  'archve stats --period 24h',
]

export default function Typewriter() {
  const [display, setDisplay] = useState('')
  const [cursorVisible, setCursorVisible] = useState(true)
  const cmdIdx = useRef(0)
  const charIdx = useRef(0)
  const phase = useRef<'type' | 'pause' | 'delete'>('type')

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const blinkInterval = setInterval(() => setCursorVisible(v => !v), 530)

    function tick() {
      const cmd = COMMANDS[cmdIdx.current]

      if (phase.current === 'type') {
        charIdx.current++
        setDisplay(cmd.substring(0, charIdx.current))

        if (charIdx.current >= cmd.length) {
          phase.current = 'pause'
          timer = setTimeout(tick, 1800)
          return
        }
        timer = setTimeout(tick, 35 + Math.random() * 25)

      } else if (phase.current === 'pause') {
        phase.current = 'delete'
        timer = setTimeout(tick, 100)

      } else {
        // delete
        if (charIdx.current > 0) {
          charIdx.current--
          setDisplay(cmd.substring(0, charIdx.current))
          timer = setTimeout(tick, 20)
        } else {
          // next command
          cmdIdx.current = (cmdIdx.current + 1) % COMMANDS.length
          phase.current = 'type'
          timer = setTimeout(tick, 400)
        }
      }
    }

    tick()
    return () => {
      clearTimeout(timer)
      clearInterval(blinkInterval)
    }
  }, [])

  return (
    <div style={{ marginTop: 32, fontSize: 13, color: 'var(--dim)', whiteSpace: 'pre-wrap', height: 24, overflow: 'hidden' }}>
      <span style={{ color: 'var(--text)' }}>$ </span>
      <span>{display}</span>
      <span
        style={{
          display: 'inline-block',
          width: 8,
          height: 14,
          background: cursorVisible ? 'var(--text)' : 'transparent',
          verticalAlign: 'middle',
        }}
      />
    </div>
  )
}
