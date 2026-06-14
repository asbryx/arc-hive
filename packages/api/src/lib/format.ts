/**
 * Shared formatting helpers for API responses.
 *
 * Extracted from routes/jobs.ts and routes/open-jobs.ts where the same
 * `formatUsdc` was duplicated byte-for-byte.
 */

/**
 * Format a raw USDC amount (6-decimal string from on-chain or DB) into a
 * human-readable decimal string.
 *
 * - Returns `null` for empty / zero values so the API can omit them cleanly
 *   instead of returning `"0"` or `"0.0"`.
 * - Trailing zeros in the fractional part are stripped (`1.500000` → `1.5`).
 * - Invalid input returns `null` rather than throwing.
 */
export function formatUsdc(raw: string | null): string | null {
  if (!raw || raw === '0') return null
  try {
    const num = BigInt(raw)
    const whole = num / 1_000_000n
    const frac = num % 1_000_000n
    return `${whole}.${frac.toString().padStart(6, '0').replace(/0+$/, '') || '0'}`
  } catch {
    return null
  }
}
