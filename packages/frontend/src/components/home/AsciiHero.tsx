import { useEffect, useRef, useState } from 'react'

const ARC_HIVE_ART = [
  '  █████╗ ██████╗  ██████╗██╗  ██╗██╗██╗   ██╗███████╗',
  ' ██╔══██╗██╔══██╗██╔════╝██║  ██║██║██║   ██║██╔════╝',
  ' ███████║██████╔╝██║     ███████║██║██║   ██║█████╗  ',
  ' ██╔══██║██╔══██╗██║     ██╔══██║██║╚██╗ ██╔╝██╔══╝  ',
  ' ██║  ██║██║  ██║╚██████╗██║  ██║██║ ╚████╔╝ ███████╗',
  ' ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝╚═╝  ╚═══╝  ╚══════╝',
]

const GLITCH_CHARS = '~!@#$%^&*()_+-=[]{}|;:<>?/0123456789abcdef'
const REVEAL_SPEED = 3

function getGlitchLine(line: string, revealCount: number): string {
  let result = ''
  let nonSpaceIdx = 0
  for (let i = 0; i < line.length; i++) {
    if (line[i] === ' ') {
      result += ' '
    } else {
      if (nonSpaceIdx < revealCount) {
        result += line[i]
      } else if (nonSpaceIdx < revealCount + 8) {
        result += GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)]
      } else {
        result += ' '
      }
      nonSpaceIdx++
    }
  }
  return result
}

export default function AsciiHero() {
  const [text, setText] = useState('')
  const revealedRef = useRef(0)
  const doneRef = useRef(false)

  const totalChars = ARC_HIVE_ART.join('').replace(/\s/g, '').length

  useEffect(() => {
    let raf: number

    const perLine: { total: number; start: number }[] = []
    let cumulative = 0
    for (const line of ARC_HIVE_ART) {
      const lineNonSpace = line.replace(/\s/g, '').length
      perLine.push({ total: lineNonSpace, start: cumulative })
      cumulative += lineNonSpace
    }

    function render() {
      const lines: string[] = []
      for (let i = 0; i < ARC_HIVE_ART.length; i++) {
        const lineRevealed = Math.max(0, Math.min(perLine[i].total, revealedRef.current - perLine[i].start))
        lines.push(getGlitchLine(ARC_HIVE_ART[i], lineRevealed))
      }
      setText('\n' + lines.join('\n') + '\n')

      if (revealedRef.current < totalChars + 20) {
        revealedRef.current += REVEAL_SPEED
        raf = requestAnimationFrame(render)
      } else {
        doneRef.current = true
        setText('\n' + ARC_HIVE_ART.join('\n') + '\n')
      }
    }

    raf = requestAnimationFrame(render)
    return () => cancelAnimationFrame(raf)
  }, [totalChars])

  // Idle glitch
  useEffect(() => {
    if (!doneRef.current) return
    const interval = setInterval(() => {
      const lines = [...ARC_HIVE_ART]
      const positions: [number, number][] = []
      for (let l = 0; l < lines.length; l++) {
        for (let c = 0; c < lines[l].length; c++) {
          if (lines[l][c] !== ' ') positions.push([l, c])
        }
      }
      const numGlitches = 10 + Math.floor(Math.random() * 6)
      for (let g = 0; g < numGlitches; g++) {
        const p = positions[Math.floor(Math.random() * positions.length)]
        const line = lines[p[0]]
        lines[p[0]] = line.substring(0, p[1]) +
          GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)] +
          line.substring(p[1] + 1)
      }
      setText('\n' + lines.join('\n') + '\n')
      setTimeout(() => {
        setText('\n' + ARC_HIVE_ART.join('\n') + '\n')
      }, 120)
    }, 3000)
    return () => clearInterval(interval)
  }, [text])

  return (
    <pre
      aria-hidden="true"
      style={{
        fontSize: 14,
        lineHeight: 1.4,
        textAlign: 'center',
        marginBottom: 24,
        whiteSpace: 'pre',
        color: 'var(--text)',
      }}
    >
      {text}
    </pre>
  )
}
