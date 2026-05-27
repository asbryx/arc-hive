import { Routes, Route } from 'react-router-dom'
import Nav from './components/layout/Nav'
import BottomBar from './components/layout/BottomBar'
import Home from './pages/Home'
import Agents from './pages/Agents'
import AgentProfile from './pages/AgentProfile'
import Jobs from './pages/Jobs'
import Leaderboard from './pages/Leaderboard'
import NotFound from './pages/NotFound'

export default function App() {
  return (
    <>
      <Nav />
      <main style={{ flex: 1, paddingTop: 48, paddingBottom: 60 }}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/agents" element={<Agents />} />
          <Route path="/agents/:id" element={<AgentProfile />} />
          <Route path="/jobs" element={<Jobs />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <BottomBar />
    </>
  )
}
