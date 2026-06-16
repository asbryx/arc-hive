import { NavLink } from 'react-router-dom'
import { useAccount, useDisconnect } from 'wagmi'
import { useConnectModal } from '@rainbow-me/rainbowkit'
import { useEffect, useState } from 'react'
import { useStats } from '@/api/hooks'
import { Button } from '@/components/ui/Button'

function truncateAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const touch = navigator.maxTouchPoints > 0
    const narrow = window.matchMedia('(max-width: 900px)').matches
    setIsMobile(touch && narrow)
  }, [])
  return isMobile
}

const LINKS: Array<{ to: string; label: string }> = [
  { to: '/marketplace',  label: 'Marketplace' },
  { to: '/agents',       label: 'Agents' },
  { to: '/leaderboard',  label: 'Leaderboard' },
  { to: '/dashboard',    label: 'Dashboard' },
  { to: '/docs',         label: 'Docs' },
]

export default function Nav() {
  const { address, isConnected } = useAccount()
  const { openConnectModal } = useConnectModal()
  const { disconnect } = useDisconnect()
  const isMobile = useIsMobile()
  const { data: stats } = useStats()
  const activeCount = (stats as any)?.data?.active_agents_24h ?? (stats as any)?.active_agents_24h

  return (
    <nav
      aria-label="Main navigation"
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0,
        zIndex: 100,
        background: 'var(--cream)',
        borderBottom: '1px solid var(--ink)',
        height: 'var(--nav-height)',
        display: 'grid',
        gridTemplateColumns: '1fr auto 1fr',
        alignItems: 'center',
        padding: '0 var(--gutter)',
      }}
    >
      {/* Left: brand + section links */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-6)', minWidth: 0 }}>
        <NavLink
          to="/"
          aria-label="ArcHive home"
          style={{
            fontFamily: 'var(--serif)',
            fontSize: 'var(--t-h4)',
            fontWeight: 300,
            fontStyle: 'italic',
            color: 'var(--ink)',
            letterSpacing: '-0.02em',
            fontVariationSettings: "'wght' 350, 'opsz' 36, 'slnt' -10",
            whiteSpace: 'nowrap',
          }}
        >
          arc<span style={{ color: 'var(--hot)' }}>·</span>hive
        </NavLink>
        {!isMobile && (
          <ul style={{ display: 'flex', gap: 'var(--s-5)', listStyle: 'none', overflow: 'hidden' }}>
            {LINKS.map(l => (
              <li key={l.to}>
                <NavLink
                  to={l.to}
                  style={({ isActive }) => ({
                    fontFamily: 'var(--mono)',
                    fontSize: 'var(--t-mono-sm)',
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    color: isActive ? 'var(--ink)' : 'var(--ink-2)',
                    borderBottom: isActive ? '1px solid var(--ink)' : '1px solid transparent',
                    paddingBottom: 4,
                    whiteSpace: 'nowrap',
                  })}
                >
                  {l.label}
                </NavLink>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Center: live status pill */}
      {!isMobile && (
        <div
          aria-label="Live activity"
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 'var(--t-mono-sm)',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--marsh)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span aria-hidden="true" style={{ width: 6, height: 6, background: 'var(--marsh)', display: 'inline-block' }} />
          <span style={{ color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{activeCount ?? '—'}</span>
          <span style={{ color: 'var(--ink-3)' }}>active · 24h</span>
        </div>
      )}

      {/* Right: actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-3)', justifyContent: 'flex-end' }}>
        <NavLink
          to="/post-job"
          aria-label="Post a job"
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 'var(--t-mono-sm)',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--ink)',
            border: '1px solid var(--ink)',
            padding: '6px 12px',
            whiteSpace: 'nowrap',
          }}
        >
          + post
        </NavLink>
        {isConnected && address ? (
          <Button size="sm" variant="ghost" onClick={() => disconnect()} aria-label={`Disconnect wallet ${truncateAddr(address)}`}>
            {truncateAddr(address)} ✕
          </Button>
        ) : (
          <Button size="sm" variant="primary" onClick={() => openConnectModal?.()} aria-label="Connect wallet">
            connect ↗
          </Button>
        )}
      </div>

      {/* Mobile: bottom link bar */}
      {isMobile && (
        <ul
          role="navigation"
          aria-label="Section links"
          style={{
            position: 'fixed',
            left: 0, right: 0, bottom: 0,
            listStyle: 'none',
            display: 'grid',
            gridTemplateColumns: `repeat(${LINKS.length}, 1fr)`,
            background: 'var(--cream)',
            borderTop: '1px solid var(--ink)',
            zIndex: 100,
            padding: 'var(--s-2) 0',
          }}
        >
          {LINKS.map(l => (
            <li key={l.to} style={{ display: 'flex', justifyContent: 'center' }}>
              <NavLink
                to={l.to}
                style={({ isActive }) => ({
                  fontFamily: 'var(--mono)',
                  fontSize: 'var(--t-micro)',
                  letterSpacing: '0.10em',
                  textTransform: 'uppercase',
                  color: isActive ? 'var(--ink)' : 'var(--ink-2)',
                  borderBottom: isActive ? '1px solid var(--ink)' : '1px solid transparent',
                  padding: '8px 4px',
                  textAlign: 'center',
                })}
              >
                {l.label}
              </NavLink>
            </li>
          ))}
        </ul>
      )}
    </nav>
  )
}
