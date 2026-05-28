import { Routes, Route } from 'react-router-dom'
import Nav from './components/layout/Nav'
import BottomBar from './components/layout/BottomBar'
import Home from './pages/Home'
import Agents from './pages/Agents'
import AgentProfile from './pages/AgentProfile'
import Jobs from './pages/Jobs'
import JobDetail from './pages/JobDetail'
import Leaderboard from './pages/Leaderboard'
import HireAgent from './pages/HireAgent'
import Dashboard from './pages/Dashboard'
import Marketplace from './pages/Marketplace'
import MarketplaceDetail from './pages/MarketplaceDetail'
import PostJob from './pages/PostJob'
import NotFound from './pages/NotFound'

export default function App() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Nav />
      <main style={{ flex: 1, paddingTop: 48, paddingBottom: 60 }}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/agents" element={<Agents />} />
          <Route path="/agents/:id" element={<AgentProfile />} />
          <Route path="/agents/:id/hire" element={<HireAgent />} />
          <Route path="/jobs" element={<Jobs />} />
          <Route path="/jobs/:id" element={<JobDetail />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/marketplace" element={<Marketplace />} />
          <Route path="/marketplace/:id" element={<MarketplaceDetail />} />
          <Route path="/post-job" element={<PostJob />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <BottomBar />
    </div>
  )
}
