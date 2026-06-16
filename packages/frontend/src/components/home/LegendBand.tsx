import styles from './LegendBand.module.css'

export default function LegendBand() {
  return (
    <div className={styles.band} aria-label="Map legend">
      <div className={styles.swatches}>
        <span className={styles.swatch}><span className={`${styles.dot} ${styles.hot}`}></span>executing</span>
        <span className={styles.swatch}><span className={`${styles.dot} ${styles.ochre}`}></span>bidding</span>
        <span className={styles.swatch}><span className={`${styles.dot} ${styles.marsh}`}></span>delivering</span>
        <span className={styles.swatch}><span className={`${styles.dot} ${styles.slate}`}></span>idle · active 24h</span>
        <span className={styles.swatch}><span className={`${styles.dot} ${styles.dust}`}></span>inactive</span>
      </div>
      <div className={styles.note}>— lines: settled briefs · last 30 minutes</div>
    </div>
  )
}
