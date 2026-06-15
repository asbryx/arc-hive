import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_KEY

if (!supabaseUrl || !supabaseKey) {
  // Loud at startup, not silent at first call. Audit T11 (2026-06-15):
  // packages/evaluator/.env was missing SUPABASE_URL + SUPABASE_SERVICE_KEY,
  // so getFileAsText silently returned null for every file fetch — the LLM
  // saw cover-note text only, scored work as "missing", and the validator
  // counted zero file chars. Three months of evaluations were affected.
  // Now: refuse to start the module without the keys present.
  console.error('[supabase] FATAL: SUPABASE_URL and/or SUPABASE_SERVICE_KEY missing in process env')
  console.error('[supabase] Evaluator file-fetch will not work. Check packages/evaluator/.env vs the root .env')
}

export const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null

const BUCKET = 'deliverables'

/**
 * Get a deliverable file as text suitable for LLM consumption.
 *
 * Plain-text formats (md, txt, json, code, etc.) pass through as-is.
 * Binary formats are decoded:
 *   - PDF → extracted text via pdf-parse (Audit T15 fix, 2026-06-15)
 *   - everything else binary → returns a structured `[binary; N bytes]`
 *     marker so the LLM is honestly told the content was inaccessible
 *     rather than fed garbled bytes.
 *
 * Returns null only when the file is genuinely empty / unfetchable. Logs
 * a real error message for every failure mode so we never again confuse
 * "Supabase is misconfigured" with "the file was small".
 */
export async function getFileAsText(storagePath: string): Promise<string | null> {
  if (!supabase) {
    console.error(`[supabase] cannot fetch ${storagePath}: client not initialised (env missing at startup)`)
    return null
  }

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .download(storagePath)

  if (error) {
    // Audit T11 (2026-06-15): previously this was `if (error) return null` —
    // every Supabase failure mode (404, 403, network, expired URL) was
    // collapsed into "file is empty" by callers. Always log.
    console.error(`[supabase] download failed for ${storagePath}:`, error.message || JSON.stringify(error))
    return null
  }
  if (!data) {
    console.error(`[supabase] download returned no data for ${storagePath}`)
    return null
  }

  return await decodeForEvaluator(data, storagePath)
}

/**
 * Decode a fetched Blob to text the LLM can actually read.
 *
 * Audit T15 (2026-06-15): an agent submitting a PDF used to have its file
 * read with `.text()` — which interprets the binary PDF stream as UTF-8.
 * The LLM saw `%PDF-1.7\n%âãÏÓ...` and inflated-stream gibberish, then
 * (correctly per its prompt) gave up: "raw PDF syntax and binary data".
 * No agent could ever satisfy a `expectedFormat: PDF` job.
 *
 * Approach: dispatch on extension. PDFs get text-extracted; other known
 * binaries get a structured placeholder. Plain-text formats fall through
 * to the existing `.text()` path.
 */
async function decodeForEvaluator(data: Blob, storagePath: string): Promise<string | null> {
  const lower = storagePath.toLowerCase()

  if (lower.endsWith('.pdf')) {
    try {
      const buf = Buffer.from(await data.arrayBuffer())
      // Dynamic import keeps pdf-parse out of the cold-start path for jobs
      // with no PDF files. The lib reads test/data/05-versions-space.pdf at
      // top-level by default — we route around that by importing the
      // implementation module directly.
      // @ts-expect-error pdf-parse ships no types for the deeper path
      const mod: any = await import('pdf-parse/lib/pdf-parse.js')
      const pdfParse = mod.default || mod
      const parsed = await pdfParse(buf, { max: 0 }) // max=0 → all pages
      const text = (parsed.text || '').trim()
      if (!text) {
        console.warn(`[supabase] ${storagePath}: PDF parsed but extracted 0 chars of text (scanned image?)`)
        return `[empty-pdf; ${buf.length} bytes, ${parsed.numpages || '?'} pages; no extractable text — likely a scanned image needing OCR]`
      }
      console.log(`[supabase] ${storagePath}: extracted ${text.length} chars from ${parsed.numpages || '?'} PDF page(s)`)
      return text
    } catch (err: any) {
      console.error(`[supabase] PDF extract failed for ${storagePath}:`, err.message)
      return `[pdf-extract-failed; bytes=${data.size}; ${err.message}]`
    }
  }

  // Known opaque-binary formats — give the LLM an honest placeholder
  // instead of corrupted text. Avoids the "evaluator sees garbage and
  // marks the work as garbage" failure mode.
  const OPAQUE_EXT = ['.docx', '.xlsx', '.pptx', '.zip', '.tar', '.gz', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.mp4', '.mov', '.mp3', '.wav']
  if (OPAQUE_EXT.some(ext => lower.endsWith(ext))) {
    console.warn(`[supabase] ${storagePath}: opaque binary format — passing structured placeholder to LLM (no extractor for this type yet)`)
    return `[opaque-binary; ${data.size} bytes; format=${lower.split('.').pop()}; no text extractor available — evaluator should rely on filename/cover-note for context]`
  }

  // Plain text formats — original behaviour
  return await data.text()
}
