import { useEffect, useRef, useState } from 'react'

interface Props {
  target: number
  duration?: number
}

export default function AnimatedCounter({ target, duration = 800 }: Props) {
  const [display, setDisplay] = useState(target)
  const prevRef = useRef(target)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    const from = prevRef.current
    const to = target
    if (from === to) return

    const startTime = performance.now()
    const diff = to - from

    function animate(ts: number) {
      const elapsed = ts - startTime
      const progress = Math.min(elapsed / duration, 1)
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplay(Math.round(from + diff * eased))

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate)
      } else {
        setDisplay(to)
        prevRef.current = to
      }
    }

    rafRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafRef.current)
  }, [target, duration])

  return <>{display.toLocaleString('en-US')}</>
}
