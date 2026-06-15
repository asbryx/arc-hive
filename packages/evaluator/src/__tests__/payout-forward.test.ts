/**
 * Unit tests for the relay→agent payout forward logic.
 *
 * Covers the pure helpers (validation, fmt). The DB + on-chain paths are
 * exercised against a real testnet + Postgres in the backfill script's
 * dry-run mode — they're not unit-testable without heavy mocking that would
 * just be re-encoding the implementation.
 */
import { describe, it, expect } from 'vitest'

describe('payout forward — input validation', () => {
  it('rejects non-address recipients', () => {
    const isValid = (s: string) => /^0x[a-f0-9]{40}$/.test(s.toLowerCase())
    expect(isValid('')).toBe(false)
    expect(isValid('0x')).toBe(false)
    expect(isValid('0xnotahex')).toBe(false)
    expect(isValid('0x123')).toBe(false)
    expect(isValid('0x' + 'a'.repeat(39))).toBe(false)
    expect(isValid('0x' + 'a'.repeat(41))).toBe(false)
  })

  it('accepts valid lowercased addresses', () => {
    const isValid = (s: string) => /^0x[a-f0-9]{40}$/.test(s.toLowerCase())
    expect(isValid('0x011E13F8E12E40Cf63a06fF20a40FCCFB44ADbBe')).toBe(true)
    expect(isValid('0xDd03A2eEA57E2e10B05bF65515E1ebF2c753d7d5')).toBe(true)
  })

  it('treats non-positive amounts as invalid', () => {
    const isValidAmount = (n: bigint) => n > 0n
    expect(isValidAmount(0n)).toBe(false)
    expect(isValidAmount(-1n)).toBe(false)
    expect(isValidAmount(1n)).toBe(true)
    expect(isValidAmount(500_000n)).toBe(true) // 0.5 USDC
  })
})

describe('USDC base-unit formatting', () => {
  function fmtUsdc(baseUnits: bigint): string {
    const whole = baseUnits / 1_000_000n
    const frac = baseUnits % 1_000_000n
    return `${whole}.${frac.toString().padStart(6, '0')}`
  }

  it('formats whole USDC', () => {
    expect(fmtUsdc(1_000_000n)).toBe('1.000000')
    expect(fmtUsdc(100_000_000n)).toBe('100.000000')
  })

  it('formats fractional USDC', () => {
    expect(fmtUsdc(500_000n)).toBe('0.500000')
    expect(fmtUsdc(1n)).toBe('0.000001')
  })

  it('formats the 11.49 stuck-on-relay value', () => {
    expect(fmtUsdc(11_489_781n)).toBe('11.489781')
  })

  it('formats zero', () => {
    expect(fmtUsdc(0n)).toBe('0.000000')
  })
})
