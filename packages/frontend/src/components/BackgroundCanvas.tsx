import { useEffect, useRef } from 'react'

export default function BackgroundCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

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

    // Dot grid
    const gridSpacing = 40
    const dots: { x: number; y: number; pulse: number; speed: number; delay: number }[] = []

    for (let x = gridSpacing; x < width; x += gridSpacing) {
      for (let y = gridSpacing; y < height; y += gridSpacing) {
        dots.push({
          x,
          y,
          pulse: 0,
          speed: 0.002 + Math.random() * 0.003,
          delay: Math.random() * Math.PI * 2,
        })
      }
    }

    // Orbital arcs
    const arcs = [
      { cx: width * 0.5, cy: height * 0.4, rx: width * 0.35, ry: height * 0.25, rotation: -0.3, speed: 0.0003, offset: 0 },
      { cx: width * 0.5, cy: height * 0.4, rx: width * 0.28, ry: height * 0.18, rotation: 0.4, speed: -0.0002, offset: Math.PI * 0.5 },
      { cx: width * 0.5, cy: height * 0.4, rx: width * 0.42, ry: height * 0.3, rotation: 0.1, speed: 0.00015, offset: Math.PI },
    ]

    let time = 0

    function draw() {
      ctx!.clearRect(0, 0, width, height)
      time++

      // Draw dot grid
      for (const dot of dots) {
        const pulseVal = Math.sin(time * dot.speed + dot.delay)
        const alpha = pulseVal > 0.7 ? 0.08 + pulseVal * 0.12 : 0.03
        const radius = pulseVal > 0.7 ? 1.5 : 1

        ctx!.beginPath()
        ctx!.arc(dot.x, dot.y, radius, 0, Math.PI * 2)
        ctx!.fillStyle = `rgba(39, 63, 79, ${alpha})`
        ctx!.fill()
      }

      // Draw orbital arcs
      for (const arc of arcs) {
        const currentRotation = arc.rotation + time * arc.speed + arc.offset

        ctx!.save()
        ctx!.translate(arc.cx, arc.cy)
        ctx!.rotate(currentRotation)

        ctx!.beginPath()
        ctx!.ellipse(0, 0, arc.rx, arc.ry, 0, 0, Math.PI * 1.4)
        ctx!.strokeStyle = 'rgba(39, 63, 79, 0.12)'
        ctx!.lineWidth = 1
        ctx!.stroke()

        // Small dot at arc endpoint
        const endAngle = Math.PI * 1.4
        const dotX = arc.rx * Math.cos(endAngle)
        const dotY = arc.ry * Math.sin(endAngle)
        ctx!.beginPath()
        ctx!.arc(dotX, dotY, 2.5, 0, Math.PI * 2)
        ctx!.fillStyle = 'rgba(39, 63, 79, 0.25)'
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
