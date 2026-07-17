/**
 * File type detection + validation per type
 * Analyzes deliverable files before sending to LLM
 */

export interface FileAnalysis {
  filename: string
  fileType: 'code' | 'data' | 'document' | 'image' | 'archive' | 'other'
  language?: string
  valid: boolean
  errors: string[]
  warnings: string[]
  metrics: {
    lineCount?: number
    wordCount?: number
    functionCount?: number
    importCount?: number
    keyCount?: number
    sectionCount?: number
    sizeBytes: number
  }
  summary: string // human-readable summary for LLM prompt
}

// Language detection by extension
const CODE_EXTENSIONS: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.py': 'python',
  '.sol': 'solidity',
  '.rs': 'rust',
  '.go': 'go',
  '.c': 'c',
  '.cpp': 'cpp',
  '.java': 'java',
  '.rb': 'ruby',
  '.php': 'php',
  '.swift': 'swift',
  '.kt': 'kotlin',
  '.sql': 'sql',
  '.sh': 'bash',
  '.html': 'html',
  '.css': 'css',
}

const DATA_EXTENSIONS: Record<string, string> = {
  '.json': 'json',
  '.csv': 'csv',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.xml': 'xml',
  '.toml': 'toml',
}

const DOC_EXTENSIONS: Record<string, string> = {
  '.md': 'markdown',
  '.txt': 'text',
  '.rst': 'rst',
}

const IMAGE_EXTENSIONS: Record<string, string> = {
  '.png': 'png',
  '.jpg': 'jpeg',
  '.jpeg': 'jpeg',
  '.gif': 'gif',
  '.svg': 'svg',
  '.webp': 'webp',
  '.bmp': 'bmp',
}

const ARCHIVE_EXTENSIONS: Record<string, string> = {
  '.zip': 'zip',
  '.tar': 'tar',
  '.gz': 'gzip',
  '.tgz': 'tar+gzip',
  '.rar': 'rar',
  '.7z': '7z',
}

export function detectFileType(filename: string): {
  type: FileAnalysis['fileType']
  language?: string
} {
  const lower = filename.toLowerCase()

  for (const [ext, lang] of Object.entries(CODE_EXTENSIONS)) {
    if (lower.endsWith(ext)) return { type: 'code', language: lang }
  }
  for (const [ext, lang] of Object.entries(DATA_EXTENSIONS)) {
    if (lower.endsWith(ext)) return { type: 'data', language: lang }
  }
  for (const [ext, lang] of Object.entries(DOC_EXTENSIONS)) {
    if (lower.endsWith(ext)) return { type: 'document', language: lang }
  }
  for (const [ext, lang] of Object.entries(IMAGE_EXTENSIONS)) {
    if (lower.endsWith(ext)) return { type: 'image', language: lang }
  }
  for (const [ext, lang] of Object.entries(ARCHIVE_EXTENSIONS)) {
    if (lower.endsWith(ext)) return { type: 'archive', language: lang }
  }

  return { type: 'other' }
}

function countLines(content: string): number {
  return content.split('\n').length
}

function countWords(content: string): number {
  return content.split(/\s+/).filter((w) => w.length > 0).length
}

