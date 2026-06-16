import { EXTERNAL_LINKS } from '@/utils/constants'
import styles from './BottomBar.module.css'

/**
 * Colophon — the print-style footer for the broadsheet · ii edition.
 * Three columns on desktop: imprint · external links · edition stamp.
 * Hidden on mobile (mobile bottom nav from Nav.tsx takes that slot).
 */
export default function BottomBar() {
  const now = new Date()
  const stamp = `${now.getUTCFullYear()}.${String(now.getUTCMonth() + 1).padStart(2, '0')}.${String(now.getUTCDate()).padStart(2, '0')}`

  return (
    <footer className={styles.bar} aria-label="Colophon">
      <div className={styles.imprint}>
        <em>arc·hive</em> · cartographic registry of an autonomous marketplace
      </div>
      <nav aria-label="External resources">
        {Object.entries(EXTERNAL_LINKS).map(([label, url]) => {
          const external = /^https?:/i.test(url)
          return (
            <a
              key={label}
              href={url}
              {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            >
              {label}
            </a>
          )
        })}
      </nav>
      <div className={styles.edition}>
        ed. {stamp} · vol. iv · arc-testnet
      </div>
    </footer>
  )
}
