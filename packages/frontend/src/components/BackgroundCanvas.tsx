import { useEffect, useRef } from 'react'

function getThemeColors() {
  const theme = document.documentElement.getAttribute('data-theme')
  if (theme === 'light') {
    return { base: 'rgba(0, 0, 0,', arcAlpha: 0.07, dotAlpha: 0.18, glowAlpha: 0.03 }
  }
  return { base: 'rgba(255, 255, 255,', arcAlpha: 0.06, dotAlpha: 0.15, glowAlpha: 0.025 }
}

const ALL_ARCS = [
  // Large outer arcs
  { cx: 0.5, cy: 0.38, rx: 0.48, ry: 0.36, rotation: -0.25, speed: 0.0003, offset: 0, parallax: 0.15, width: 1.8 },
  { cx: 0.5, cy: 0.38, rx: 0.42, ry: 0.32, rotation: 0.15, speed: -0.0002, offset: Math.PI * 0.7, parallax: 0.2, width: 1.5 },
  // Mid arcs
  { cx: 0.5, cy: 0.38, rx: 0.32, ry: 0.24, rotation: 0.5, speed: -0.0004, offset: Math.PI * 0.3, parallax: 0.35, width: 2 },
  { cx: 0.5, cy: 0.38, rx: 0.28, ry: 0.2, rotation: -0.6, speed: 0.00035, offset: Math.PI * 1.2, parallax: 0.4, width: 1.2 },
  // Inner tight arcs
  { cx: 0.5, cy: 0.38, rx: 0.18, ry: 0.14, rotation: 0.8, speed: 0.0005, offset: Math.PI * 0.6, parallax: 0.5, width: 2.2 },
  { cx: 0.5, cy: 0.38, rx: 0.14, ry: 0.1, rotation: -1.0, speed: -0.0006, offset: Math.PI * 1.8, parallax: 0.55, width: 1 },
]

const ALL_SWEEPS = [1.35, 1.4, 1.3, 1.45, 1.25, 1.5]

// Mobile: pick 3 representative arcs
const MOBILE_INDICES = [0, 2, 4]

// Form zone — where the PostJob form sits (fraction of viewport)
// Lines will flow AROUND this rectangle
const FORM_ZONE = {
  left: 0.15,   // 15% from left
  right: 0.85,  // 15% from right
  top: 0.08,    // 8% from top (below nav)
  bottom: 0.92, // 8% from bottom
}

// Margin around form zone for smooth repulsion (fraction of viewport)
const REPULSE_MARGIN = 0.08

/**
 * Repel a point away from the form zone.
 * Returns [newX, newY] pushed outside the zone + margin.
 */
