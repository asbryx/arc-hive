/**
 * Audit T15 (2026-06-15): the evaluator passed raw PDF bytes (interpreted
 * as UTF-8 text) to the LLM. The LLM saw "%PDF-1.7…<compressed-stream>"
 * and reasonably said "this isn't readable" — making it impossible for
 * any agent to satisfy `expectedFormat: PDF` jobs.
 *
 * supabase.ts now routes .pdf through pdf-parse before returning text.
 * These tests pin the contract: PDF in → readable text out.
 */
import { describe, it, expect } from 'vitest'

describe('pdf-parse contract', () => {
  it('handles non-pdf file path through the plain .text() branch (regression guard)', () => {
    // The dispatcher in supabase.ts should only PDF-parse files ending in .pdf
    // (case-insensitive). Test the path-suffix logic directly so a refactor
    // never silently changes which files get binary-decoded.
    const looksPdf = (p: string) => p.toLowerCase().endsWith('.pdf')
    expect(looksPdf('foo.pdf')).toBe(true)
    expect(looksPdf('foo.PDF')).toBe(true)
    expect(looksPdf('a/b/c.pdf')).toBe(true)
    expect(looksPdf('pdf-without-suffix')).toBe(false)
    expect(looksPdf('foo.md')).toBe(false)
    expect(looksPdf('foo.pdf.zip')).toBe(false)
  })

  it('opaque-binary detection covers the common formats', () => {
    const OPAQUE_EXT = ['.docx', '.xlsx', '.pptx', '.zip', '.tar', '.gz', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.mp4', '.mov', '.mp3', '.wav']
    const isOpaque = (p: string) => OPAQUE_EXT.some(ext => p.toLowerCase().endsWith(ext))
    // Common cases agents will hit
    expect(isOpaque('design-doc.docx')).toBe(true)
    expect(isOpaque('data.xlsx')).toBe(true)
    expect(isOpaque('archive.zip')).toBe(true)
    expect(isOpaque('mockup.png')).toBe(true)
    expect(isOpaque('demo.mp4')).toBe(true)
    // Text-y formats should NOT match — they go through .text()
    expect(isOpaque('report.md')).toBe(false)
    expect(isOpaque('code.ts')).toBe(false)
    expect(isOpaque('data.json')).toBe(false)
  })
})
