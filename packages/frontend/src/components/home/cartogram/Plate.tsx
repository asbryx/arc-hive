/**
 * Plate — the cartogram, rebuilt as an actual topographic map.
 *
 * The idea (from _design-archive/CARTOGRAM.md): address space as a
 * TERRITORY. This builds that territory as a real map a stranger reads
 * at a glance:
 *
 *   · contour lines (marching squares over an activity-elevation field)
 *     fill the whole plate — the land has shape, busy clusters are
 *     highlands, idle space is lowland.
 *   · a bold coastline contour separates settled space from the void.
 *   · population stipple, denser on the highlands = the 1,284 agents.
 *   · a west-coast PORT where client briefs enter.
 *   · trade ROUTES from the port to active settlements — both ends are
 *     real, visible places (no dangling lines).
 *   · six named SETTLEMENTS crowning the highlands, each a survey marker
 *     + name + address + score.
 *
 * Fills its 1600×900 box edge-to-edge. Only the routes animate.
 */

import { useMemo } from 'react'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import {
  sampleDensityField, contourAt, segsToSmoothPaths,
} from '@/lib/contourField'
import {
  VB, PORT, buildPopulation, KNOCKOUT_BOXES,
} from '@/lib/cartogramMap'
import { KEEP, AGENTS } from '@/lib/cartogramAgents'
import MovementLayer from './MovementLayer'

export default function Plate() {
  const reduced = useReducedMotion()

  const { contours, coastline, stipple } = useMemo(() => {
    // The ~1,284-agent population IS the terrain. Each agent splats a small
    // gaussian; where the crowd clusters, the land rises. Agent work-sites add
    // weight so the highlands sit where agents actually work.
    const population = buildPopulation()
    const named = AGENTS.map(a => ({ x: a.site.x, y: a.site.y, weight: 1.6 }))
    const field = sampleDensityField({
      w: VB.w, h: VB.h, cell: 8, bandwidth: 52,
      points: [...population, ...named],
    })

    // contour levels as fractions of max elevation. The lowest is the
    // coastline; the rest are interior topo lines. Segments are chained +
    // smoothed so contours read as clean nested loops, not jagged dashes.
    const max = field.max
    const levels = [0.04, 0.09, 0.16, 0.25, 0.37, 0.52, 0.70].map(f => f * max)
    const contours = levels.map(l => segsToSmoothPaths(contourAt(field, l), 18))
    const coastline = segsToSmoothPaths(contourAt(field, 0.04 * max), 18)

    // the population itself is the dust layer — radius from weight, capped
    // away from the anchors (port, keep, agent sites) so dust never sits on
    // markers/text. ~640 dots reads identically as texture without the cost.
    const clear = [
      { x: PORT.x, y: PORT.y, r: 40 },
      { x: KEEP.x, y: KEEP.y, r: 110 },   // keep + its garrison cluster
      ...AGENTS.map(a => ({ x: a.site.x, y: a.site.y, r: 26 })),
    ]
    const stipple = population
      .filter((_, idx) => idx % 2 === 0)
      .filter(p => !clear.some(c => Math.hypot(c.x - p.x, c.y - p.y) < c.r))
      .map(p => ({ x: p.x, y: p.y, r: 0.7 + p.weight * 1.8 }))

    return { contours, coastline, stipple }
  }, [])

  // Memoize the STATIC terrain element tree (hillshade + contours + coastline +
  // dust). It has no churn dependency, so React reuses this exact element on
  // every churn tick — the reconciler skips the whole masked group (and its
  // ~580 dust nodes), eliminating the per-tick re-render hitch. Only the small
  // live layer (auras/routes/packets/sparks) reconciles on a tick.
  const terrain = useMemo(() => (
    <g mask="url(#label-knockout)">
      <g fill="none" stroke="var(--ink-3)" strokeLinecap="round" strokeLinejoin="round">
        {contours.map((d, i) => (
          <path key={i} d={d} strokeWidth={1 + i * 0.22} opacity={0.42 + i * 0.07} />
        ))}
      </g>
      <path d={coastline} fill="none" stroke="var(--ink-2)" strokeWidth="2.2"
            strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />
      <g fill="var(--dust)">
        {stipple.map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r={s.r} opacity={0.22 + s.r * 0.12} />
        ))}
      </g>
    </g>
  ), [contours, coastline, stipple])

  return (
    <svg
      className="map-svg"
      viewBox={`0 0 ${VB.w} ${VB.h}`}
      preserveAspectRatio="xMidYMid meet"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Topographic map of the marketplace — elevation is agent activity, settlements are named agents, routes are briefs in flight"
    >
      <defs>
        <marker id="route-arrow" viewBox="-6 -6 12 12" refX="5" refY="0"
                markerWidth="7" markerHeight="7" orient="auto">
          <path d="M -6 -5 L 6 0 L -6 5 Z" fill="var(--marsh)" />
        </marker>
        {/* label knockout — white shows the layer, black rects hide it under
            text so contour lines + dust break cleanly around every label
            (a real printed-plate label mask, not an opaque cream box). */}
        <mask id="label-knockout">
          <rect x="0" y="0" width={VB.w} height={VB.h} fill="white" />
          {KNOCKOUT_BOXES.map((b, i) => (
            <rect key={i} x={b.x - 3} y={b.y - 2} width={b.w + 6} height={b.h + 4}
                  rx="3" fill="black" />
          ))}
        </mask>
        {/* paper grain — fine fibrous noise so the plate reads as PRINTED
            stock, not flat screen fill. Static filter, composited once. */}
        <filter id="paper-grain" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2"
                        seed="7" stitchTiles="stitch" result="noise" />
          <feColorMatrix in="noise" type="matrix"
                         values="0 0 0 0 0.15  0 0 0 0 0.13  0 0 0 0 0.10  0 0 0 0.04 0" />
        </filter>
      </defs>

      {/* ─── 1. STATIC TERRAIN (memoized) — hillshade relief + contours +
              coastline + population dust. Reused across churn ticks so the
              reconciler skips it; only the live layer below re-renders. */}
      {terrain}

      {/* ─── LIVING LAYER — the "Keep and the Field" movement system ───
          Agents sortie out of the Keep to work-sites and return; trails follow
          them; only agents currently out are labelled. Replaces the old static
          settlements/routes. See MovementLayer + useAgentJourneys. */}
      <MovementLayer reduced={reduced} />

      {/* paper grain overlay — very faint printed-stock texture over the whole
          plate. Non-interactive; static filter so no per-frame cost. */}
      <rect x="0" y="0" width={VB.w} height={VB.h} filter="url(#paper-grain)"
            pointerEvents="none" />
    </svg>
  )
}
