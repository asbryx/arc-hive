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
  const rafRef = useRef<number>(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const totalChars = ARC_HIVE_ART.join('').replace(/\s/g, '').length

  useEffect(() => {
    const perLine: { total: number; start: number }[] = []
    let cumulative = 0
    for (const line of ARC_HIVE_ART) {
      const lineNonSpace = line.replace(/\s/g, '').length
      perLine.push({ total: lineNonSpace, start: cumulative })
      cumulative += lineNonSpace
    }

    function startReveal() {
      revealedRef.current = 0

      function render() {
        const lines: string[] = []
        for (let i = 0; i < ARC_HIVE_ART.length; i++) {
          const lineRevealed = Math.max(0, Math.min(perLine[i].total, revealedRef.current - perLine[i].start))
          lines.push(getGlitchLine(ARC_HIVE_ART[i], lineRevealed))
        }
        setText('\n' + lines.join('\n') + '\n')

        if (revealedRef.current < totalChars + 20) {
          revealedRef.current += REVEAL_SPEED
          rafRef.current = requestAnimationFrame(render)
        } else {
          setText('\n' + ARC_HIVE_ART.join('\n') + '\n')
          // Done — stay revealed, no loop
        }
      }

      rafRef.current = requestAnimationFrame(render)
    }

    startReveal()

    return () => {
      cancelAnimationFrame(rafRef.current)
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [totalChars])

  return (
    <pre
      aria-hidden="true"
      className="ascii-hero-pre"
      style={{
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
