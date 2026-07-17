import { createClient } from '@supabase/supabase-js'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve } from 'node:path'

const supabaseUrl = process.env.SUPABASE_URL
// SEC-010: User-facing client must use anon key only.
// Falling back to service key here would silently bypass RLS for every read,
// effectively turning every storage download into root-level access.
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY
const supabaseAdminKey = process.env.SUPABASE_SERVICE_KEY
const storageBackend = process.env.FILE_STORAGE_BACKEND === 'local' ? 'local' : 'supabase'
const localDeliverablesDir =
  storageBackend === 'local' && process.env.LOCAL_DELIVERABLES_DIR
    ? resolve(process.env.LOCAL_DELIVERABLES_DIR)
    : null

if (storageBackend === 'supabase' && (!supabaseUrl || !supabaseAnonKey)) {
  console.warn(
    '[supabase] WARNING: SUPABASE_URL or SUPABASE_ANON_KEY not set — file downloads disabled',
  )
}
if (storageBackend === 'supabase' && !supabaseAdminKey) {
  console.warn('[supabase] WARNING: SUPABASE_SERVICE_KEY not set — file uploads/cleanup disabled')
}
if (storageBackend === 'local' && !localDeliverablesDir) {
  console.warn('[storage] WARNING: LOCAL_DELIVERABLES_DIR not set — local file storage disabled')
}

// User-facing client (respects RLS). Never falls back to the service key.
export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } })
    : null

// Admin client for uploads/cleanup (bypasses RLS) — never exposed to user input paths.
export const supabaseAdmin =
  supabaseUrl && supabaseAdminKey
    ? createClient(supabaseUrl, supabaseAdminKey, { auth: { persistSession: false } })
    : null

const BUCKET = 'deliverables'

// File type detection by extension
const CODE_EXTS = [
  '.ts',
  '.js',
  '.py',
  '.sol',
  '.rs',
  '.go',
  '.jsx',
  '.tsx',
  '.c',
  '.cpp',
  '.java',
  '.rb',
  '.php',
  '.swift',
  '.kt',
]
const DOC_EXTS = ['.md', '.txt', '.doc', '.docx', '.pdf', '.rtf']
const DATA_EXTS = ['.json', '.csv', '.yaml', '.yml', '.xml', '.toml', '.sql']
const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp']
// SEC-011: SVG removed from image whitelist — SVG can contain inline JavaScript
// and is served back to users, so it is a stored-XSS vector.
const ARCHIVE_EXTS = ['.zip', '.tar', '.tar.gz', '.tgz', '.rar', '.7z']

export function detectFileType(filename: string): string {
  const lower = filename.toLowerCase()
  if (CODE_EXTS.some((ext) => lower.endsWith(ext))) return 'code'
  if (DOC_EXTS.some((ext) => lower.endsWith(ext))) return 'document'
  if (DATA_EXTS.some((ext) => lower.endsWith(ext))) return 'data'
  if (IMAGE_EXTS.some((ext) => lower.endsWith(ext))) return 'image'
  if (ARCHIVE_EXTS.some((ext) => lower.endsWith(ext))) return 'archive'
  return 'other'
}

// SEC-012: Path safety helper — refuse anything that could escape the bucket prefix.
function assertSafeStoragePath(path: string): void {
  if (!path || typeof path !== 'string') throw new Error('Invalid storage path')
  if (path.length > 512) throw new Error('Storage path too long')
  if (path.includes('..') || path.startsWith('/') || path.includes('\\')) {
    throw new Error('Unsafe storage path')
  }
}

function localStoragePath(storagePath: string): string {
  if (!localDeliverablesDir) throw new Error('Local deliverables directory is not configured')
  if (!storagePath.startsWith('local/')) throw new Error('Invalid local storage path')

  const relativePath = storagePath.slice('local/'.length)
  assertSafeStoragePath(relativePath)
  const absolutePath = resolve(localDeliverablesDir, ...relativePath.split('/'))
  const escaped = relative(localDeliverablesDir, absolutePath)
  if (!escaped || escaped.startsWith('..') || isAbsolute(escaped)) {
    throw new Error('Unsafe local storage path')
  }
  return absolutePath
}

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer
}

