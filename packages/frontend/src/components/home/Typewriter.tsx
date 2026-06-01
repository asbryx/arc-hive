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
  const phaseRef = useRef<'type' | 'pause' | 'delete'>('type')
  const cmdIdx = useRef(0)
  const charIdx = useRef(0)
  const allText = useRef('')

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>

    // cursor blink
    const blinkInterval = setInterval(() => {
      setCursorVisible(v => !v)
    }, 530)

    function tick() {
      if (phaseRef.current === 'type') {
        const cmd = COMMANDS[cmdIdx.current]
        charIdx.current++
        allText.current = allText.current + cmd[charIdx.current - 1]
        setDisplay(allText.current)

        if (charIdx.current >= cmd.length) {
          cmdIdx.current++
          charIdx.current = 0
          if (cmdIdx.current < COMMANDS.length) {
            // pause between commands, then newline
            timer = setTimeout(() => {
              allText.current += '\n'
              setDisplay(allText.current)
              timer = setTimeout(tick, 300)
            }, 600)
            return
          }
          // all commands typed — pause then delete
          phaseRef.current = 'pause'
          timer = setTimeout(tick, 2000)
          return
        }
        timer = setTimeout(tick, 35 + Math.random() * 25)
      } else if (phaseRef.current === 'pause') {
        phaseRef.current = 'delete'
        timer = setTimeout(tick, 100)
      } else {
        // delete chars
        if (allText.current.length > 0) {
          allText.current = allText.current.slice(0, -1)
          setDisplay(allText.current)
          timer = setTimeout(tick, 15)
        } else {
          // reset and loop
          cmdIdx.current = 0
          charIdx.current = 0
          phaseRef.current = 'type'
          timer = setTimeout(tick, 500)
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
    <div style={{ marginTop: 32, fontSize: 13, color: 'var(--dim)', whiteSpace: 'pre-wrap', height: 90, overflow: 'hidden' }}>
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
