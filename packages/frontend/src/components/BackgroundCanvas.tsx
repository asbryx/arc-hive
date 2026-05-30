import { useEffect, useRef } from 'react'

function getLineColor(): string {
  const theme = document.documentElement.getAttribute('data-theme')
  return theme === 'light' ? 'rgba(0, 0, 0,' : 'rgba(255, 255, 255,'
}

interface Point {
  x: number
  y: number
  vx: number
  vy: number
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
    let height = document.documentElement.scrollHeight

    canvas.width = width
    canvas.height = height

    // Constellation points — sparse, slow drift
    const POINT_COUNT = Math.floor((width * height) / 40000)
    const CONNECTION_DIST = 120
    const points: Point[] = []

    for (let i = 0; i < POINT_COUNT; i++) {
      points.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.15,
        vy: (Math.random() - 0.5) * 0.15,
      })
    }

    // Orbital arcs
    const arcs = [
      { cx: width * 0.5, cy: height * 0.2, rx: width * 0.4, ry: 200, rotation: -0.25, speed: 0.0004, offset: 0, parallax: 0.3 },
      { cx: width * 0.5, cy: height * 0.2, rx: width * 0.3, ry: 150, rotation: 0.5, speed: -0.0003, offset: Math.PI * 0.5, parallax: 0.5 },
      { cx: width * 0.5, cy: height * 0.2, rx: width * 0.5, ry: 250, rotation: 0.15, speed: 0.0002, offset: Math.PI, parallax: 0.2 },
    ]

    let time = 0

    const handleScroll = () => {
      scrollRef.current = window.scrollY
    }
    window.addEventListener('scroll', handleScroll, { passive: true })

    let colorBase = getLineColor()
    const observer = new MutationObserver(() => {
      colorBase = getLineColor()
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

    function draw() {
      ctx!.clearRect(0, 0, width, height)
      time++

      const scroll = scrollRef.current
      const viewTop = scroll
      const viewBottom = scroll + window.innerHeight

      // Update and draw constellation
      for (const p of points) {
        p.x += p.vx
        p.y += p.vy

        // Wrap around
        if (p.x < 0) p.x = width
        if (p.x > width) p.x = 0
        if (p.y < 0) p.y = height
        if (p.y > height) p.y = 0
      }

      // Only draw points/connections in viewport + buffer
      const buffer = CONNECTION_DIST
      const visiblePoints = points.filter(
        p => p.y > viewTop - buffer && p.y < viewBottom + buffer
      )

      // Draw connections
      for (let i = 0; i < visiblePoints.length; i++) {
        for (let j = i + 1; j < visiblePoints.length; j++) {
          const dx = visiblePoints[i].x - visiblePoints[j].x
          const dy = visiblePoints[i].y - visiblePoints[j].y
          const dist = Math.sqrt(dx * dx + dy * dy)

          if (dist < CONNECTION_DIST) {
            const alpha = (1 - dist / CONNECTION_DIST) * 0.08
            ctx!.beginPath()
            ctx!.moveTo(visiblePoints[i].x, visiblePoints[i].y - scroll)
            ctx!.lineTo(visiblePoints[j].x, visiblePoints[j].y - scroll)
            ctx!.strokeStyle = `${colorBase} ${alpha})`
            ctx!.lineWidth = 0.8
            ctx!.stroke()
          }
        }
      }

      // Draw points
      for (const p of visiblePoints) {
        ctx!.beginPath()
        ctx!.arc(p.x, p.y - scroll, 1.5, 0, Math.PI * 2)
        ctx!.fillStyle = `${colorBase} 0.12)`
        ctx!.fill()
      }

      // Draw orbital arcs
      for (const arc of arcs) {
        const currentRotation = arc.rotation + time * arc.speed + arc.offset
        const yOffset = arc.cy - scroll * arc.parallax

        ctx!.save()
        ctx!.translate(arc.cx, yOffset)
        ctx!.rotate(currentRotation)

        ctx!.beginPath()
        ctx!.ellipse(0, 0, arc.rx, arc.ry, 0, 0, Math.PI * 1.4)
        ctx!.strokeStyle = `${colorBase} 0.08)`
        ctx!.lineWidth = 2.5
        ctx!.stroke()

        const endAngle = Math.PI * 1.4
        const dotX = arc.rx * Math.cos(endAngle)
        const dotY = arc.ry * Math.sin(endAngle)
        ctx!.beginPath()
        ctx!.arc(dotX, dotY, 4, 0, Math.PI * 2)
        ctx!.fillStyle = `${colorBase} 0.2)`
        ctx!.fill()

        const startX = arc.rx * Math.cos(0)
        const startY = arc.ry * Math.sin(0)
        ctx!.beginPath()
        ctx!.arc(startX, startY, 3, 0, Math.PI * 2)
        ctx!.fillStyle = `${colorBase} 0.12)`
        ctx!.fill()

        ctx!.restore()
      }

      animId = requestAnimationFrame(draw)
    }

    draw()

    const handleResize = () => {
      width = window.innerWidth
      height = document.documentElement.scrollHeight
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