function countFunctions(content: string, language?: string): number {
  const patterns = [
    /\bfunction\s+\w+/g, // function declaration
    /\b(const|let|var)\s+\w+\s*=\s*(async\s*)?\(/g, // arrow functions
    /\bdef\s+\w+/g, // Python
    /\bfn\s+\w+/g, // Rust
    /\bfunc\s+\w+/g, // Go
    /\bcontract\s+\w+/g, // Solidity
    /\bclass\s+\w+/g, // classes
    /\b(mod|pub\s+fn)\s+\w+/g, // Rust modules
  ]

  let count = 0
  for (const pattern of patterns) {
    const matches = content.match(pattern)
    if (matches) count += matches.length
  }
  return count
}

function countImports(content: string): number {
  const patterns = [
    /\bimport\s+/g,
    /\bfrom\s+\S+\s+import/g,
    /\brequire\s*\(/g,
    /\buse\s+/g, // Rust
  ]

  let count = 0
  for (const pattern of patterns) {
    const matches = content.match(pattern)
    if (matches) count += matches.length
  }
  return count
}

function countSections(content: string): number {
  const matches = content.match(/^#{1,6}\s+/gm)
  return matches ? matches.length : 0
}

function countJsonKeys(content: string): number {
  try {
    const parsed = JSON.parse(content)
    if (typeof parsed === 'object' && parsed !== null) {
      return Object.keys(parsed).length
    }
  } catch {
    // Invalid JSON has no reliably countable top-level keys.
  }
  return 0
}

function validateCode(
  content: string,
  language?: string,
): { errors: string[]; warnings: string[] } {
  const errors: string[] = []
  const warnings: string[] = []

  // Basic syntax checks
  if (language === 'json') {
    try {
      JSON.parse(content)
    } catch (e: any) {
      errors.push(`Invalid JSON: ${e.message}`)
    }
  }

  if (language === 'typescript' || language === 'javascript') {
    // Check for obvious syntax issues
    const openBraces = (content.match(/{/g) || []).length
    const closeBraces = (content.match(/}/g) || []).length
    if (Math.abs(openBraces - closeBraces) > 2) {
      warnings.push(`Mismatched braces: ${openBraces} open vs ${closeBraces} close`)
    }

    const openParens = (content.match(/\(/g) || []).length
    const closeParens = (content.match(/\)/g) || []).length
    if (Math.abs(openParens - closeParens) > 2) {
      warnings.push(`Mismatched parentheses: ${openParens} open vs ${closeParens} close`)
    }
  }

  if (language === 'python') {
    // Check indentation consistency
    const tabs = (content.match(/^\t/gm) || []).length
    const spaces = (content.match(/^ {2,}/gm) || []).length
    if (tabs > 0 && spaces > 0) {
      warnings.push('Mixed tabs and spaces in indentation')
    }
  }

  if (language === 'solidity') {
    if (!content.includes('pragma solidity')) {
      warnings.push('Missing pragma solidity directive')
    }
    if (
      !content.includes('contract ') &&
      !content.includes('library ') &&
      !content.includes('interface ')
    ) {
      warnings.push('No contract/library/interface declaration found')
    }
  }

  return { errors, warnings }
}

function validateData(
  content: string,
  language?: string,
): { errors: string[]; warnings: string[] } {
  const errors: string[] = []
  const warnings: string[] = []

  if (language === 'json') {
    try {
      const parsed = JSON.parse(content)
      if (typeof parsed !== 'object') {
        warnings.push('JSON is not an object or array')
      }
    } catch (e: any) {
      errors.push(`Invalid JSON: ${e.message}`)
    }
  }

  if (language === 'csv') {
    const lines = content.split('\n').filter((l) => l.trim())
    if (lines.length < 2) {
      warnings.push('CSV has less than 2 lines (no data rows)')
    } else {
      const headerCols = lines[0].split(',').length
      const inconsistent = lines.slice(1).filter((l) => l.split(',').length !== headerCols)
      if (inconsistent.length > 0) {
        warnings.push(`${inconsistent.length} rows have inconsistent column count`)
      }
    }
  }

  if (language === 'yaml' || language === 'yml') {
    // Basic YAML check
    if (content.includes('\t')) {
      errors.push('YAML should use spaces, not tabs')
    }
  }

  if (language === 'xml') {
    if (!content.includes('<?xml') && !content.startsWith('<')) {
      warnings.push('XML does not start with declaration or tag')
    }
  }

  return { errors, warnings }
}

function validateDocument(content: string): { errors: string[]; warnings: string[] } {
  const errors: string[] = []
  const warnings: string[] = []

  const wordCount = countWords(content)
  if (wordCount < 50) {
    warnings.push(`Document has only ${wordCount} words — may be too short`)
  }

  const sections = countSections(content)
  if (sections === 0 && wordCount > 200) {
    warnings.push('Long document with no headings — poor structure')
  }

  return { errors, warnings }
}

/**
 * Analyze a file and return structured analysis for the evaluator
 */
export function analyzeFile(filename: string, content: string): FileAnalysis {
  const { type, language } = detectFileType(filename)
  const sizeBytes = Buffer.byteLength(content, 'utf-8')

  let errors: string[] = []
  let warnings: string[] = []
  const metrics: FileAnalysis['metrics'] = { sizeBytes }

  // Empty file check
  if (!content || content.trim().length === 0) {
    return {
      filename,
      fileType: type,
      language,
      valid: false,
      errors: ['File is empty'],
      warnings: [],
      metrics,
      summary: `${filename}: empty file`,
    }
  }

  // Type-specific validation
  switch (type) {
    case 'code': {
      const result = validateCode(content, language)
      errors = result.errors
      warnings = result.warnings
      metrics.lineCount = countLines(content)
      metrics.wordCount = countWords(content)
      metrics.functionCount = countFunctions(content, language)
      metrics.importCount = countImports(content)
      break
    }
    case 'data': {
      const result = validateData(content, language)
      errors = result.errors
      warnings = result.warnings
      metrics.lineCount = countLines(content)
      if (language === 'json') metrics.keyCount = countJsonKeys(content)
      if (language === 'csv') metrics.lineCount = content.split('\n').filter((l) => l.trim()).length
      break
    }
    case 'document': {
      const result = validateDocument(content)
      errors = result.errors
      warnings = result.warnings
      metrics.lineCount = countLines(content)
      metrics.wordCount = countWords(content)
      metrics.sectionCount = countSections(content)
      break
    }
    case 'image': {
      // Can't validate image content from text
      warnings.push('Image file — content not analyzable as text')
      break
    }
    case 'archive': {
      warnings.push('Archive file — cannot extract and analyze contents')
      break
    }
    default: {
      metrics.lineCount = countLines(content)
      metrics.wordCount = countWords(content)
    }
  }

  // Build summary
  const parts: string[] = [filename]
  parts.push(type)
  if (language) parts.push(language)
  if (errors.length > 0) parts.push(`❌ ${errors[0]}`)
  else parts.push('✅ valid')
  if (metrics.lineCount) parts.push(`${metrics.lineCount} lines`)
  if (metrics.functionCount) parts.push(`${metrics.functionCount} functions`)
  if (metrics.wordCount && type === 'document') parts.push(`${metrics.wordCount} words`)
  if (metrics.keyCount) parts.push(`${metrics.keyCount} keys`)

  return {
    filename,
    fileType: type,
    language,
    valid: errors.length === 0,
    errors,
    warnings,
    metrics,
    summary: parts.join(' · '),
  }
}

/**
 * Format file analysis for inclusion in LLM prompt
 */
export function formatFileForPrompt(
  analysis: FileAnalysis,
  content: string,
  maxContentLength: number,
): string {
  const parts: string[] = []

  // Header with status
  const status = analysis.valid ? '✅' : '❌'
  parts.push(
    `### ${analysis.filename} (${analysis.fileType}${analysis.language ? `, ${analysis.language}` : ''}) ${status}`,
  )

  // Metrics line
  const metrics: string[] = []
  if (analysis.metrics.lineCount) metrics.push(`${analysis.metrics.lineCount} lines`)
  if (analysis.metrics.functionCount) metrics.push(`${analysis.metrics.functionCount} functions`)
  if (analysis.metrics.wordCount && analysis.fileType === 'document')
    metrics.push(`${analysis.metrics.wordCount} words`)
  if (analysis.metrics.keyCount) metrics.push(`${analysis.metrics.keyCount} keys`)
  if (analysis.metrics.importCount) metrics.push(`${analysis.metrics.importCount} imports`)
  if (metrics.length > 0) parts.push(`- ${metrics.join(', ')}`)

  // Errors/warnings
  if (analysis.errors.length > 0) {
    parts.push(`- Errors: ${analysis.errors.join('; ')}`)
  }
  if (analysis.warnings.length > 0) {
    parts.push(`- Warnings: ${analysis.warnings.join('; ')}`)
  }

  // Content (truncated)
  const truncated = content.slice(0, maxContentLength)
  const lang = analysis.language || ''
  parts.push(`\`\`\`${lang}\n${truncated}\n\`\`\``)

  return parts.join('\n')
}
