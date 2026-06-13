import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
// SEC-010: User-facing client must use anon key only.
// Falling back to service key here would silently bypass RLS for every read,
// effectively turning every storage download into root-level access.
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY
const supabaseAdminKey = process.env.SUPABASE_SERVICE_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[supabase] WARNING: SUPABASE_URL or SUPABASE_ANON_KEY not set — file downloads disabled')
}
if (!supabaseAdminKey) {
  console.warn('[supabase] WARNING: SUPABASE_SERVICE_KEY not set — file uploads/cleanup disabled')
}

// User-facing client (respects RLS). Never falls back to the service key.
export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } })
  : null

// Admin client for uploads/cleanup (bypasses RLS) — never exposed to user input paths.
export const supabaseAdmin = supabaseUrl && supabaseAdminKey
  ? createClient(supabaseUrl, supabaseAdminKey, { auth: { persistSession: false } })
  : null

const BUCKET = 'deliverables'

// File type detection by extension
const CODE_EXTS = ['.ts', '.js', '.py', '.sol', '.rs', '.go', '.jsx', '.tsx', '.c', '.cpp', '.java', '.rb', '.php', '.swift', '.kt']
const DOC_EXTS = ['.md', '.txt', '.doc', '.docx', '.pdf', '.rtf']
const DATA_EXTS = ['.json', '.csv', '.yaml', '.yml', '.xml', '.toml', '.sql']
const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp']
// SEC-011: SVG removed from image whitelist — SVG can contain inline JavaScript
// and is served back to users, so it is a stored-XSS vector.
const ARCHIVE_EXTS = ['.zip', '.tar', '.tar.gz', '.tgz', '.rar', '.7z']

export function detectFileType(filename: string): string {
  const lower = filename.toLowerCase()
  if (CODE_EXTS.some(ext => lower.endsWith(ext))) return 'code'
  if (DOC_EXTS.some(ext => lower.endsWith(ext))) return 'document'
  if (DATA_EXTS.some(ext => lower.endsWith(ext))) return 'data'
  if (IMAGE_EXTS.some(ext => lower.endsWith(ext))) return 'image'
  if (ARCHIVE_EXTS.some(ext => lower.endsWith(ext))) return 'archive'
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

// Upload file to Supabase Storage
export async function uploadFile(
  jobId: number,
  version: number,
  filename: string,
  fileBuffer: ArrayBuffer,
  mimeType: string
): Promise<{ path: string; error?: string }> {
  if (!supabaseAdmin) return { path: '', error: 'Supabase not configured' }
  if (!Number.isFinite(jobId) || !Number.isFinite(version)) {
    return { path: '', error: 'Invalid jobId/version' }
  }

  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200)
  const path = `${Math.floor(jobId)}/${Math.floor(version)}/${safeFilename}`
  try { assertSafeStoragePath(path) } catch (e: any) { return { path: '', error: e.message } }

  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, fileBuffer, {
      contentType: mimeType,
      upsert: false,
    })

  if (error) return { path: '', error: error.message }
  return { path }
}

// Download file from Supabase Storage (uses admin client because the deliverables
// bucket is private; per-job access control is enforced in the route handler).
export async function downloadFile(
  storagePath: string
): Promise<{ data: ArrayBuffer | null; error?: string }> {
  const client = supabaseAdmin || supabase
  if (!client) return { data: null, error: 'Supabase not configured' }
  try { assertSafeStoragePath(storagePath) } catch (e: any) { return { data: null, error: e.message } }

  const { data, error } = await client.storage
    .from(BUCKET)
    .download(storagePath)

  if (error) return { data: null, error: error.message }
  const buffer = await data.arrayBuffer()
  return { data: buffer }
}

// Get file as text (for evaluator)
export async function getFileAsText(storagePath: string): Promise<string | null> {
  const client = supabaseAdmin || supabase
  if (!client) return null
  try { assertSafeStoragePath(storagePath) } catch { return null }

  const { data, error } = await client.storage
    .from(BUCKET)
    .download(storagePath)

  if (error) return null
  return await data.text()
}

// Delete file from Supabase Storage
export async function deleteFile(storagePath: string): Promise<boolean> {
  if (!supabaseAdmin) return false
  try { assertSafeStoragePath(storagePath) } catch { return false }

  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .remove([storagePath])

  return !error
}

// Delete multiple files
export async function deleteFiles(storagePaths: string[]): Promise<boolean> {
  if (!supabaseAdmin || storagePaths.length === 0) return false
  for (const p of storagePaths) {
    try { assertSafeStoragePath(p) } catch { return false }
  }

  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .remove(storagePaths)

  return !error
}
