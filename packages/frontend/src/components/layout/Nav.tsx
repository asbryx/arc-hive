import { NavLink } from 'react-router-dom'
import { useAccount, useConnect, useDisconnect } from 'wagmi'
import { useConnectModal } from '@rainbow-me/rainbowkit'
import { useStats, useIndexerHealth } from '@/api/hooks'
import { useTheme } from '@/hooks/useTheme'
import styles from './Nav.module.css'

function truncateAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

export default function Nav() {
  const { data: stats } = useStats()
  const { data: health } = useIndexerHealth()
  const { address, isConnected } = useAccount()
  const { openConnectModal } = useConnectModal()
  const { disconnect } = useDisconnect()
  const { theme, toggle } = useTheme()

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
        <li><NavLink to="/marketplace" className={({ isActive }) => isActive ? styles.active : ''}>marketplace</NavLink></li>
        <li><NavLink to="/dashboard" className={({ isActive }) => isActive ? styles.active : ''}>my jobs</NavLink></li>
      </ul>
      <div className={styles.status}>
        <button
          onClick={toggle}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          style={{
            background: 'transparent',
            border: '1px solid var(--dimmer)',
            color: 'var(--dim)',
            fontSize: 11,
            padding: '3px 8px',
            cursor: 'pointer',
            marginRight: 10,
          }}
        >
          {theme === 'dark' ? '☀' : '●'}
        </button>
        <span className={isLive ? 'pulse-live' : ''} style={{ color: isLive ? '#00ff00' : '#ff4444' }}>●</span>
        {' '}{isSyncing ? 'syncing' : isLive ? 'live' : 'offline'} · {stats ? `${stats.totalAgents.toLocaleString()} agents` : '...'}
      </div>
      <div className={styles.wallet}>
        {isConnected ? (
          <button
            onClick={() => disconnect()}
            style={{
              background: 'transparent',
              border: '1px solid var(--dimmer)',
              color: 'var(--text)',
              fontFamily: 'var(--font)',
              fontSize: 11,
              padding: '5px 10px',
              cursor: 'pointer',
              letterSpacing: '0.5px',
            }}
          >
            {truncateAddr(address!)} ✕
          </button>
        ) : (
          <button
            onClick={() => openConnectModal?.()}
            style={{
              background: 'transparent',
              border: '1px solid var(--accent)',
              color: 'var(--accent)',
              fontFamily: 'var(--font)',
              fontSize: 11,
              padding: '5px 10px',
              cursor: 'pointer',
              letterSpacing: '0.5px',
            }}
          >
            [connect ↗]
          </button>
        )}
      </div>
    </nav>
  )
}