function repelFromFormZone(px: number, py: number, w: number, h: number): [number, number] {
  const zl = FORM_ZONE.left * w
  const zr = FORM_ZONE.right * w
  const zt = FORM_ZONE.top * h
  const zb = FORM_ZONE.bottom * h
  const m = REPULSE_MARGIN * Math.min(w, h)

  // Expanded zone (includes margin)
  const el = zl - m
  const er = zr + m
  const et = zt - m
  const eb = zb + m

  // Check if point is outside expanded zone — no repulsion needed
  if (px < el || px > er || py < et || py > eb) return [px, py]

  // Compute push direction based on which edges are closest
  // Use dot product: push toward nearest edge
  let pushX = 0
  let pushY = 0

  // Distance to each edge (positive = inside)
  const distLeft = px - el    // positive when inside left margin
  const distRight = er - px   // positive when inside right margin
  const distTop = py - et     // positive when inside top margin
  const distBottom = eb - py  // positive when inside bottom margin

  // Push away from the nearest edges
  // Weight by inverse distance — closer to edge = stronger push
  const totalX = distLeft + distRight
  const totalY = distTop + distBottom

  if (totalX > 0) {
    // Push in X: weight between left and right push
    pushX = (distLeft - distRight) / totalX  // negative = push left, positive = push right
  }
  if (totalY > 0) {
    pushY = (distTop - distBottom) / totalY  // negative = push up, positive = push down
  }

  // Normalize
  const mag = Math.sqrt(pushX * pushX + pushY * pushY)
  if (mag < 0.001) {
    // Dead center — push outward based on angle from center
    const centerX = (zl + zr) / 2
    const centerY = (zt + zb) / 2
    const dx = px - centerX
    const dy = py - centerY
    const d = Math.sqrt(dx * dx + dy * dy)
    if (d < 0.001) return [px, py - m] // push up if dead center
    pushX = dx / d
    pushY = dy / d
  } else {
    pushX /= mag
    pushY /= mag
  }

  // How deep inside the expanded zone? 0 = at edge, 1 = at form boundary
  // Use the maximum penetration
  const penetration = Math.max(
    0,
    1 - Math.min(
      px - el, er - px,
      py - et, eb - py
    ) / m
  )

  // Push distance: scale with penetration squared for smooth easing
  const pushDist = m * Math.pow(Math.max(0, penetration), 1.5) * 1.2

  return [px + pushX * pushDist, py + pushY * pushDist]
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

    const arcs = mobile ? MOBILE_INDICES.map(i => ALL_ARCS[i]) : ALL_ARCS
    const sweeps = mobile ? MOBILE_INDICES.map(i => ALL_SWEEPS[i]) : ALL_SWEEPS

    let time = 0
    let clearMode = false

    // Listen for clear/restore signals
    const handleClear = () => { clearMode = true }
    const handleRestore = () => { clearMode = false }
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

    /**
     * Compute points along an arc, optionally with repulsion from form zone.
     * Returns array of [x, y] in canvas coordinates.
     */
    function computeArcPoints(
      cx: number, cy: number, rx: number, ry: number,
      rotation: number, sweep: number, steps: number,
      repulse: boolean
    ): [number, number][] {
      const points: [number, number][] = []
      for (let s = 0; s <= steps; s++) {
        const theta = (s / steps) * Math.PI * sweep
        // Point on rotated ellipse
        let x = cx + rx * Math.cos(theta) * Math.cos(rotation) - ry * Math.sin(theta) * Math.sin(rotation)
        let y = cy + rx * Math.cos(theta) * Math.sin(rotation) + ry * Math.sin(theta) * Math.cos(rotation)

        if (repulse) {
          [x, y] = repelFromFormZone(x, y, width, height)
        }

        points.push([x, y])
      }
      return points
    }

    function draw() {
      ctx!.clearRect(0, 0, width, height)
      time++

      const scroll = scrollRef.current

      for (let i = 0; i < arcs.length; i++) {
        const arc = arcs[i]
        const sweep = sweeps[i]
        const cx = arc.cx * width
        const cy = arc.cy * height + (-scroll * arc.parallax)
        const rx = arc.rx * width
        const ry = arc.ry * height
        const currentRotation = arc.rotation + time * arc.speed + arc.offset

        if (clearMode) {
          // Point-by-point drawing with form zone repulsion
          const steps = 72
          const pts = computeArcPoints(cx, cy, rx, ry, currentRotation, sweep, steps, true)

          // Glow trail — skip on mobile
          if (!mobile) {
            ctx!.beginPath()
            ctx!.moveTo(pts[0][0], pts[0][1])
            for (let s = 1; s < pts.length; s++) {
              ctx!.lineTo(pts[s][0], pts[s][1])
            }
            ctx!.strokeStyle = `${colors.base} ${colors.glowAlpha})`
            ctx!.lineWidth = arc.width + 8
            ctx!.lineCap = 'round'
            ctx!.lineJoin = 'round'
            ctx!.stroke()
          }

          // Main arc
          ctx!.beginPath()
          ctx!.moveTo(pts[0][0], pts[0][1])
          for (let s = 1; s < pts.length; s++) {
            ctx!.lineTo(pts[s][0], pts[s][1])
          }
          ctx!.strokeStyle = `${colors.base} ${colors.arcAlpha})`
          ctx!.lineWidth = mobile ? arc.width * 0.8 : arc.width
          ctx!.lineCap = 'round'
          ctx!.lineJoin = 'round'
          ctx!.stroke()

          // Dot at end
          const end = pts[pts.length - 1]
          const dotR = mobile ? 2 : 3
          ctx!.beginPath()
          ctx!.arc(end[0], end[1], dotR, 0, Math.PI * 2)
          ctx!.fillStyle = `${colors.base} ${colors.dotAlpha})`
          ctx!.fill()

          // Faint dot at start
          if (!mobile) {
            ctx!.beginPath()
            ctx!.arc(pts[0][0], pts[0][1], 2, 0, Math.PI * 2)
            ctx!.fillStyle = `${colors.base} ${colors.dotAlpha * 0.5})`
            ctx!.fill()
          }

        } else {
          // Normal rendering — native ellipse (fast)
          ctx!.save()
          ctx!.translate(cx, cy)
          ctx!.rotate(currentRotation)

          if (!mobile) {
            ctx!.beginPath()
            ctx!.ellipse(0, 0, rx, ry, 0, 0, Math.PI * sweep)
            ctx!.strokeStyle = `${colors.base} ${colors.glowAlpha})`
            ctx!.lineWidth = arc.width + 8
            ctx!.lineCap = 'round'
            ctx!.stroke()
          }

          ctx!.beginPath()
          ctx!.ellipse(0, 0, rx, ry, 0, 0, Math.PI * sweep)
          ctx!.strokeStyle = `${colors.base} ${colors.arcAlpha})`
          ctx!.lineWidth = mobile ? arc.width * 0.8 : arc.width
          ctx!.lineCap = 'round'
          ctx!.stroke()

          const endAngle = Math.PI * sweep
          const dotX = rx * Math.cos(endAngle)
          const dotY = ry * Math.sin(endAngle)
          const dotR = mobile ? 2 : 3
          ctx!.beginPath()
          ctx!.arc(dotX, dotY, dotR, 0, Math.PI * 2)
          ctx!.fillStyle = `${colors.base} ${colors.dotAlpha})`
          ctx!.fill()

          if (!mobile) {
            ctx!.beginPath()
            ctx!.arc(rx, 0, 2, 0, Math.PI * 2)
            ctx!.fillStyle = `${colors.base} ${colors.dotAlpha * 0.5})`
            ctx!.fill()
          }

          ctx!.restore()
        }
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
