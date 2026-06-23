import { describe, it, expect } from 'vitest'

// Test the field length validation logic
const FIELD_LIMITS = {
  title: 200,
  description: 10000,
  message: 5000,
} as const

function validateFieldLength(value: string | undefined, field: keyof typeof FIELD_LIMITS): string | null {
  if (!value) return null
  if (value.length > FIELD_LIMITS[field]) {
    return `${field} must be ${FIELD_LIMITS[field]} characters or less (got ${value.length})`
  }
  return null
}

describe('Field Length Validation', () => {
  it('accepts valid title', () => {
    expect(validateFieldLength('Valid title', 'title')).toBeNull()
  })
  
  it('rejects title over 200 chars', () => {
    const long = 'a'.repeat(201)
    expect(validateFieldLength(long, 'title')).toContain('200')
  })
  
  it('accepts undefined value', () => {
    expect(validateFieldLength(undefined, 'title')).toBeNull()
  })
  
  it('rejects description over 10000 chars', () => {
    const long = 'a'.repeat(10001)
    expect(validateFieldLength(long, 'description')).toContain('10000')
  })
})

// set-budget on-chain guard: setBudget takes a uint256, so a negative/zero/NaN
// budget reverts on-chain ("Number -5000000 is not in safe 256-bit unsigned
// range") and spams the logs on retry. open-jobs.ts:/set-budget must reject
// anything that isn't a positive finite number BEFORE the on-chain write.
// (audit 2026-06-24)
function isValidSetBudget(budget: unknown): boolean {
  if (budget == null || budget === '') return false
  const n = parseFloat(String(budget))
  return Number.isFinite(n) && n > 0
}

describe('set-budget validation', () => {
  it('accepts a positive budget', () => {
    expect(isValidSetBudget('5')).toBe(true)
    expect(isValidSetBudget(0.5)).toBe(true)
  })

  it('rejects a negative budget', () => {
    expect(isValidSetBudget('-5')).toBe(false)
    expect(isValidSetBudget(-0.000001)).toBe(false)
  })

  it('rejects zero', () => {
    expect(isValidSetBudget('0')).toBe(false)
    expect(isValidSetBudget(0)).toBe(false)
  })

  it('rejects non-numeric / empty / missing', () => {
    expect(isValidSetBudget('abc')).toBe(false)
    expect(isValidSetBudget('')).toBe(false)
    expect(isValidSetBudget(undefined)).toBe(false)
    expect(isValidSetBudget(NaN)).toBe(false)
  })
})
