import React, { useEffect, useRef, useState } from 'react'

const ARC_HIVE_ART = [
  '  █████╗ ██████╗  ██████╗██╗  ██╗██╗██╗   ██╗███████╗',
  ' ██╔══██╗██╔══██╗██╔════╝██║  ██║██║██║   ██║██╔════╝',
  ' ███████║██████╔╝██║     ███████║██║██║   ██║█████╗  ',
  ' ██╔══██║██╔══██╗██║     ██╔══██║██║╚██╗ ██╔╝██╔══╝  ',
  ' ██║  ██║██║  ██║╚██████╗██║  ██║██║ ╚████╔╝ ███████╗',
  ' ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝╚═╝  ╚═══╝  ╚══════╝',
]

// Column ranges for A and H in the ASCII art
// Verified from line 4: A=1-8, R=9-16, C=17-24, H=25-32, I=33-35, V=37-43, E=45-52
const ACCENT_COLS = new Set<number>()
for (let i = 1; i <= 8; i++) ACCENT_COLS.add(i)
for (let i = 25; i <= 32; i++) ACCENT_COLS.add(i)

function renderColoredLine(line: string, key: number): React.ReactNode {
  const segments: React.ReactNode[] = []
  let seg = ''
  let segAccent = false
  let segStart = 0

  for (let i = 0; i < line.length; i++) {
    const isAccent = ACCENT_COLS.has(i) && line[i] !== ' '
    if (i === 0) {
      segAccent = isAccent
      seg = line[i]
      continue
    }
    if (isAccent === segAccent) {
      seg += line[i]
    } else {
      segments.push(
        segAccent
          ? <span key={segStart} style={{ color: 'var(--accent)' }}>{seg}</span>
          : <span key={segStart}>{seg}</span>
      )
      seg = line[i]
      segAccent = isAccent
      segStart = i
    }
  }
  if (seg) {
    segments.push(
      segAccent
        ? <span key={segStart} style={{ color: 'var(--accent)' }}>{seg}</span>
        : <span key={segStart}>{seg}</span>
    )
  }
  return <div key={key}>{segments}</div>
}

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
  const [content, setContent] = useState<React.ReactNode>(null)
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
        setContent('\n' + lines.join('\n') + '\n')

        if (revealedRef.current < totalChars + 20) {
          revealedRef.current += REVEAL_SPEED
          rafRef.current = requestAnimationFrame(render)
        } else {
          // Fully revealed — render with accent colors on A and H
          setContent(
            <>
              {'\n'}
              {ARC_HIVE_ART.map((line, i) => renderColoredLine(line, i))}
              {'\n'}
            </>
          )
          // Wait 3s then loop
          timerRef.current = setTimeout(startReveal, 3000)
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
      style={{
        fontSize: 14,
        lineHeight: 1.4,
        textAlign: 'center',
        marginBottom: 24,
        whiteSpace: 'pre',
        color: 'var(--text)',
      }}
    >
      {content}
    </pre>
  )
}
