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
