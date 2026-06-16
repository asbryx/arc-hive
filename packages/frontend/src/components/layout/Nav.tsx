/**
 * Nav — broadsheet shell header.
 *
 * Static cream bg, 1px ink rule below, no glass, no blur, no shadow.
 * Left: brand mark, italic Fraunces, marsh accent dot, italic sub-label.
 * Center: section anchors, uppercase mono.
 * Right: live-status pill (real active-agent count) + wallet button.
 *
 * At < 900px the center anchors collapse into a "menu" text link that
 * toggles a stacked sheet of links. No hamburger icon by policy.
 */

import { NavLink, Link } from 'react-router-dom'
import { useAccount, useDisconnect } from 'wagmi'
import { useConnectModal } from '@rainbow-me/rainbowkit'
import { useState } from 'react'
import { useStats } from '@/api/hooks'
import styles from './Nav.module.css'

const SECTIONS: { to: string; label: string }[] = [
  { to: '/',            label: 'home' },
  { to: '/marketplace', label: 'marketplace' },
  { to: '/agents',      label: 'agents' },
  { to: '/leaderboard', label: 'leaderboard' },
  { to: '/dashboard',   label: 'dashboard' },
  { to: '/docs',        label: 'docs' },
]

function shortAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`
}

export default function Nav() {
  const { address, isConnected } = useAccount()
  const { openConnectModal } = useConnectModal()
  const { disconnect } = useDisconnect()
  const { data: stats } = useStats()
  const [menuOpen, setMenuOpen] = useState(false)

  const activeCount = stats?.last7Days?.newAgents ?? null

  return (
    <header className={styles.shell}>
      <nav className={styles.nav} aria-label="Main navigation">
        <Link to="/" className={styles.brand} aria-label="arc-hive home">
          <span className={styles.brandDot} aria-hidden="true" />
          <span className={styles.brandName}><em>arc</em>-hive</span>
          <span className={styles.brandTag} aria-hidden="true">
            — a register of autonomous work —
          </span>
        </Link>

        <ul className={styles.links}>
          {SECTIONS.map(s => (
            <li key={s.to}>
              <NavLink
                end={s.to === '/'}
                to={s.to}
                className={({ isActive }) =>
                  isActive ? `${styles.link} ${styles.linkActive}` : styles.link
                }
              >
                {s.label}
              </NavLink>
            </li>
          ))}
        </ul>

        <div className={styles.actions}>
          <span className={styles.live} aria-label="live activity">
            <span className={styles.liveDot} aria-hidden="true" />
            {activeCount != null ? activeCount : '—'} active
          </span>
          {isConnected && address ? (
            <button
              type="button"
              onClick={() => disconnect()}
              className={styles.wallet}
              aria-label={`Disconnect wallet ${shortAddr(address)}`}
            >
              {shortAddr(address)} <span aria-hidden="true">×</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => openConnectModal?.()}
              className={styles.wallet}
              aria-label="Connect wallet"
            >
              connect ↗
            </button>
          )}
          <button
            type="button"
            onClick={() => setMenuOpen(v => !v)}
            className={styles.menuToggle}
            aria-expanded={menuOpen}
            aria-controls="nav-menu-sheet"
          >
            {menuOpen ? 'close' : 'menu'}
          </button>
        </div>
      </nav>

      {menuOpen && (
        <ul id="nav-menu-sheet" className={styles.sheet}>
          {SECTIONS.map(s => (
            <li key={s.to}>
              <NavLink
                end={s.to === '/'}
                to={s.to}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) =>
                  isActive
                    ? `${styles.sheetLink} ${styles.linkActive}`
                    : styles.sheetLink
                }
              >
                {s.label}
              </NavLink>
            </li>
          ))}
        </ul>
      )}
    </header>
  )
}
