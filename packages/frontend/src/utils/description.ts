/**
 * Format raw job descriptions for display.
 * Handles JSON blobs, criteria-prefixed strings, and plain text.
 */
export function formatDescription(desc: string | null, jobId: number): string {
  if (!desc) return `Job #${jobId}`

  // Try parsing JSON descriptions into readable summaries
  if (desc.startsWith('{')) {
    try {
      const obj = JSON.parse(desc)
      if (obj.eventType) {
        const type = obj.eventType.replace(/_/g, ' ').toLowerCase()
        return type + (obj.coordinates ? ` (${obj.coordinates.lat.toFixed(2)}, ${obj.coordinates.lng.toFixed(2)})` : '')
      }
      // Generic JSON — use first string value or key
      const firstVal = Object.values(obj).find(v => typeof v === 'string') as string | undefined
      return firstVal?.slice(0, 60) || `Job #${jobId}`
    } catch {
      // Not valid JSON, fall through
    }
  }

  // Criteria-prefixed jobs
  if (desc.startsWith('[criteria:')) {
    const after = desc.replace(/^\[criteria:0x[a-f0-9]+\]\s*/i, '')
    return after || `Job #${jobId}`
  }

  return desc
}
