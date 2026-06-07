import { describe, it, expect } from 'vitest'

// Test wallet validation regex
function isValidWallet(wallet: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(wallet)
}

describe('Wallet Validation', () => {
  it('accepts valid wallet address', () => {
    expect(isValidWallet('0x742d35Cc6634C0532925a3b844Bc9e7595f2bD3e')).toBe(true)
  })
  
  it('rejects address without 0x prefix', () => {
    expect(isValidWallet('742d35Cc6634C0532925a3b844Bc9e7595f2bD3e')).toBe(false)
  })
  
  it('rejects short address', () => {
    expect(isValidWallet('0x742d35')).toBe(false)
  })
  
  it('rejects non-hex chars', () => {
    expect(isValidWallet('0xZZZZd35Cc6634C0532925a3b844Bc9e7595f2bD3')).toBe(false)
  })
})
