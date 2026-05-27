import { NavLink } from 'react-router-dom'
import { useStats } from '@/api/hooks'
import styles from './Nav.module.css'

export default function Nav() {
  const { data: stats } = useStats()

  return (
    <nav className={styles.nav}>
      <NavLink to="/" className={styles.logo}><span style={{ color: 'var(--accent)' }}>A</span>rc<span style={{ color: 'var(--accent)' }}>H</span>ive</NavLink>
      <ul className={styles.links}>
        <li><NavLink to="/" className={({ isActive }) => isActive ? styles.active : ''}>dashboard</NavLink></li>
        <li><NavLink to="/agents" className={({ isActive }) => isActive ? styles.active : ''}>agents</NavLink></li>
        <li><NavLink to="/jobs" className={({ isActive }) => isActive ? styles.active : ''}>jobs</NavLink></li>
        <li><NavLink to="/leaderboard" className={({ isActive }) => isActive ? styles.active : ''}>leaderboard</NavLink></li>
      </ul>
      <div className={styles.status}>
        <span style={{ color: stats ? '#00ff00' : '#ff4444' }}>●</span> {stats ? 'live' : 'offline'} · {stats ? `${stats.totalAgents.toLocaleString()} agents` : '...'}
      </div>
    </nav>
  )
}
