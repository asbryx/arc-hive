/**
 * Home — broadsheet · ii.
 *
 * Four full-bleed sections plus glue:
 *   i  · territory (cartogram)        ← Hero
 *      · settled marquee              ← SettledMarquee
 *      · legend band
 *   ii · the roster, ranked           ← RanksLedger
 *   iii· the rest of the floor        ← LotsSection
 *   iv · the ledger                   ← SettledLedger
 *      · the day so far               ← DashboardGlimpse
 *
 * The footer is the broadsheet BottomBar, mounted at App level.
 */

import Hero from '../components/home/Hero'
import SettledMarquee from '../components/home/SettledMarquee'
import RanksLedger from '../components/home/RanksLedger'
import LotsSection from '../components/home/LotsSection'
import SettledLedger from '../components/home/SettledLedger'
import DashboardGlimpse from '../components/home/DashboardGlimpse'
import '../components/home/home.css'

export default function Home() {
  return (
    <>
      <Hero />
      <SettledMarquee />
      <RanksLedger />
      <LotsSection />
      <SettledLedger />
      <DashboardGlimpse />
    </>
  )
}
