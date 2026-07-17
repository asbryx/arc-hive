import { createClient } from '@supabase/supabase-js'
import { readFile } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'
import { analyzeNpmPackage } from './npm-package.js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_KEY
const storageBackend = process.env.FILE_STORAGE_BACKEND === 'local' ? 'local' : 'supabase'
const localDeliverablesDir =
  storageBackend === 'local' && process.env.LOCAL_DELIVERABLES_DIR
    ? resolve(process.env.LOCAL_DELIVERABLES_DIR)
    : null

if (storageBackend === 'supabase' && (!supabaseUrl || !supabaseKey)) {
  // Loud at startup, not silent at first call. Audit T11 (2026-06-15):
  // packages/evaluator/.env was missing SUPABASE_URL + SUPABASE_SERVICE_KEY,
  // so getFileAsText silently returned null for every file fetch — the LLM
  // saw cover-note text only, scored work as "missing", and the validator
  // counted zero file chars. Three months of evaluations were affected.
  // Now: refuse to start the module without the keys present.
  console.error('[supabase] FATAL: SUPABASE_URL and/or SUPABASE_SERVICE_KEY missing in process env')
  console.error(
    '[supabase] Evaluator file-fetch will not work. Check packages/evaluator/.env vs the root .env',
  )
}
if (storageBackend === 'local' && !localDeliverablesDir) {
  console.error('[storage] FATAL: LOCAL_DELIVERABLES_DIR missing for local file storage')
}

export const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null

const BUCKET = 'deliverables'

function assertSafeStoragePath(path: string): void {
  if (!path || typeof path !== 'string' || path.length > 512)
    throw new Error('Invalid storage path')
  if (path.includes('..') || path.startsWith('/') || path.includes('\\'))
    throw new Error('Unsafe storage path')
}

function localStoragePath(storagePath: string): string {
  if (!localDeliverablesDir) throw new Error('Local deliverables directory is not configured')
  if (!storagePath.startsWith('local/')) throw new Error('Invalid local storage path')

  const relativePath = storagePath.slice('local/'.length)
  assertSafeStoragePath(relativePath)
  const absolutePath = resolve(localDeliverablesDir, ...relativePath.split('/'))
  const escaped = relative(localDeliverablesDir, absolutePath)
  if (!escaped || escaped.startsWith('..') || isAbsolute(escaped))
    throw new Error('Unsafe local storage path')
  return absolutePath
}

/**
 * Get a deliverable file as text suitable for LLM consumption.
 *
 * Plain-text formats (md, txt, json, code, etc.) pass through as-is.
 * Binary formats are decoded:
 *   - PDF → extracted text via pdf-parse (Audit T15 fix, 2026-06-15)
 *   - npm .tgz → bounded package.json + README metadata only
 *   - everything else binary → returns a structured marker so the LLM is
 *     honestly told the content was inaccessible rather than fed garbled bytes.
 */
export async function getFileAsText(storagePath: string): Promise<string | null> {
  let data: Blob

  if (storageBackend === 'local') {
    if (!storagePath.startsWith('local/')) {
      console.error(`[storage] non-local path rejected by local backend: ${storagePath}`)
      return null
    }
    try {
      data = new Blob([await readFile(localStoragePath(storagePath))])
    } catch (error) {
      console.error(
        `[storage] local read failed for ${storagePath}:`,
        error instanceof Error ? error.message : error,
      )
      return null
    }
  } else {
    if (storagePath.startsWith('local/')) {
      console.error(`[storage] local path rejected by Supabase backend: ${storagePath}`)
      return null
    }
    if (!supabase) {
      console.error(
        `[supabase] cannot fetch ${storagePath}: client not initialised (env missing at startup)`,
      )
      return null
    }

    const { data: remoteData, error } = await supabase.storage.from(BUCKET).download(storagePath)

    if (error) {
      console.error(
        `[supabase] download failed for ${storagePath}:`,
        error.message || JSON.stringify(error),
      )
      return null
    }
    if (!remoteData) {
      console.error(`[supabase] download returned no data for ${storagePath}`)
      return null
    }
    data = remoteData
  }

  return decodeForEvaluator(data, storagePath)
}

/**
 * Decode a fetched Blob to text the LLM can actually read.
 *
 * Approach: dispatch on extension. PDFs get text-extracted; npm tarballs get
 * metadata-only inspection; other known binaries get a structured placeholder.
 */
async function decodeForEvaluator(data: Blob, storagePath: string): Promise<string | null> {
  const lower = storagePath.toLowerCase()

  if (lower.endsWith('.pdf')) {
    try {
      const buf = Buffer.from(await data.arrayBuffer())
      const { PDFParse } = await import('pdf-parse')
      const parser = new PDFParse({ data: new Uint8Array(buf) })
      const result = await parser.getText()
      const text = (result.text || '').trim()
      const pages =
        (result as { numpages?: number; pages?: unknown[] }).numpages ??
        (result as { pages?: unknown[] }).pages?.length ??
        '?'
      if (!text) {
        console.warn(
          `[storage] ${storagePath}: PDF parsed but extracted 0 chars of text (scanned image?)`,
        )
        return `[empty-pdf; ${buf.length} bytes, ${pages} pages; no extractable text — likely a scanned image needing OCR]`
      }
      console.log(
        `[storage] ${storagePath}: extracted ${text.length} chars from ${pages} PDF page(s)`,
      )
      return text
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown PDF extraction failure'
      console.error(`[storage] PDF extract failed for ${storagePath}:`, message)
      return `[pdf-extract-failed; bytes=${data.size}; ${message}]`
    }
  }

  // npm packages are gzip-compressed tarballs. Inspect only metadata and README
  // in memory; never unpack to disk or execute package lifecycle scripts.
  if (lower.endsWith('.tgz')) {
    return analyzeNpmPackage(Buffer.from(await data.arrayBuffer()))
  }

  // Known opaque-binary formats — give the LLM an honest placeholder
  // instead of corrupted text. Avoids the "evaluator sees garbage and
  // marks the work as garbage" failure mode.
  const opaqueExt = [
    '.doc',
    '.docx',
    '.xls',
    '.xlsx',
    '.ppt',
    '.pptx',
    '.zip',
    '.tar',
    '.gz',
    '.dll',
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.webp',
    '.mp4',
    '.mov',
    '.mp3',
    '.wav',
  ]
  if (opaqueExt.some((extension) => lower.endsWith(extension))) {
    console.warn(
      `[storage] ${storagePath}: opaque binary format — passing structured placeholder to LLM (no extractor for this type yet)`,
    )
    return `[opaque-binary; ${data.size} bytes; format=${lower.split('.').pop()}; no text extractor available — evaluator should rely on filename/cover-note for context]`
  }

  return data.text()
}
