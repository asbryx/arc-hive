import { NavLink } from 'react-router-dom'
import { useAccount, useConnect, useDisconnect } from 'wagmi'
import { useConnectModal } from '@rainbow-me/rainbowkit'
import { useTheme } from '@/hooks/useTheme'
import { useState, useEffect } from 'react'
import styles from './Nav.module.css'

function truncateAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    // Detect touch device via maxTouchPoints — works even in desktop mode
    const touch = navigator.maxTouchPoints > 0
    // Also check screen width (physical pixels)
    const narrow = window.screen.width <= 1400
    setIsMobile(touch && narrow)
  }, [])
  return isMobile
}

export default function Nav() {
  const { address, isConnected } = useAccount()
  const { openConnectModal } = useConnectModal()
  const { disconnect } = useDisconnect()
  const { theme, toggle } = useTheme()
  const isMobile = useIsMobile()

  const navLinks = (
    <>
      <li><NavLink to="/dashboard" className={({ isActive }) => isActive ? styles.active : ''}>Dashboard</NavLink></li>
      <li><NavLink to="/marketplace" className={({ isActive }) => isActive ? styles.active : ''}>Marketplace</NavLink></li>
      <li><NavLink to="/explore" className={({ isActive }) => isActive ? styles.active : ''}>Explore</NavLink></li>
      <li><NavLink to="/agents" className={({ isActive }) => isActive ? styles.active : ''}>Agents</NavLink></li>
      <li><NavLink to="/leaderboard" className={({ isActive }) => isActive ? styles.active : ''}>Leaderboard</NavLink></li>
    </>
  )

  const actions = (
    <div className={styles.actions}>
      <button
        onClick={toggle}
        title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        style={{
          background: 'transparent',
          border: '1px solid var(--dimmer)',
          color: 'var(--dim)',
          fontSize: 11,
          padding: '3px 8px',
          cursor: 'pointer',
        }}
      >
        {theme === 'dark' ? '☀' : '☾'}
      </button>
      {isConnected ? (
        <button
          onClick={() => disconnect()}
          aria-label={`Disconnect wallet ${truncateAddr(address!)}`}
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
          aria-label="Connect wallet"
          style={{
            background: 'transparent',
            border: '1px solid var(--accent)',
            color: 'var(--text)',
            fontFamily: 'var(--font)',
            fontSize: 11,
            padding: '5px 10px',
            cursor: 'pointer',
            letterSpacing: '0.5px',
          }}
        >
          [Connect ↗]
        </button>
      )}
    </div>
  )

  if (isMobile) {
    // Mobile: top bar = logo + actions only. Links at bottom.
    return (
      <>
        {/* T-AC01: ARIA labels for navigation landmarks */}
        <nav className={styles.nav} aria-label="Mobile navigation">
          <NavLink to="/" className={styles.logo}>
            <img src="/assets/logo.png" alt="" style={{ height: 20, width: 'auto', marginRight: 6, verticalAlign: 'middle' }} />
            ArcHive
          </NavLink>
          {actions}
        </nav>
        <ul className={styles.bottomLinks} role="navigation" aria-label="Main navigation">
          {navLinks}
        </ul>
      </>
    )
  }

  // Desktop: everything in one bar
  return (
    <nav className={styles.nav} aria-label="Main navigation">
      <NavLink to="/" className={styles.logo}>
        <img src="/assets/logo.png" alt="" style={{ height: 20, width: 'auto', marginRight: 6, verticalAlign: 'middle' }} className="nav-logo-img" />
        ArcHive
      </NavLink>
      <ul className={styles.links}>
        {navLinks}
      </ul>
      {actions}
    </nav>
  )
}
