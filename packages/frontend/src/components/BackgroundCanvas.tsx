import { useEffect, useRef } from 'react'

function getThemeColors() {
  const theme = document.documentElement.getAttribute('data-theme')
  if (theme === 'light') {
    return { base: 'rgba(0, 0, 0,', arcAlpha: 0.07, dotAlpha: 0.18, glowAlpha: 0.03 }
  }
  return { base: 'rgba(255, 255, 255,', arcAlpha: 0.06, dotAlpha: 0.15, glowAlpha: 0.025 }
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

    canvas.width = width
    canvas.height = height

    const arcs = [
      // Large outer arcs
      { cx: 0.5, cy: 0.45, rx: 0.48, ry: 0.34, rotation: -0.25, speed: 0.0003, offset: 0, parallax: 0.15, width: 1.8 },
      { cx: 0.5, cy: 0.45, rx: 0.42, ry: 0.3, rotation: 0.15, speed: -0.0002, offset: Math.PI * 0.7, parallax: 0.2, width: 1.5 },
      // Mid arcs
      { cx: 0.5, cy: 0.45, rx: 0.32, ry: 0.22, rotation: 0.5, speed: -0.0004, offset: Math.PI * 0.3, parallax: 0.35, width: 2 },
      { cx: 0.5, cy: 0.45, rx: 0.28, ry: 0.18, rotation: -0.6, speed: 0.00035, offset: Math.PI * 1.2, parallax: 0.4, width: 1.2 },
      // Inner tight arcs
      { cx: 0.5, cy: 0.45, rx: 0.18, ry: 0.12, rotation: 0.8, speed: 0.0005, offset: Math.PI * 0.6, parallax: 0.5, width: 2.2 },
      { cx: 0.5, cy: 0.45, rx: 0.14, ry: 0.09, rotation: -1.0, speed: -0.0006, offset: Math.PI * 1.8, parallax: 0.55, width: 1 },
    ]

    const arcSweep = [1.35, 1.4, 1.3, 1.45, 1.25, 1.5] // how much of the ellipse to draw (in π radians)

    let time = 0

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

      const scroll = scrollRef.current

      for (let i = 0; i < arcs.length; i++) {
        const arc = arcs[i]
        const sweep = arcSweep[i]
        const cx = arc.cx * width
        const cy = arc.cy * height
        const rx = arc.rx * width
        const ry = arc.ry * height
        const currentRotation = arc.rotation + time * arc.speed + arc.offset
        const yOffset = -scroll * arc.parallax

        ctx!.save()
        ctx!.translate(cx, cy + yOffset)
        ctx!.rotate(currentRotation)

        // Glow trail — faint wider stroke behind the arc
        ctx!.beginPath()
        ctx!.ellipse(0, 0, rx, ry, 0, 0, Math.PI * sweep)
        ctx!.strokeStyle = `${colors.base} ${colors.glowAlpha})`
        ctx!.lineWidth = arc.width + 8
        ctx!.lineCap = 'round'
        ctx!.stroke()

        // Main arc
        ctx!.beginPath()
        ctx!.ellipse(0, 0, rx, ry, 0, 0, Math.PI * sweep)
        ctx!.strokeStyle = `${colors.base} ${colors.arcAlpha})`
        ctx!.lineWidth = arc.width
        ctx!.lineCap = 'round'
        ctx!.stroke()

        // Dot at end of arc
        const endAngle = Math.PI * sweep
        const dotX = rx * Math.cos(endAngle)
        const dotY = ry * Math.sin(endAngle)
        ctx!.beginPath()
        ctx!.arc(dotX, dotY, 3, 0, Math.PI * 2)
        ctx!.fillStyle = `${colors.base} ${colors.dotAlpha})`
        ctx!.fill()

        // Faint dot at start
        ctx!.beginPath()
        ctx!.arc(rx, 0, 2, 0, Math.PI * 2)
        ctx!.fillStyle = `${colors.base} ${colors.dotAlpha * 0.5})`
        ctx!.fill()

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
