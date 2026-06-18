/**
 * cartogramAgents — the moving population for the "Keep and the Field" model.
 *
 * Two fixed anchors create the economy's current:
 *   · CLIENT PORT (west)  — where briefs land.
 *   · THE KEEP   (east)   — the agents' stronghold. The garrison rests here;
 *                            active agents sortie OUT to work and RETURN.
 *
 * Every active agent runs one purposeful loop (not random drift):
 *   muster (leave Keep → work-site)  → executing
 *   station (work at site)            → delivering
 *   return (work-site → Keep)         → settled (USDC flies to port)
 *   stand down (rejoin garrison)      → idle
 * …then a DIFFERENT garrison agent musters out. Turnover happens THROUGH
 * movement, and only agents currently out get a label — so the labelled set
 * is small (~6-8) and churns as they travel. Clutter is solved by motion.
 *
 * A work-site = the agent's address-derived home (so WHERE it works still
 * encodes identity — "position = address" stays half-true), but the Keep is
 * communal. Everything is deterministic (seeded), no Math.random.
 */

import { seedFrom } from './seededRandom'
import { VB, PORT } from './cartogramMap'

/** the stronghold on the east coast — the garrison's home. */
export const KEEP = { x: VB.w - 150, y: 330 }

export type Capability = 'code' | 'research' | 'audit' | 'brand' | 'copy' | 'translation'

export interface AgentDef {
  name: string
  addr: string
  score: number
  cap: Capability
  glyph: 'ring' | 'cross' | 'tri' | 'lens' | 'star' | 'keep'
  /** work-site in plate space, derived from the address (identity = place). */
  site: { x: number; y: number }
}

const CAP_GLYPH: Record<Capability, AgentDef['glyph']> = {
  code: 'cross', research: 'lens', audit: 'tri', brand: 'star', copy: 'ring', translation: 'keep',
}

/** Work-site from address — deterministic, kept in the FIELD (between port and
 *  keep, with vertical margins) so journeys read as out-and-back arcs. */
function siteFromAddr(addr: string): { x: number; y: number } {
  const hx = seedFrom(addr)
  const hy = seedFrom(addr + ':y')
  const u = (hx & 0xffff) / 0x10000
  const v = (hy & 0xffff) / 0x10000
  // field spans from just east of the port to just west of the keep
  const xLo = PORT.x + 170, xHi = KEEP.x - 150
  const yLo = 95, yHi = VB.h - 110
  return { x: xLo + u * (xHi - xLo), y: yLo + v * (yHi - yLo) }
}

/** The agent roster. More than are ever active at once — the rest rest in the
 *  Keep garrison. Names/scores/caps are curated demo data shaped like the real
 *  indexed fields (owner address, avg_score, capability). */
const ROSTER: Array<Omit<AgentDef, 'glyph' | 'site'>> = [
  { name: 'Lyra Synthwright', addr: '0xA8C3', score: 9.42, cap: 'code' },
  { name: 'Carter & Vale',    addr: '0x4C91', score: 8.71, cap: 'audit' },
  { name: 'Thorne Ledger',    addr: '0x12FA', score: 8.43, cap: 'research' },
  { name: 'Bly & Marsh',      addr: '0x3D8E', score: 8.34, cap: 'audit' },
  { name: 'Osric Wynn',       addr: '0x1F44', score: 8.22, cap: 'code' },
  { name: 'Sable & Crane',    addr: '0x41BC', score: 8.18, cap: 'brand' },
  { name: 'Wren Albright',    addr: '0x6F23', score: 8.12, cap: 'research' },
  { name: 'Mira Tolle',       addr: '0x9D7C', score: 8.05, cap: 'copy' },
  { name: 'Nim Hawthorne',    addr: '0xD905', score: 7.97, cap: 'translation' },
  { name: 'Verity & Bell',    addr: '0x7E02', score: 7.94, cap: 'brand' },
  { name: 'Orin Castle',      addr: '0xC417', score: 7.88, cap: 'research' },
  { name: 'Halden Court',     addr: '0x55AB', score: 7.81, cap: 'code' },
  { name: 'Iris Voss',        addr: '0x88BD', score: 7.68, cap: 'copy' },
  { name: 'Pike & Sour',      addr: '0x9B51', score: 7.62, cap: 'audit' },
  { name: 'Quill Marlowe',    addr: '0x2B66', score: 7.55, cap: 'translation' },
  { name: 'Calder Voss',      addr: '0x2E70', score: 7.49, cap: 'research' },
  { name: 'Selden Roe',       addr: '0x7A10', score: 7.40, cap: 'code' },
  { name: 'Edda Pole',        addr: '0x8C39', score: 7.33, cap: 'copy' },
]

export const AGENTS: AgentDef[] = ROSTER.map(a => ({
  ...a,
  glyph: CAP_GLYPH[a.cap],
  site: siteFromAddr(a.addr),
}))

/** how many agents are out on a sortie at once (the rest rest in the Keep). */
export const ACTIVE_COUNT = 7

/** garrison resting positions — a dense cluster packed around the Keep, so the
 *  stronghold reads as crowded with the whole population. Deterministic spiral
 *  so they don't overlap. ~60 dots for "many agents" without per-agent cost. */
export const GARRISON: Array<{ x: number; y: number; r: number }> = (() => {
  const out: Array<{ x: number; y: number; r: number }> = []
  const N = 64
  for (let i = 0; i < N; i++) {
    // sunflower / phyllotaxis packing → even, organic cluster
    const t = i / N
    const radius = 14 + Math.sqrt(t) * 86
    const ang = i * 2.399963   // golden angle
    out.push({
      x: KEEP.x + Math.cos(ang) * radius * 0.92,
      y: KEEP.y + Math.sin(ang) * radius,
      r: 0.9 + ((seedFrom(`g${i}`) & 0xff) / 0xff) * 1.4,
    })
  }
  return out
})()

/** quadratic control point so a journey arcs (bows toward the port side) instead
 *  of running dead straight — reads as a travelled route, not a ruler line. */
export function arcControl(a: { x: number; y: number }, b: { x: number; y: number }, bend: number) {
  const mx = (a.x + b.x) / 2
  const my = (a.y + b.y) / 2
  const dx = b.x - a.x
  const dy = b.y - a.y
  return { cx: mx - dy * bend, cy: my + dx * bend }
}
