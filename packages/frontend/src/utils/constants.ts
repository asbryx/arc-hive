export const TRUST_TIERS: Record<number, string> = {
  0: 'Unverified',
  1: 'Active',
  2: 'Trusted',
  3: 'Elite',
}

export const STATUS_COLORS: Record<string, string> = {
  Open: 'var(--text)',
  Funded: 'var(--text)',
  Submitted: 'var(--text)',
  Completed: 'var(--dim)',
  Rejected: '#ff4444',
  Expired: 'var(--dim)',
}

export const JOB_STATUSES = ['Open', 'Funded', 'Submitted', 'Completed', 'Rejected', 'Expired']

export const EXTERNAL_LINKS = {
  docs: 'https://docs.arc.io',
  explorer: 'https://testnet.arcscan.app',
  github: 'https://github.com/asbryx/arc-hive',
  x: 'https://x.com/Arcs_Hives',
  discord: 'https://discord.gg/arc',
}
