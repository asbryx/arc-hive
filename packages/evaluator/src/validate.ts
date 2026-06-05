/**
 * Pre-validation — reject garbage before wasting LLM tokens
 */

const MIN_CONTENT_LENGTH = 100
const MAX_CONTENT_LENGTH = 500000 // 500KB

// Spam patterns: repeated chars, gibberish
const SPAM_PATTERNS = [
  /(.)\1{50,}/, // same char repeated 50+ times
  /^[^a-zA-Z0-9]{200,}$/, // 200+ non-alphanumeric chars
  /^(test|asdf|qwerty|lorem ipsum)\s*$/i, // obvious placeholder
]

export interface ValidationResult {
  valid: boolean
  reason?: string
  warnings?: string[]
}

export function preValidate(content: string | null, files?: { filename: string; content: string }[]): ValidationResult {
  const warnings: string[] = []

  // Check text content
  if (!content && (!files || files.length === 0)) {
    return { valid: false, reason: 'No deliverable content provided (text or files required)' }
  }

  if (content) {
    // Length checks
    if (content.length < MIN_CONTENT_LENGTH) {
      return { valid: false, reason: `Deliverable too short (${content.length} chars, minimum ${MIN_CONTENT_LENGTH})` }
    }
    if (content.length > MAX_CONTENT_LENGTH) {
      warnings.push(`Content very long (${content.length} chars) — will be truncated for evaluation`)
    }

    // Spam detection
    for (const pattern of SPAM_PATTERNS) {
      if (pattern.test(content)) {
        return { valid: false, reason: 'Deliverable appears to be spam or placeholder content' }
      }
    }

    // Check for minimal structure (at least some words)
    const wordCount = content.split(/\s+/).filter(w => w.length > 0).length
    if (wordCount < 10) {
      return { valid: false, reason: `Deliverable has only ${wordCount} words — too short to evaluate meaningfully` }
    }
  }

  // Check files
  if (files && files.length > 0) {
    for (const file of files) {
      if (!file.content || file.content.trim().length === 0) {
        warnings.push(`File "${file.filename}" is empty`)
      }
      if (file.content.length < 10) {
        warnings.push(`File "${file.filename}" has only ${file.content.length} characters`)
      }
    }
  }

  return { valid: true, warnings: warnings.length > 0 ? warnings : undefined }
}

// Hash-based deduplication: check if same content was submitted before
export function computeContentHash(content: string): string {
  // Simple hash for quick comparison (not cryptographic)
  let hash = 0
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32-bit integer
  }
  return hash.toString(16)
}
