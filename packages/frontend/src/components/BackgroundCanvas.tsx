import { useEffect, useRef } from 'react'

function getThemeColors() {
  const theme = document.documentElement.getAttribute('data-theme')
  if (theme === 'light') {
    return { base: 'rgba(0, 0, 0,', arcAlpha: 0.07, dotAlpha: 0.18, glowAlpha: 0.03 }
  }
  return { base: 'rgba(255, 255, 255,', arcAlpha: 0.06, dotAlpha: 0.15, glowAlpha: 0.025 }
}

// Normal positions — arcs orbit around upper-center
const NORMAL_ARCS = [
  { cx: 0.5, cy: 0.38, rx: 0.48, ry: 0.36, rotation: -0.25, speed: 0.0003, offset: 0, parallax: 0.15, width: 1.8 },
  { cx: 0.5, cy: 0.38, rx: 0.42, ry: 0.32, rotation: 0.15, speed: -0.0002, offset: Math.PI * 0.7, parallax: 0.2, width: 1.5 },
  { cx: 0.5, cy: 0.38, rx: 0.32, ry: 0.24, rotation: 0.5, speed: -0.0004, offset: Math.PI * 0.3, parallax: 0.35, width: 2 },
  { cx: 0.5, cy: 0.38, rx: 0.28, ry: 0.2, rotation: -0.6, speed: 0.00035, offset: Math.PI * 1.2, parallax: 0.4, width: 1.2 },
  { cx: 0.5, cy: 0.38, rx: 0.18, ry: 0.14, rotation: 0.8, speed: 0.0005, offset: Math.PI * 0.6, parallax: 0.5, width: 2.2 },
  { cx: 0.5, cy: 0.38, rx: 0.14, ry: 0.1, rotation: -1.0, speed: -0.0006, offset: Math.PI * 1.8, parallax: 0.55, width: 1 },
]

// Cleared positions — arcs pushed to perimeter, form area clear
const CLEARED_ARCS = [
  { cx: 0.5, cy: 0.85, rx: 0.58, ry: 0.42, rotation: -0.25, speed: 0.0003, offset: 0, parallax: 0.15, width: 1.8 },
  { cx: 0.5, cy: 0.85, rx: 0.52, ry: 0.38, rotation: 0.15, speed: -0.0002, offset: Math.PI * 0.7, parallax: 0.2, width: 1.5 },
  { cx: 0.5, cy: 0.85, rx: 0.42, ry: 0.30, rotation: 0.5, speed: -0.0004, offset: Math.PI * 0.3, parallax: 0.35, width: 2 },
  { cx: 0.5, cy: 0.85, rx: 0.38, ry: 0.26, rotation: -0.6, speed: 0.00035, offset: Math.PI * 1.2, parallax: 0.4, width: 1.2 },
  { cx: 0.5, cy: 0.85, rx: 0.28, ry: 0.20, rotation: 0.8, speed: 0.0005, offset: Math.PI * 0.6, parallax: 0.5, width: 2.2 },
  { cx: 0.5, cy: 0.85, rx: 0.22, ry: 0.16, rotation: -1.0, speed: -0.0006, offset: Math.PI * 1.8, parallax: 0.55, width: 1 },
]

const ALL_SWEEPS = [1.35, 1.4, 1.3, 1.45, 1.25, 1.5]

// Mobile: pick 3 representative arcs
const MOBILE_INDICES = [0, 2, 4]

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

