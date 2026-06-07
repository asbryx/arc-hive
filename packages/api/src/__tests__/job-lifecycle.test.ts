import { describe, it, expect } from 'vitest'

// Test USDC formatting (used in jobs.ts)
function formatUsdc(raw: bigint | string): string {
  const value = BigInt(raw)
  const divisor = 1_000_000n
  const whole = value / divisor
  const fraction = value % divisor
  if (fraction === 0n) return `${whole}.0`
  return `${whole}.${fraction.toString().padStart(6, '0').replace(/0+$/, '')}`
}

// Test job status mapping
function getStatusLabel(status: number | string): string {
  const map: Record<number, string> = {
    0: 'Open', 1: 'Funded', 2: 'Submitted', 3: 'Completed', 4: 'Rejected', 5: 'Expired'
  }
  return typeof status === 'number' ? (map[status] || 'Unknown') : status
}

describe('USDC Formatting', () => {
  it('formats 1 USDC correctly', () => {
    expect(formatUsdc(1000000n)).toBe('1.0')
  })
  it('formats 100 USDC correctly', () => {
    expect(formatUsdc(100000000n)).toBe('100.0')
  })
  it('formats fractional USDC', () => {
    expect(formatUsdc(1500000n)).toBe('1.5')
  })
  it('formats small amounts', () => {
    expect(formatUsdc(100000n)).toBe('0.1')
  })
  it('formats zero', () => {
    expect(formatUsdc(0n)).toBe('0.0')
  })
  it('formats string input', () => {
    expect(formatUsdc('5000000')).toBe('5.0')
  })
})

describe('Job Status Mapping', () => {
  it('maps numeric statuses', () => {
    expect(getStatusLabel(0)).toBe('Open')
    expect(getStatusLabel(1)).toBe('Funded')
    expect(getStatusLabel(3)).toBe('Completed')
  })
  it('passes through string statuses', () => {
    expect(getStatusLabel('evaluating_locked')).toBe('evaluating_locked')
    expect(getStatusLabel('completed')).toBe('completed')
  })
  it('handles unknown numeric status', () => {
    expect(getStatusLabel(99)).toBe('Unknown')
  })
})
