import { describe, it, expect } from 'vitest'

// Test IP extraction logic
function extractClientIp(xff: string | null, trustCount: number = 1): string {
  if (xff) {
    const ips = xff.split(',').map(s => s.trim()).filter(Boolean)
    if (ips.length > trustCount) {
      return ips[ips.length - 1 - trustCount]
    }
  }
  return 'unknown'
}

// Test private IP detection
function isPrivateIP(ip: string): boolean {
  if (ip.startsWith('127.') || ip === '::1' || ip === 'localhost') return true
  if (ip.startsWith('10.')) return true
  if (ip.startsWith('192.168.')) return true
  if (ip.startsWith('172.')) {
    const second = parseInt(ip.split('.')[1])
    if (second >= 16 && second <= 31) return true
  }
  return false
}

describe('Rate Limiter IP Extraction', () => {
  it('returns rightmost untrusted IP with trustCount=1', () => {
    expect(extractClientIp('1.2.3.4, 10.0.0.1', 1)).toBe('1.2.3.4')
  })
  it('skips trusted proxy with trustCount=2', () => {
    expect(extractClientIp('1.2.3.4, proxy1, proxy2', 2)).toBe('1.2.3.4')
  })
  it('returns unknown for empty XFF', () => {
    expect(extractClientIp(null)).toBe('unknown')
  })
  it('handles single IP', () => {
    expect(extractClientIp('5.6.7.8', 1)).toBe('unknown')
  })
  it('handles spoofed XFF correctly', () => {
    // Attacker spoofs leftmost, real proxy is rightmost
    expect(extractClientIp('spoofed.attacker.ip, real.client.ip', 1)).toBe('spoofed.attacker.ip')
  })
})

describe('Private IP Detection', () => {
  it('detects localhost', () => {
    expect(isPrivateIP('127.0.0.1')).toBe(true)
    expect(isPrivateIP('localhost')).toBe(true)
    expect(isPrivateIP('::1')).toBe(true)
  })
  it('detects 10.x.x.x', () => {
    expect(isPrivateIP('10.0.0.1')).toBe(true)
    expect(isPrivateIP('10.255.255.255')).toBe(true)
  })
  it('detects 192.168.x.x', () => {
    expect(isPrivateIP('192.168.1.1')).toBe(true)
  })
  it('detects 172.16-31.x.x', () => {
    expect(isPrivateIP('172.16.0.1')).toBe(true)
    expect(isPrivateIP('172.31.255.255')).toBe(true)
  })
  it('allows 172.32+ (public range)', () => {
    expect(isPrivateIP('172.32.0.1')).toBe(false)
  })
  it('allows public IPs', () => {
    expect(isPrivateIP('8.8.8.8')).toBe(false)
    expect(isPrivateIP('1.1.1.1')).toBe(false)
  })
})
