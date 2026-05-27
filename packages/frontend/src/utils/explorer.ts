export const EXPLORER_BASE = 'https://testnet.arcscan.app'

export function explorerAddress(addr: string): string {
  return `${EXPLORER_BASE}/address/${addr}`
}

export function explorerTx(hash: string): string {
  return `${EXPLORER_BASE}/tx/${hash}`
}
