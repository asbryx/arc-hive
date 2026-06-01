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
  Docs: 'https://docs.arc.io',
  Explorer: 'https://testnet.arcscan.app',
  Github: 'https://github.com/asbryx/arc-hive',
  X: 'https://x.com/Arcs_Hives',
  Discord: 'https://discord.gg/arc',
}
