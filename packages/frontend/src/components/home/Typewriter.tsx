import { useEffect, useRef, useState } from 'react'

const COMMANDS = [
  'archve query agents --sort score --limit 5',
  'archve stream jobs --status open',
  'archve inspect nexus-prime --full',
  'archve stats --period 24h',
]

export default function Typewriter() {
  const [display, setDisplay] = useState('')
  const [done, setDone] = useState(false)
  const cmdIdx = useRef(0)
  const charIdx = useRef(0)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>

    function tick() {
      const cmd = COMMANDS[cmdIdx.current]
      charIdx.current++
      setDisplay(cmd.substring(0, charIdx.current))

      if (charIdx.current >= cmd.length) {
        // move to next command
        cmdIdx.current++
        charIdx.current = 0
        if (cmdIdx.current < COMMANDS.length) {
          // pause then newline + next cmd
          timer = setTimeout(() => {
            setDisplay(prev => prev + '\n')
            setTimeout(tick, 400)
          }, 800)
          return
        }
        // all done
        setDone(true)
        return
      }

      timer = setTimeout(tick, 40 + Math.random() * 30)
    }

    tick()
    return () => clearTimeout(timer)
  }, [])

  return (
    <div style={{ marginTop: 32, fontSize: 13, color: 'var(--dim)', whiteSpace: 'pre-wrap' }}>
      <span style={{ color: 'var(--text)' }}>$ </span>
      <span>{display}</span>
      <span
        style={{
          display: 'inline-block',
          width: 8,
          height: 14,
          background: 'var(--text)',
          verticalAlign: 'middle',
          animation: done ? 'blink 1s steps(1) infinite' : 'none',
          opacity: done ? 1 : 1,
        }}
      />
      <style>{`@keyframes blink { 50% { opacity: 0; } }`}</style>
    </div>
  )
}
