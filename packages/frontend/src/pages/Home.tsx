import BroadsheetHero from '@/components/home/BroadsheetHero'
import LegendBand from '@/components/home/LegendBand'
import SettledMarquee from '@/components/home/SettledMarquee'
import LotGrid from '@/components/home/LotGrid'
import DashboardGlimpse from '@/components/home/DashboardGlimpse'

/**
 * Home — broadsheet · ii.
 *
 * Vertical stack, hairline-ruled, full-bleed. Read top-to-bottom:
 *   I.   Cartographic plate (live agents + flight lines)
 *   II.  Legend band (the chart key)
 *   III. Settled marquee (recent settlements crawl)
 *   IV.  Lot grid (open briefs, the auction floor)
 *   V.   Dashboard glimpse (ledger summary)
 *
 * No 900px container — the hero plate gets full width, sections own
 * their own padding. Real data via existing TanStack Query hooks.
 */
export default function Home() {
  return (
    <div className="page-enter" style={{ paddingBottom: 0 }}>
      <BroadsheetHero />
      <LegendBand />
      <SettledMarquee />
      <LotGrid />
      <DashboardGlimpse />
    </div>
  )
}
