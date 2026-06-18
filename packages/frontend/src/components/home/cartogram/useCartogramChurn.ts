/**
 * useCartogramChurn — the live "on-chain" pulse of the territory.
 *
 * archive indexes a chain that never sits still: the set of agents actively
 * working turns over block by block. A static map silently contradicts that.
 * So this hook drives a slow, deterministic state machine that makes the
 * ACTIVITY churn while the TERRAIN stays fixed:
 *
 *   · the named/active agents cycle through their real lifecycle
 *     (executing → delivering → settled → back to executing). They never go
 *     idle, so their labels never move — the verified-clean label layout and
 *     the cached relief/contours/dust never re-render.
 *   · idle agents periodically "spark": a quiet landmark briefly lights up,
 *     takes a brief (aura + a faint route + a traveling packet), then cools.
 *     This is the "different agent does the work" signal — turnover you can
 *     watch — without minting a new label (idle agents are unlabeled by
 *     design, so no collision risk).
 *   · a block counter ticks so the churn reads as "updating per block."
 *
 * Perf: React state changes only once per TICK (~3.5s) — one cheap setState.
 * All 60fps motion is SMIL/GPU (auras, packets), untouched here. Under
 * reduced-motion the machine never starts: the map is frozen at its initial
 * state, fully legible and accessible.
 *
 * Deterministic: seeded order, no Math.random — same sequence every session,
 * so it's testable and never flickers.
 */

import { useEffect, useRef, useState } from 'react'
import { SETTLEMENTS, type Phase } from '@/lib/cartogramMap'

/** how often something changes (ms). Calm — an instrument updating, not a strobe. */
const TICK_MS = 3500

/** lifecycle the active agents rotate through (never idle → labels stay put). */
const LIFECYCLE: Phase[] = ['executing', 'delivering', 'settled']

function nextPhase(p: Phase): Phase {
  const i = LIFECYCLE.indexOf(p)
  if (i < 0) return 'executing'
  return LIFECYCLE[(i + 1) % LIFECYCLE.length]
}

export interface ChurnState {
  /** effective phase per settlement index (overrides the static seed phase). */
  phases: Phase[]
  /** idle-agent indices currently "sparking" (transient activity, no label). */
  sparks: number[]
  /** the current block height (starts from the edition-stamp seed, ticks up). */
  block: number
}

/** indices of the originally-active (labeled) agents vs the idle landmarks. */
const ACTIVE_IDX = SETTLEMENTS.map((s, i) => (s.phase !== 'idle' ? i : -1)).filter(i => i >= 0)
const IDLE_IDX = SETTLEMENTS.map((s, i) => (s.phase === 'idle' ? i : -1)).filter(i => i >= 0)

const START_BLOCK = 4_210_886

export function useCartogramChurn(enabled: boolean): ChurnState {
  const [state, setState] = useState<ChurnState>(() => ({
    phases: SETTLEMENTS.map(s => s.phase),
    sparks: [],
    block: START_BLOCK,
  }))

  // round-robin pointers (refs so the interval closure stays stable)
  const activeCursor = useRef(0)
  const idleCursor = useRef(0)

  useEffect(() => {
    if (!enabled) return
    const id = setInterval(() => {
      setState(prev => {
        const phases = prev.phases.slice()

        // 1) advance ONE active agent along its lifecycle (round-robin).
        if (ACTIVE_IDX.length > 0) {
          const idx = ACTIVE_IDX[activeCursor.current % ACTIVE_IDX.length]
          phases[idx] = nextPhase(phases[idx])
          activeCursor.current++
        }

        // 2) toggle idle sparks: retire last tick's spark, ignite the next
        //    idle agent. One spark at a time keeps it calm + cheap.
        let sparks: number[] = []
        if (IDLE_IDX.length > 0) {
          const sparkIdx = IDLE_IDX[idleCursor.current % IDLE_IDX.length]
          sparks = [sparkIdx]
          idleCursor.current++
        }

        return { phases, sparks, block: prev.block + 1 }
      })
    }, TICK_MS)
    return () => clearInterval(id)
  }, [enabled])

  return state
}
