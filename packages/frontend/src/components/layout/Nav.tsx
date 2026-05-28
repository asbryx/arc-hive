import { NavLink } from 'react-router-dom'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useStats, useIndexerHealth } from '@/api/hooks'
import styles from './Nav.module.css'

export default function Nav() {
  const { data: stats } = useStats()
  const { data: health } = useIndexerHealth()

  const isLive = !!stats
  const isSyncing = health?.syncing ?? false

  return (
    <nav className={styles.nav}>
      <NavLink to="/" className={styles.logo}>ArcHive</NavLink>
      <ul className={styles.links}>
        <li><NavLink to="/" className={({ isActive }) => isActive ? styles.active : ''}>dashboard</NavLink></li>
        <li><NavLink to="/agents" className={({ isActive }) => isActive ? styles.active : ''}>agents</NavLink></li>
        <li><NavLink to="/jobs" className={({ isActive }) => isActive ? styles.active : ''}>jobs</NavLink></li>
        <li><NavLink to="/leaderboard" className={({ isActive }) => isActive ? styles.active : ''}>leaderboard</NavLink></li>
        <li><NavLink to="/dashboard" className={({ isActive }) => isActive ? styles.active : ''}>my jobs</NavLink></li>
      </ul>
      <div className={styles.status}>
        <span className={isLive ? 'pulse-live' : ''} style={{ color: isLive ? '#00ff00' : '#ff4444' }}>●</span>
        {' '}{isSyncing ? 'syncing' : isLive ? 'live' : 'offline'} · {stats ? `${stats.totalAgents.toLocaleString()} agents` : '...'}
      </div>
      <div className={styles.wallet}>
        <ConnectButton accountStatus="address" chainStatus="none" showBalance={true} />
      </div>
    </nav>
  )
}
