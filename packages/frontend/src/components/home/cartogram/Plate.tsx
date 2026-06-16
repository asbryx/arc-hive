/**
 * Plate — the cartogram SVG, transcribed 1:1 from
 * _design-archive/CARTOGRAM.md (PART II · technical spec).
 *
 * A printed cartographic plate of the marketplace as territory. Every
 * coordinate here is HAND-PLACED per the spec — this is not procedurally
 * generated. A plate reads as trustworthy precisely because every mark
 * was considered. Five layers, in z-order:
 *
 *   1. dust field — two bands (top + bottom) only; active region clear
 *   2. client markers — 3 open squares far-left where briefs originate
 *   3. flight lines — 3 (settled / executing / delivering) + payload labels
 *   4. named agents — 6, italic Fraunces label + mono addr·score subline
 *
 * Only the 3 flight lines animate; everything else is static. Motion is
 * gated by prefers-reduced-motion (see hero.css / the reduced check below).
 *
 * Per CARTOGRAM.md: do NOT add more than 6 agents or more than 3 lines.
 */

import { useReducedMotion } from '@/hooks/useReducedMotion'

const VIEWBOX = '0 0 1600 800'

export default function Plate() {
  const reduced = useReducedMotion()

  return (
    <svg
      className="map-svg"
      viewBox={VIEWBOX}
      preserveAspectRatio="xMidYMid meet"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Live cartogram of the marketplace — six named agents, three briefs in flight"
    >
      <defs>
        {/* six agent sigils — bespoke, one per named agent */}
        <symbol id="g-lyra" viewBox="-12 -12 24 24">
          <circle cx="0" cy="0" r="9" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="0" cy="-5" r="2" fill="currentColor" />
          <line x1="-6" y1="4" x2="6" y2="4" stroke="currentColor" strokeWidth="1.5" />
        </symbol>
        <symbol id="g-carter" viewBox="-12 -12 24 24">
          <rect x="-8" y="-8" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <line x1="-8" y1="-8" x2="8" y2="8" stroke="currentColor" strokeWidth="1.5" />
          <line x1="8" y1="-8" x2="-8" y2="8" stroke="currentColor" strokeWidth="1.5" />
        </symbol>
        <symbol id="g-thorne" viewBox="-12 -12 24 24">
          <polygon points="0,-9 8,5 -8,5" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="0" cy="0" r="2.5" fill="currentColor" />
        </symbol>
        <symbol id="g-iris" viewBox="-12 -12 24 24">
          <path d="M -9 0 Q 0 -9 9 0 Q 0 9 -9 0 Z" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="0" cy="0" r="2" fill="currentColor" />
        </symbol>
        <symbol id="g-verity" viewBox="-12 -12 24 24">
          <line x1="0" y1="-9" x2="0" y2="9" stroke="currentColor" strokeWidth="1.5" />
          <line x1="-9" y1="0" x2="9" y2="0" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="0" cy="0" r="3" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </symbol>
        <symbol id="g-halden" viewBox="-12 -12 24 24">
          <polygon points="-8,-8 8,-8 8,4 0,9 -8,4" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </symbol>

        {/* supporting glyphs */}
        <symbol id="g-client" viewBox="-8 -8 16 16">
          <rect x="-5" y="-5" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1" />
        </symbol>
        <symbol id="g-dust" viewBox="-8 -8 16 16">
          <circle cx="0" cy="0" r="2" fill="currentColor" opacity="0.5" />
        </symbol>

        {/* arrowhead for the settled line */}
        <marker id="arr-marsh" viewBox="-6 -6 12 12" refX="6" refY="0"
                markerWidth="8" markerHeight="8" orient="auto">
          <path d="M -6 -5 L 6 0 L -6 5 Z" fill="var(--marsh)" />
        </marker>
      </defs>

      {/* ─── 1. DUST FIELD — top + bottom bands only ─── */}
      <g style={{ color: 'var(--dust)' }} opacity="0.5">
        {/* top band, y 86–138 */}
        <use href="#g-dust" x="80"   y="86" />
        <use href="#g-dust" x="160"  y="124" />
        <use href="#g-dust" x="240"  y="92" />
        <use href="#g-dust" x="320"  y="130" />
        <use href="#g-dust" x="400"  y="98" />
        <use href="#g-dust" x="490"  y="135" />
        <use href="#g-dust" x="580"  y="92" />
        <use href="#g-dust" x="680"  y="128" />
        <use href="#g-dust" x="780"  y="96" />
        <use href="#g-dust" x="880"  y="132" />
        <use href="#g-dust" x="980"  y="100" />
        <use href="#g-dust" x="1080" y="128" />
        <use href="#g-dust" x="1180" y="96" />
        <use href="#g-dust" x="1280" y="134" />
        <use href="#g-dust" x="1380" y="100" />
        <use href="#g-dust" x="1480" y="128" />
        <use href="#g-dust" x="1560" y="98" />
        {/* bottom band, y 688–724 */}
        <use href="#g-dust" x="80"   y="724" />
        <use href="#g-dust" x="160"  y="688" />
        <use href="#g-dust" x="240"  y="722" />
        <use href="#g-dust" x="320"  y="690" />
        <use href="#g-dust" x="400"  y="724" />
        <use href="#g-dust" x="490"  y="690" />
        <use href="#g-dust" x="580"  y="722" />
        <use href="#g-dust" x="680"  y="688" />
        <use href="#g-dust" x="780"  y="724" />
        <use href="#g-dust" x="880"  y="690" />
        <use href="#g-dust" x="980"  y="722" />
        <use href="#g-dust" x="1080" y="688" />
        <use href="#g-dust" x="1180" y="724" />
        <use href="#g-dust" x="1280" y="690" />
        <use href="#g-dust" x="1380" y="722" />
        <use href="#g-dust" x="1480" y="688" />
        <use href="#g-dust" x="1560" y="722" />
      </g>

      {/* ─── 2. CLIENT MARKERS — far-left, where briefs originate ─── */}
      <g style={{ color: 'var(--ink-3)' }} opacity="0.75">
        <use href="#g-client" x="120" y="280" />
        <use href="#g-client" x="100" y="500" />
        <use href="#g-client" x="180" y="620" />
      </g>

      {/* ─── 3. FLIGHT LINES ─── */}
      <g fill="none" strokeLinecap="square">
        {/* 1. SETTLED · marsh · solid · arrowhead · draws on once */}
        <line x1="180" y1="620" x2="1080" y2="420"
              stroke="var(--marsh)" strokeWidth="1.5"
              markerEnd="url(#arr-marsh)"
              strokeDasharray="950" strokeDashoffset={reduced ? 0 : 950}>
          {!reduced && (
            <animate attributeName="stroke-dashoffset" from="950" to="0" dur="1.6s" fill="freeze" />
          )}
        </line>

        {/* 2. EXECUTING · hot · short-dashed · marching ants */}
        <line x1="120" y1="280" x2="700" y2="340"
              stroke="var(--hot)" strokeWidth="1.5"
              strokeDasharray="3 5">
          {!reduced && (
            <animate attributeName="stroke-dashoffset" from="0" to="-16" dur="1.5s" repeatCount="indefinite" />
          )}
        </line>

        {/* 3. DELIVERING · marsh · long-dashed · slower marching ants */}
        <line x1="100" y1="500" x2="380" y2="220"
              stroke="var(--marsh)" strokeWidth="1.5"
              strokeDasharray="8 5" opacity="0.85">
          {!reduced && (
            <animate attributeName="stroke-dashoffset" from="0" to="-26" dur="2.2s" repeatCount="indefinite" />
          )}
        </line>
      </g>

      {/* inline payload labels — cream halo riding each line at its midpoint */}
      <g transform="translate(630,520) rotate(-12.5)">
        <rect x="-78" y="-10" width="156" height="16" fill="var(--cream)" opacity="0.94" />
        <text x="0" y="2" fontFamily="Geist Mono" fontSize="11" fill="var(--marsh)"
              textAnchor="middle" letterSpacing="0.10em" fontWeight="500">JOB-2841 · +2.40 USDC</text>
      </g>
      <g transform="translate(410,304) rotate(5.9)">
        <rect x="-78" y="-10" width="156" height="16" fill="var(--cream)" opacity="0.94" />
        <text x="0" y="2" fontFamily="Geist Mono" fontSize="11" fill="var(--hot)"
              textAnchor="middle" letterSpacing="0.10em" fontWeight="500">JOB-2840 · 9/12 STEPS</text>
      </g>
      <g transform="translate(240,360) rotate(-45)">
        <rect x="-72" y="-10" width="144" height="16" fill="var(--cream)" opacity="0.94" />
        <text x="0" y="2" fontFamily="Geist Mono" fontSize="10" fill="var(--marsh)"
              textAnchor="middle" letterSpacing="0.10em" fontWeight="500" fontStyle="italic">JOB-2838 · DELIV.</text>
      </g>

      {/* ─── 4. NAMED AGENTS (6) ─── */}
      {/* 01 · Iris Voss · DELIVERING (marsh) */}
      <g style={{ color: 'var(--marsh)' }} transform="translate(380,220)">
        <use href="#g-iris" />
        <text x="18" y="4" fontFamily="Fraunces" fontSize="15" fontWeight="350"
              fill="var(--ink)" fontStyle="italic" letterSpacing="-0.005em">Iris Voss</text>
        <text x="18" y="22" fontFamily="Geist Mono" fontSize="10" fill="var(--ink-3)"
              letterSpacing="0.06em">0x88BD · 7.68</text>
      </g>

      {/* 02 · Lyra Synthwright · IDLE (slate) */}
      <g style={{ color: 'var(--slate)' }} transform="translate(840,210)">
        <use href="#g-lyra" />
        <text x="18" y="4" fontFamily="Fraunces" fontSize="15" fontWeight="350"
              fill="var(--ink)" fontStyle="italic" letterSpacing="-0.005em">Lyra Synthwright</text>
        <text x="18" y="22" fontFamily="Geist Mono" fontSize="10" fill="var(--ink-3)"
              letterSpacing="0.06em">0xA8C3 · 9.42</text>
      </g>

      {/* 03 · Thorne Ledger · EXECUTING (hot) · terminus of EXEC line */}
      <g style={{ color: 'var(--hot)' }} transform="translate(700,340)">
        <use href="#g-thorne" />
        <text x="18" y="4" fontFamily="Fraunces" fontSize="15" fontWeight="350"
              fill="var(--ink)" fontStyle="italic" letterSpacing="-0.005em">Thorne Ledger</text>
        <text x="18" y="22" fontFamily="Geist Mono" fontSize="10" fill="var(--ink-3)"
              letterSpacing="0.06em">0x12FA · 8.43</text>
      </g>

      {/* 04 · Carter & Vale · DELIVERING (marsh) · terminus of SETTLED line · cartouche subject */}
      <g style={{ color: 'var(--marsh)' }} transform="translate(1080,420)">
        <use href="#g-carter" />
        <text x="18" y="4" fontFamily="Fraunces" fontSize="15" fontWeight="350"
              fill="var(--ink)" fontStyle="italic" letterSpacing="-0.005em">Carter &amp; Vale</text>
        <text x="18" y="22" fontFamily="Geist Mono" fontSize="10" fill="var(--ink-3)"
              letterSpacing="0.06em">0x4C91 · 8.71</text>
      </g>

      {/* 05 · Verity & Bell · IDLE (slate) */}
      <g style={{ color: 'var(--slate)' }} transform="translate(540,580)">
        <use href="#g-verity" />
        <text x="18" y="4" fontFamily="Fraunces" fontSize="15" fontWeight="350"
              fill="var(--ink)" fontStyle="italic" letterSpacing="-0.005em">Verity &amp; Bell</text>
        <text x="18" y="22" fontFamily="Geist Mono" fontSize="10" fill="var(--ink-3)"
              letterSpacing="0.06em">0x7E02 · 7.94</text>
      </g>

      {/* 06 · Halden K. · IDLE (slate) · label flips LEFT */}
      <g style={{ color: 'var(--slate)' }} transform="translate(1340,300)">
        <use href="#g-halden" />
        <text x="-18" y="4" fontFamily="Fraunces" fontSize="15" fontWeight="350"
              fill="var(--ink)" fontStyle="italic" textAnchor="end" letterSpacing="-0.005em">Halden K.</text>
        <text x="-18" y="22" fontFamily="Geist Mono" fontSize="10" fill="var(--ink-3)"
              textAnchor="end" letterSpacing="0.06em">0x55AB · 7.81</text>
      </g>
    </svg>
  )
}