export default function BackgroundCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const scrollRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animId: number
    let width = window.innerWidth
    let height = window.innerHeight
    const mobile = width <= 768

    canvas.width = width
    canvas.height = height

    const baseArcs = mobile ? MOBILE_INDICES.map(i => NORMAL_ARCS[i]) : NORMAL_ARCS
    const clearedTargets = mobile ? MOBILE_INDICES.map(i => CLEARED_ARCS[i]) : CLEARED_ARCS
    const sweeps = mobile ? MOBILE_INDICES.map(i => ALL_SWEEPS[i]) : ALL_SWEEPS

    // Current animated state (starts at normal)
    const current = baseArcs.map(a => ({ ...a }))

    let time = 0
    let cleared = false
    let progress = 0 // 0 = normal, 1 = cleared

    // Listen for clear/restore signals from pages
    const handleClear = () => { cleared = true }
    const handleRestore = () => { cleared = false }
    window.addEventListener('arcs:clear', handleClear)
    window.addEventListener('arcs:restore', handleRestore)

    const handleScroll = () => {
      scrollRef.current = window.scrollY
    }
    window.addEventListener('scroll', handleScroll, { passive: true })

    let colors = getThemeColors()
    const observer = new MutationObserver(() => {
      colors = getThemeColors()
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

    function draw() {
      ctx!.clearRect(0, 0, width, height)
      time++

      // Lerp progress toward target
      const target = cleared ? 1 : 0
      const speed = 0.04 // ~25 frames to settle (~0.4s at 60fps)
      if (Math.abs(progress - target) > 0.001) {
        progress = lerp(progress, target, speed)
      } else {
        progress = target
      }

      // Ease curve (ease-out)
      const t = 1 - Math.pow(1 - progress, 3)

      const scroll = scrollRef.current

      for (let i = 0; i < baseArcs.length; i++) {
        const normal = baseArcs[i]
        const clearedArc = clearedTargets[i]
        const sweep = sweeps[i]

        // Interpolate all properties
        const cx = lerp(normal.cx, clearedArc.cx, t) * width
        const cy = lerp(normal.cy, clearedArc.cy, t) * height
        const rx = lerp(normal.rx, clearedArc.rx, t) * width
        const ry = lerp(normal.ry, clearedArc.ry, t) * height

        const currentRotation = normal.rotation + time * normal.speed + normal.offset
        const yOffset = -scroll * normal.parallax

        ctx!.save()
        ctx!.translate(cx, cy + yOffset)
        ctx!.rotate(currentRotation)

        // Glow trail — skip on mobile for perf
        if (!mobile) {
          ctx!.beginPath()
          ctx!.ellipse(0, 0, rx, ry, 0, 0, Math.PI * sweep)
          ctx!.strokeStyle = `${colors.base} ${colors.glowAlpha})`
          ctx!.lineWidth = normal.width + 8
          ctx!.lineCap = 'round'
          ctx!.stroke()
        }

        // Main arc
        ctx!.beginPath()
        ctx!.ellipse(0, 0, rx, ry, 0, 0, Math.PI * sweep)
        ctx!.strokeStyle = `${colors.base} ${colors.arcAlpha})`
        ctx!.lineWidth = mobile ? normal.width * 0.8 : normal.width
        ctx!.lineCap = 'round'
        ctx!.stroke()

        // Dot at end of arc
        const endAngle = Math.PI * sweep
        const dotX = rx * Math.cos(endAngle)
        const dotY = ry * Math.sin(endAngle)
        const dotR = mobile ? 2 : 3
        ctx!.beginPath()
        ctx!.arc(dotX, dotY, dotR, 0, Math.PI * 2)
        ctx!.fillStyle = `${colors.base} ${colors.dotAlpha})`
        ctx!.fill()

        // Faint dot at start — skip on mobile
        if (!mobile) {
          ctx!.beginPath()
          ctx!.arc(rx, 0, 2, 0, Math.PI * 2)
          ctx!.fillStyle = `${colors.base} ${colors.dotAlpha * 0.5})`
          ctx!.fill()
        }

        ctx!.restore()
      }

      animId = requestAnimationFrame(draw)
    }

    draw()

    const handleResize = () => {
      width = window.innerWidth
      height = window.innerHeight
      canvas.width = width
      canvas.height = height
    }

    window.addEventListener('resize', handleResize)

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('arcs:clear', handleClear)
      window.removeEventListener('arcs:restore', handleRestore)
      observer.disconnect()
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    />
  )
}
