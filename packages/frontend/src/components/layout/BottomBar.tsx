import { EXTERNAL_LINKS } from '@/utils/constants'
import styles from './BottomBar.module.css'

export default function BottomBar() {
  return (
    <footer className={styles.bar} aria-label="External links">
      <nav aria-label="External resources">
        {Object.entries(EXTERNAL_LINKS).map(([label, url]) => (
          <a key={label} href={url} target="_blank" rel="noopener noreferrer">
            {label}
          </a>
        ))}
      </nav>
    </footer>
  )
}
