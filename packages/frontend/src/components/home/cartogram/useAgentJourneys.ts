/**
 * useAgentJourneys — the movement controller for the "Keep and the Field".
 *
 * Maintains ACTIVE_COUNT slots. Each slot holds one agent progressing through:
 *   muster (Keep → site)  → station (work at site) → return (site → Keep) → done
 * When a slot finishes, it recruits the next garrison agent (round-robin), so
 * the active set rotates THROUGH movement. Deterministic order, no Math.random.
 *
 * React state changes only at STAGE BOUNDARIES (a few seconds apart) — one
 * cheap setState. The actual 60fps travel is SMIL <animateMotion>, keyed by
 * stage id so it (re)starts cleanly each leg. Under reduced-motion the hook
 * never advances: agents sit parked at their sites, fully legible.
 */

import { useEffect, useRef, useState } from 'react'
import { AGENTS, ACTIVE_COUNT, type AgentDef } from '@/lib/cartogramAgents'

export type Stage = 'muster' | 'station' | 'return'

export interface Journey {
  slot: number
  agent: AgentDef
  stage: Stage
  /** unique id per leg so SMIL animations restart when the stage changes. */
  legId: number
}

/** stage durations (ms). Travel legs are long enough to read as a journey;
 *  station is the work dwell. Calm cadence. */
const DUR: Record<Stage, number> = {
  muster: 5200,
  station: 4200,
  return: 5200,
}

const NEXT: Record<Stage, Stage | null> = {
  muster: 'station',
  station: 'return',
  return: null,
}

/** map a stage to the lifecycle phase color/meaning. */
export const STAGE_PHASE: Record<Stage, 'executing' | 'delivering' | 'settled'> = {
  muster: 'executing',
  station: 'delivering',
  return: 'settled',
}

export function useAgentJourneys(enabled: boolean): Journey[] {
  // initial: first ACTIVE_COUNT agents, staggered across stages so the field
  // looks mid-flow immediately (not all mustering in lockstep).
  const [journeys, setJourneys] = useState<Journey[]>(() =>
    Array.from({ length: ACTIVE_COUNT }, (_, slot) => ({
      slot,
      agent: AGENTS[slot % AGENTS.length],
      stage: (['muster', 'station', 'return'] as Stage[])[slot % 3],
      legId: slot,
    })),
  )

  // round-robin recruiter pointer + per-slot timers
  const recruitCursor = useRef(ACTIVE_COUNT)
  const legCounter = useRef(ACTIVE_COUNT)
  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({})

  useEffect(() => {
    if (!enabled) return

    function schedule(slot: number, stage: Stage) {
      timers.current[slot] = setTimeout(() => {
        setJourneys(prev => {
          const next = prev.slice()
          const cur = next.find(j => j.slot === slot)
          if (!cur) return prev
          const ns = NEXT[stage]
          if (ns) {
            // advance to next leg of the SAME agent
            const legId = legCounter.current++
            const updated: Journey = { ...cur, stage: ns, legId }
            next[next.indexOf(cur)] = updated
            schedule(slot, ns)
          } else {
            // journey complete → recruit the next garrison agent for this slot
            const agent = AGENTS[recruitCursor.current % AGENTS.length]
            recruitCursor.current++
            const legId = legCounter.current++
            const updated: Journey = { slot, agent, stage: 'muster', legId }
            next[next.indexOf(cur)] = updated
            schedule(slot, 'muster')
          }
          return next
        })
      }, DUR[stage])
    }

    // kick off a timer for each slot at its current stage
    journeys.forEach(j => schedule(j.slot, j.stage))

    return () => {
      Object.values(timers.current).forEach(clearTimeout)
      timers.current = {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])

  return journeys
}
