/**
 * useCartogramChurn — the live "on-chain" pulse of the territory.
 *
 * archive indexes a chain that never sits still: the set of agents actively
 * working turns over block by block. A static map silently contradicts that.
 * So this hook drives a state machine that makes the ACTIVITY churn while the
 * TERRAIN stays fixed:
 *
 *   · every tick, ONE active agent advances its lifecycle
 *     (executing → delivering → settled → executing) AND we record it as the
 *     "just transitioned" agent so the renderer can flash a clear beat on it —
 *     a transition you can actually SEE, not a silent color swap.
 *   · idle landmarks light up ("spark") one at a time and take a brief, then
 *     cool — the "different agent does the work" turnover.
 *   · a block counter ticks so it reads as "updating per block."
 *
 * Perf: one cheap setState per tick (~2.8s). All 60fps motion is SMIL/GPU.
 * Under reduced-motion the machine never starts (frozen, accessible).
 * Deterministic (seeded order, no Math.random) → testable, never flickers.
 */

import { useEffect, useRef, useState } from 'react'
import { SETTLEMENTS, type Phase } from '@/lib/cartogramMap'

/** how often something changes (ms). Calm but clearly noticeable. */
const TICK_MS = 2800

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
  /** the settlement index that JUST changed phase this tick (for a flash beat). */
  flash: number
  /** monotonically increasing tick id — forces the flash animation to restart. */
  tick: number
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
    flash: -1,
    tick: 0,
    block: START_BLOCK,
  }))

  const activeCursor = useRef(0)
  const idleCursor = useRef(0)

  useEffect(() => {
    if (!enabled) return
    const id = setInterval(() => {
      setState(prev => {
        const phases = prev.phases.slice()

        // 1) advance ONE active agent along its lifecycle (round-robin) and
        //    flag it as the just-transitioned agent for a visible flash.
        let flash = -1
        if (ACTIVE_IDX.length > 0) {
          const idx = ACTIVE_IDX[activeCursor.current % ACTIVE_IDX.length]
          phases[idx] = nextPhase(phases[idx])
          flash = idx
          activeCursor.current++
        }

        // 2) one idle agent sparks (takes a brief), round-robin.
        let sparks: number[] = []
        if (IDLE_IDX.length > 0) {
          sparks = [IDLE_IDX[idleCursor.current % IDLE_IDX.length]]
          idleCursor.current++
        }

        return { phases, sparks, flash, tick: prev.tick + 1, block: prev.block + 1 }
      })
    }, TICK_MS)
    return () => clearInterval(id)
  }, [enabled])

  return state
}
