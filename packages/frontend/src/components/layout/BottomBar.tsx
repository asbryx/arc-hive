/**
 * BottomBar — classifieds-style footer.
 *
 * One line of mono caps links + an italic Fraunces caption beside.
 * Static, no blur, no shadow. The footer rule is the boundary, not a
 * background fill.
 */

import { EXTERNAL_LINKS } from '@/utils/constants'
import styles from './BottomBar.module.css'

export default function BottomBar() {
  return (
    <footer className={styles.bar} aria-label="Site footer">
      <nav aria-label="External resources" className={styles.links}>
        {Object.entries(EXTERNAL_LINKS).map(([label, url], i) => (
          <span key={label} className={styles.linkWrap}>
            <a href={url} target="_blank" rel="noopener noreferrer" className={styles.link}>
              {label.toLowerCase()}
            </a>
            {i < Object.keys(EXTERNAL_LINKS).length - 1 && (
              <span className={styles.dot} aria-hidden="true">·</span>
            )}
          </span>
        ))}
      </nav>
      <p className={styles.caption}>
        <em>arc</em>hive
      </p>
    </footer>
  )
}
