/**
 * SigilDefs — single hidden <svg> with 32 reusable <symbol> base shapes.
 *
 * Mounted once at the App root. Every Sigil <use href="#sigil-base-NN"/>
 * resolves into the corresponding symbol. Strokes use currentColor so the
 * caller's color cascades into the symbol.
 *
 * Shapes 0–5 are the hand-drawn mockup-27 sigils (see references/glyphs.md).
 * Shapes 6–31 are procedural variants — rotated polygons, nested squares,
 * vesicae, chevrons, hatches — so that hash-mapped seeds never collide in
 * a screenful.
 */

const STROKE = 1.5

export default function SigilDefs() {
  return (
    <svg
      aria-hidden="true"
      width="0"
      height="0"
      style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}
    >
      <defs>
        {/* 0 — Lyra Synthwright (mockup) */}
        <symbol id="sigil-base-00" viewBox="-12 -12 24 24">
          <circle cx="0" cy="0"  r="9" fill="none" stroke="currentColor" strokeWidth={STROKE}/>
          <circle cx="0" cy="-5" r="2" fill="currentColor"/>
          <line x1="-6" y1="4" x2="6" y2="4" stroke="currentColor" strokeWidth={STROKE}/>
        </symbol>

        {/* 1 — Carter & Vale (mockup) */}
        <symbol id="sigil-base-01" viewBox="-12 -12 24 24">
          <rect x="-8" y="-8" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={STROKE}/>
          <line x1="-8" y1="-8" x2="8"  y2="8"  stroke="currentColor" strokeWidth={STROKE}/>
          <line x1="8"  y1="-8" x2="-8" y2="8"  stroke="currentColor" strokeWidth={STROKE}/>
        </symbol>

        {/* 2 — Thorne Ledger (mockup) */}
        <symbol id="sigil-base-02" viewBox="-12 -12 24 24">
          <polygon points="0,-9 8,5 -8,5" fill="none" stroke="currentColor" strokeWidth={STROKE}/>
          <circle cx="0" cy="0" r="2.5" fill="currentColor"/>
        </symbol>

        {/* 3 — Iris Voss (mockup) */}
        <symbol id="sigil-base-03" viewBox="-12 -12 24 24">
          <path d="M -9 0 Q 0 -9 9 0 Q 0 9 -9 0 Z" fill="none" stroke="currentColor" strokeWidth={STROKE}/>
          <circle cx="0" cy="0" r="2" fill="currentColor"/>
        </symbol>

        {/* 4 — Verity & Bell (mockup) */}
        <symbol id="sigil-base-04" viewBox="-12 -12 24 24">
          <line x1="-9" y1="0" x2="9" y2="0" stroke="currentColor" strokeWidth={STROKE}/>
          <line x1="0" y1="-9" x2="0" y2="9" stroke="currentColor" strokeWidth={STROKE}/>
          <circle cx="0" cy="0" r="3" fill="none" stroke="currentColor" strokeWidth={STROKE}/>
        </symbol>

        {/* 5 — Halden Court (mockup) */}
        <symbol id="sigil-base-05" viewBox="-12 -12 24 24">
          <rect x="-7" y="-7" width="14" height="14" fill="none" stroke="currentColor" strokeWidth={STROKE}/>
          <rect x="-3" y="-3" width="6"  height="6"  fill="currentColor"/>
        </symbol>

        {/* 6 — nested square */}
        <symbol id="sigil-base-06" viewBox="-12 -12 24 24">
          <rect x="-9" y="-9" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={STROKE}/>
          <rect x="-5" y="-5" width="10" height="10" fill="none" stroke="currentColor" strokeWidth={STROKE}/>
        </symbol>

        {/* 7 — triangle outline */}
        <symbol id="sigil-base-07" viewBox="-12 -12 24 24">
          <polygon points="0,-9 9,7 -9,7" fill="none" stroke="currentColor" strokeWidth={STROKE}/>
        </symbol>

        {/* 8 — concentric circles */}
        <symbol id="sigil-base-08" viewBox="-12 -12 24 24">
          <circle cx="0" cy="0" r="9" fill="none" stroke="currentColor" strokeWidth={STROKE}/>
          <circle cx="0" cy="0" r="4.5" fill="none" stroke="currentColor" strokeWidth={STROKE}/>
        </symbol>

        {/* 9 — chevron up */}
        <symbol id="sigil-base-09" viewBox="-12 -12 24 24">
          <polyline points="-8,3 0,-6 8,3" fill="none" stroke="currentColor" strokeWidth={STROKE} strokeLinecap="square"/>
          <polyline points="-8,8 0,-1 8,8" fill="none" stroke="currentColor" strokeWidth={STROKE} strokeLinecap="square"/>
        </symbol>

        {/* 10 — diamond outline */}
        <symbol id="sigil-base-10" viewBox="-12 -12 24 24">
          <polygon points="0,-9 9,0 0,9 -9,0" fill="none" stroke="currentColor" strokeWidth={STROKE}/>
        </symbol>

        {/* 11 — hexagon */}
        <symbol id="sigil-base-11" viewBox="-12 -12 24 24">
          <polygon points="-8,-4.6 0,-9 8,-4.6 8,4.6 0,9 -8,4.6" fill="none" stroke="currentColor" strokeWidth={STROKE}/>
        </symbol>

        {/* 12 — vesica with bar */}
        <symbol id="sigil-base-12" viewBox="-12 -12 24 24">
          <path d="M -9 0 Q 0 -9 9 0 Q 0 9 -9 0 Z" fill="none" stroke="currentColor" strokeWidth={STROKE}/>
          <line x1="-9" y1="0" x2="9" y2="0" stroke="currentColor" strokeWidth={STROKE}/>
        </symbol>

        {/* 13 — square with diagonal */}
        <symbol id="sigil-base-13" viewBox="-12 -12 24 24">
          <rect x="-8" y="-8" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={STROKE}/>
          <line x1="-8" y1="-8" x2="8" y2="8" stroke="currentColor" strokeWidth={STROKE}/>
        </symbol>

        {/* 14 — circle + cross */}
        <symbol id="sigil-base-14" viewBox="-12 -12 24 24">
          <circle cx="0" cy="0" r="8" fill="none" stroke="currentColor" strokeWidth={STROKE}/>
          <line x1="-8" y1="0" x2="8" y2="0" stroke="currentColor" strokeWidth={STROKE}/>
          <line x1="0" y1="-8" x2="0" y2="8" stroke="currentColor" strokeWidth={STROKE}/>
        </symbol>

        {/* 15 — three horizontal bars */}
        <symbol id="sigil-base-15" viewBox="-12 -12 24 24">
          <line x1="-8" y1="-5" x2="8" y2="-5" stroke="currentColor" strokeWidth={STROKE}/>
          <line x1="-8" y1="0"  x2="8" y2="0"  stroke="currentColor" strokeWidth={STROKE}/>
          <line x1="-8" y1="5"  x2="8" y2="5"  stroke="currentColor" strokeWidth={STROKE}/>
        </symbol>

        {/* 16 — square with center dot */}
        <symbol id="sigil-base-16" viewBox="-12 -12 24 24">
          <rect x="-8" y="-8" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={STROKE}/>
          <circle cx="0" cy="0" r="2" fill="currentColor"/>
        </symbol>

        {/* 17 — pentagon */}
        <symbol id="sigil-base-17" viewBox="-12 -12 24 24">
          <polygon points="0,-9 8.6,-2.8 5.3,7.3 -5.3,7.3 -8.6,-2.8" fill="none" stroke="currentColor" strokeWidth={STROKE}/>
        </symbol>

        {/* 18 — arrow right (notarial mark) */}
        <symbol id="sigil-base-18" viewBox="-12 -12 24 24">
          <line x1="-8" y1="0" x2="6" y2="0" stroke="currentColor" strokeWidth={STROKE}/>
          <polyline points="2,-4 8,0 2,4" fill="none" stroke="currentColor" strokeWidth={STROKE} strokeLinecap="square"/>
        </symbol>

        {/* 19 — half-moon */}
        <symbol id="sigil-base-19" viewBox="-12 -12 24 24">
          <path d="M -4 -8 A 8 8 0 1 0 -4 8 A 5 5 0 1 1 -4 -8 Z" fill="currentColor" stroke="currentColor" strokeWidth={STROKE}/>
        </symbol>

        {/* 20 — cross hatch */}
        <symbol id="sigil-base-20" viewBox="-12 -12 24 24">
          <line x1="-9" y1="-3" x2="9" y2="-3" stroke="currentColor" strokeWidth={STROKE}/>
          <line x1="-9" y1="3"  x2="9" y2="3"  stroke="currentColor" strokeWidth={STROKE}/>
          <line x1="-3" y1="-9" x2="-3" y2="9" stroke="currentColor" strokeWidth={STROKE}/>
          <line x1="3"  y1="-9" x2="3"  y2="9" stroke="currentColor" strokeWidth={STROKE}/>
        </symbol>

        {/* 21 — triangle + line */}
        <symbol id="sigil-base-21" viewBox="-12 -12 24 24">
          <polygon points="0,-9 8,4 -8,4" fill="none" stroke="currentColor" strokeWidth={STROKE}/>
          <line x1="-9" y1="8" x2="9" y2="8" stroke="currentColor" strokeWidth={STROKE}/>
        </symbol>

        {/* 22 — H */}
        <symbol id="sigil-base-22" viewBox="-12 -12 24 24">
          <line x1="-6" y1="-8" x2="-6" y2="8" stroke="currentColor" strokeWidth={STROKE}/>
          <line x1="6"  y1="-8" x2="6"  y2="8" stroke="currentColor" strokeWidth={STROKE}/>
          <line x1="-6" y1="0"  x2="6"  y2="0" stroke="currentColor" strokeWidth={STROKE}/>
        </symbol>

        {/* 23 — double diamond */}
        <symbol id="sigil-base-23" viewBox="-12 -12 24 24">
          <polygon points="0,-9 9,0 0,9 -9,0" fill="none" stroke="currentColor" strokeWidth={STROKE}/>
          <polygon points="0,-4 4,0 0,4 -4,0" fill="currentColor"/>
        </symbol>

        {/* 24 — sun rays */}
        <symbol id="sigil-base-24" viewBox="-12 -12 24 24">
          <circle cx="0" cy="0" r="3" fill="currentColor"/>
          <line x1="0" y1="-9" x2="0" y2="-5" stroke="currentColor" strokeWidth={STROKE}/>
          <line x1="0" y1="9"  x2="0" y2="5"  stroke="currentColor" strokeWidth={STROKE}/>
          <line x1="-9" y1="0" x2="-5" y2="0" stroke="currentColor" strokeWidth={STROKE}/>
          <line x1="9"  y1="0" x2="5"  y2="0" stroke="currentColor" strokeWidth={STROKE}/>
          <line x1="-6.4" y1="-6.4" x2="-3.5" y2="-3.5" stroke="currentColor" strokeWidth={STROKE}/>
          <line x1="6.4"  y1="6.4"  x2="3.5"  y2="3.5"  stroke="currentColor" strokeWidth={STROKE}/>
          <line x1="-6.4" y1="6.4"  x2="-3.5" y2="3.5"  stroke="currentColor" strokeWidth={STROKE}/>
          <line x1="6.4"  y1="-6.4" x2="3.5"  y2="-3.5" stroke="currentColor" strokeWidth={STROKE}/>
        </symbol>

        {/* 25 — circle + diagonal */}
        <symbol id="sigil-base-25" viewBox="-12 -12 24 24">
          <circle cx="0" cy="0" r="8" fill="none" stroke="currentColor" strokeWidth={STROKE}/>
          <line x1="-6" y1="-6" x2="6" y2="6" stroke="currentColor" strokeWidth={STROKE}/>
        </symbol>

        {/* 26 — three dots vertical */}
        <symbol id="sigil-base-26" viewBox="-12 -12 24 24">
          <circle cx="0" cy="-6" r="2" fill="currentColor"/>
          <circle cx="0" cy="0"  r="2" fill="currentColor"/>
          <circle cx="0" cy="6"  r="2" fill="currentColor"/>
        </symbol>

        {/* 27 — square + half diagonal */}
        <symbol id="sigil-base-27" viewBox="-12 -12 24 24">
          <rect x="-8" y="-8" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={STROKE}/>
          <polygon points="-8,8 8,-8 8,8" fill="currentColor" opacity="0.4"/>
        </symbol>

        {/* 28 — circle + square overlap */}
        <symbol id="sigil-base-28" viewBox="-12 -12 24 24">
          <circle cx="0" cy="0" r="8" fill="none" stroke="currentColor" strokeWidth={STROKE}/>
          <rect x="-5" y="-5" width="10" height="10" fill="none" stroke="currentColor" strokeWidth={STROKE}/>
        </symbol>

        {/* 29 — four dots */}
        <symbol id="sigil-base-29" viewBox="-12 -12 24 24">
          <circle cx="-5" cy="-5" r="2" fill="currentColor"/>
          <circle cx="5"  cy="-5" r="2" fill="currentColor"/>
          <circle cx="-5" cy="5"  r="2" fill="currentColor"/>
          <circle cx="5"  cy="5"  r="2" fill="currentColor"/>
          <rect x="-8" y="-8" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={STROKE}/>
        </symbol>

        {/* 30 — wave */}
        <symbol id="sigil-base-30" viewBox="-12 -12 24 24">
          <path d="M -9 -2 Q -4.5 -7 0 -2 T 9 -2" fill="none" stroke="currentColor" strokeWidth={STROKE}/>
          <path d="M -9 5  Q -4.5 0  0 5  T 9 5"  fill="none" stroke="currentColor" strokeWidth={STROKE}/>
        </symbol>

        {/* 31 — eye / vesica + horizontal line */}
        <symbol id="sigil-base-31" viewBox="-12 -12 24 24">
          <path d="M -9 0 Q 0 -7 9 0 Q 0 7 -9 0 Z" fill="none" stroke="currentColor" strokeWidth={STROKE}/>
          <circle cx="0" cy="0" r="2.5" fill="currentColor"/>
          <line x1="-9" y1="0" x2="9" y2="0" stroke="currentColor" strokeWidth={STROKE} opacity="0.25"/>
        </symbol>
      </defs>
    </svg>
  )
}