// Upload file to configured private storage.
export async function uploadFile(
  jobId: string | number,
  version: number,
  filename: string,
  fileBuffer: ArrayBuffer,
  mimeType: string,
): Promise<{ path: string; error?: string }> {
  if (storageBackend === 'supabase' && !supabaseAdmin)
    return { path: '', error: 'Supabase not configured' }

  // PostgreSQL BIGINT values can exceed JavaScript's safe integer range. Keep
  // the chain job ID as a decimal string so storage paths cannot be rounded or
  // collide for large job IDs.
  const normalizedJobId = String(jobId)
  if (!/^\d+$/.test(normalizedJobId) || !Number.isFinite(version) || version < 1) {
    return { path: '', error: 'Invalid jobId/version' }
  }

  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200)
  const path =
    storageBackend === 'local'
      ? `local/${normalizedJobId}/${Math.floor(version)}/${safeFilename}`
      : `${normalizedJobId}/${Math.floor(version)}/${safeFilename}`
  try {
    assertSafeStoragePath(path)
  } catch (error) {
    return { path: '', error: error instanceof Error ? error.message : 'Invalid storage path' }
  }

  if (storageBackend === 'local') {
    try {
      const target = localStoragePath(path)
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, Buffer.from(fileBuffer), { flag: 'wx' })
      return { path }
    } catch (error) {
      return {
        path: '',
        error: error instanceof Error ? error.message : 'Local file upload failed',
      }
    }
  }

  const { error } = await supabaseAdmin!.storage.from(BUCKET).upload(path, fileBuffer, {
    contentType: mimeType,
    upsert: false,
  })

  if (error) return { path: '', error: error.message }
  return { path }
}

// Download file from configured private storage. Route-level authorization
// decides who can reach this function; storage credentials never leave the API.
export async function downloadFile(
  storagePath: string,
): Promise<{ data: ArrayBuffer | null; error?: string }> {
  if (storageBackend === 'local') {
    if (!storagePath.startsWith('local/')) {
      return { data: null, error: 'Non-local storage path rejected by local backend' }
    }
    try {
      return { data: toArrayBuffer(await readFile(localStoragePath(storagePath))) }
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error.message : 'Local file download failed',
      }
    }
  }
  if (storagePath.startsWith('local/')) {
    return { data: null, error: 'Local storage path rejected by Supabase backend' }
  }

  const client = supabaseAdmin || supabase
  if (!client) return { data: null, error: 'Supabase not configured' }
  try {
    assertSafeStoragePath(storagePath)
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : 'Invalid storage path' }
  }

  const { data, error } = await client.storage.from(BUCKET).download(storagePath)

  if (error) return { data: null, error: error.message }
  return { data: await data.arrayBuffer() }
}

// Get file as text (for evaluator)
export async function getFileAsText(storagePath: string): Promise<string | null> {
  const result = await downloadFile(storagePath)
  if (!result.data) return null
  return new TextDecoder().decode(result.data)
}

// Delete file from configured private storage.
export async function deleteFile(storagePath: string): Promise<boolean> {
  if (storageBackend === 'local') {
    if (!storagePath.startsWith('local/')) return false
    try {
      await rm(localStoragePath(storagePath), { force: true })
      return true
    } catch {
      return false
    }
  }
  if (storagePath.startsWith('local/')) return false

  if (!supabaseAdmin) return false
  try {
    assertSafeStoragePath(storagePath)
  } catch {
    return false
  }

  const { error } = await supabaseAdmin.storage.from(BUCKET).remove([storagePath])

  return !error
}

// Delete multiple files. Mixed backends are refused so cleanup cannot delete
// one side and leave the other inconsistent.
export async function deleteFiles(storagePaths: string[]): Promise<boolean> {
  if (storagePaths.length === 0) return false
  if (storagePaths.every((storagePath) => storagePath.startsWith('local/'))) {
    const results = await Promise.all(storagePaths.map((storagePath) => deleteFile(storagePath)))
    return results.every(Boolean)
  }
  if (storagePaths.some((storagePath) => storagePath.startsWith('local/')) || !supabaseAdmin)
    return false

  try {
    for (const storagePath of storagePaths) assertSafeStoragePath(storagePath)
  } catch {
    return false
  }

  const { error } = await supabaseAdmin.storage.from(BUCKET).remove(storagePaths)

  return !error
}
