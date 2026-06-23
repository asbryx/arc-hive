import { Routes, Route } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { ErrorBoundary } from './components/ErrorBoundary'
import Nav from './components/layout/Nav'
import { Breadcrumbs } from './components/layout/Breadcrumbs'
import BottomBar from './components/layout/BottomBar'
import BackgroundCanvas from './components/BackgroundCanvas'
import BackendOfflineBanner from './components/BackendOfflineBanner'
// Home + NotFound stay eager: Home is the landing route (no point deferring the
// first paint behind a chunk fetch) and NotFound is the tiny catch-all fallback.
import Home from './pages/Home'
import NotFound from './pages/NotFound'

// Interior pages are route-split via React.lazy so they no longer ship in the
// initial bundle (audit L1-1: single 1MB index chunk). This splits PER ROUTE and
// deliberately does NOT touch manualChunks — over-splitting the React/query
// vendor chunk previously white-screened the site ("createContext undefined").
// Route-level lazy has no such vendor load-order hazard.
// Agents cluster — broadsheet redesign (real-data wired).
const Register = lazy(() => import('./pages/Register'))
const Dossier = lazy(() => import('./pages/Dossier'))
const Commission = lazy(() => import('./pages/Commission'))
const HonorRoll = lazy(() => import('./pages/HonorRoll'))
const Jobs = lazy(() => import('./pages/Jobs'))
const JobDetail = lazy(() => import('./pages/JobDetail'))
// Dashboard cluster — broadsheet redesign (real-data wired).
const TheLedger = lazy(() => import('./pages/TheLedger'))
const MyDesk = lazy(() => import('./pages/MyDesk'))
// Marketplace cluster — broadsheet redesign (real-data wired).
const Marketplace = lazy(() => import('./pages/Marketplace'))
const CaseFile = lazy(() => import('./pages/CaseFile'))
const ComposingRoom = lazy(() => import('./pages/ComposingRoom'))
const Docs = lazy(() => import('./pages/Docs'))

export default function App() {
  return (
    <ErrorBoundary>
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <BackgroundCanvas />
      {/* Audit fix T7: surface backend outages so users don't sign tx during a 502 */}
      <BackendOfflineBanner />
      <Nav />
      {/* T-AC01: ARIA label for main landmark + skip link target */}
      <main id="main-content" style={{ flex: 1, paddingTop: 48, paddingBottom: 60 }} aria-label="Main content">
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 24px' }}>
          <Breadcrumbs />
        </div>
        <Suspense fallback={<div style={{ padding: '4rem 24px', textAlign: 'center', opacity: 0.6 }}>Loading…</div>}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/agents" element={<Register />} />
            <Route path="/agents/:id" element={<Dossier />} />
            <Route path="/agents/:id/hire" element={<Commission />} />
            <Route path="/explore" element={<Jobs />} />
            <Route path="/explore/:id" element={<JobDetail />} />
            <Route path="/leaderboard" element={<HonorRoll />} />
            <Route path="/dashboard" element={<TheLedger />} />
            <Route path="/marketplace" element={<Marketplace />} />
            <Route path="/marketplace/:id" element={<CaseFile />} />
            <Route path="/post-job" element={<ComposingRoom />} />
            <Route path="/my-jobs" element={<MyDesk />} />
            <Route path="/docs" element={<Docs />} />
            {/* Legacy redirects */}
            <Route path="/jobs" element={<Jobs />} />
            <Route path="/jobs/:id" element={<JobDetail />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </main>
      <BottomBar />
    </div>
    </ErrorBoundary>
  )
}
