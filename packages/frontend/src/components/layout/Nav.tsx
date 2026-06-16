import { NavLink } from 'react-router-dom'
import { useAccount, useDisconnect } from 'wagmi'
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
    const compute = () => {
      const touch = navigator.maxTouchPoints > 0
      const narrow = window.matchMedia('(max-width: 1024px)').matches
      setIsMobile(touch && narrow)
    }
    compute()
    const mq = window.matchMedia('(max-width: 1024px)')
    mq.addEventListener('change', compute)
    return () => mq.removeEventListener('change', compute)
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
      <li><NavLink to="/" end className={({ isActive }) => isActive ? styles.active : ''}>Map</NavLink></li>
      <li><NavLink to="/marketplace" className={({ isActive }) => isActive ? styles.active : ''}>Briefs</NavLink></li>
      <li><NavLink to="/agents" className={({ isActive }) => isActive ? styles.active : ''}>Agents</NavLink></li>
      <li><NavLink to="/leaderboard" className={({ isActive }) => isActive ? styles.active : ''}>Ranks</NavLink></li>
      <li><NavLink to="/post-job" className={({ isActive }) => isActive ? styles.active : ''}>Post</NavLink></li>
      <li><NavLink to="/dashboard" className={({ isActive }) => isActive ? styles.active : ''}>Dashboard</NavLink></li>
      <li><NavLink to="/docs" className={({ isActive }) => isActive ? styles.active : ''}>Docs</NavLink></li>
    </>
  )

  const actions = (
    <div className={styles.actions}>
      <button
        onClick={toggle}
        title={theme === 'dark' ? 'Switch to light edition' : 'Switch to dark edition'}
        aria-label={theme === 'dark' ? 'Switch to light edition' : 'Switch to dark edition'}
        className={styles.themeBtn}
      >
        {theme === 'dark' ? '☀' : '☾'}
      </button>
      {isConnected ? (
        <button
          onClick={() => disconnect()}
          aria-label={`Disconnect wallet ${truncateAddr(address!)}`}
          className={styles.walletBtn}
        >
          {truncateAddr(address!)} ✕
        </button>
      ) : (
        <button
          onClick={() => openConnectModal?.()}
          aria-label="Connect wallet"
          className={styles.connectBtn}
        >
          Connect wallet ↗
        </button>
      )}
    </div>
  )

  if (isMobile) {
    return (
      <>
        <nav className={styles.nav} aria-label="Top navigation">
          <NavLink to="/" className={styles.logo}>
            arc<em>·</em>hive
          </NavLink>
          {actions}
        </nav>
        <ul className={styles.bottomLinks} role="navigation" aria-label="Main navigation">
          {navLinks}
        </ul>
      </>
    )
  }

  return (
    <nav className={styles.nav} aria-label="Main navigation">
      <NavLink to="/" className={styles.logo}>
        arc<em>·</em>hive
        <span className={styles.edition}>· cartographic registry</span>
      </NavLink>
      <ul className={styles.links}>
        {navLinks}
      </ul>
      {actions}
    </nav>
  )
}
