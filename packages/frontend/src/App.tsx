import { Routes, Route } from 'react-router-dom'
import { ErrorBoundary } from './components/ErrorBoundary'
import Nav from './components/layout/Nav'
import { Breadcrumbs } from './components/layout/Breadcrumbs'
import BottomBar from './components/layout/BottomBar'
import BackgroundCanvas from './components/BackgroundCanvas'
import BackendOfflineBanner from './components/BackendOfflineBanner'
import Home from './pages/Home'
// Agents cluster — broadsheet redesign (real-data wired). Old pages
// (Agents, AgentProfile, HireAgent, Leaderboard) remain on disk, unimported.
import Register from './pages/Register'
import Dossier from './pages/Dossier'
import Commission from './pages/Commission'
import HonorRoll from './pages/HonorRoll'
import Jobs from './pages/Jobs'
import JobDetail from './pages/JobDetail'
import Dashboard from './pages/Dashboard'
import Marketplace from './pages/Marketplace'
import MarketplaceDetail from './pages/MarketplaceDetail'
import PostJob from './pages/PostJob'
import MyJobs from './pages/MyJobs'
import NotFound from './pages/NotFound'
import Docs from './pages/Docs'

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
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/agents" element={<Register />} />
          <Route path="/agents/:id" element={<Dossier />} />
          <Route path="/agents/:id/hire" element={<Commission />} />
          <Route path="/explore" element={<Jobs />} />
          <Route path="/explore/:id" element={<JobDetail />} />
          <Route path="/leaderboard" element={<HonorRoll />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/marketplace" element={<Marketplace />} />
          <Route path="/marketplace/:id" element={<MarketplaceDetail />} />
          <Route path="/post-job" element={<PostJob />} />
          <Route path="/my-jobs" element={<Dashboard />} />
          <Route path="/docs" element={<Docs />} />
          {/* Legacy redirects */}
          <Route path="/jobs" element={<Jobs />} />
          <Route path="/jobs/:id" element={<JobDetail />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <BottomBar />
    </div>
    </ErrorBoundary>
  )
}
