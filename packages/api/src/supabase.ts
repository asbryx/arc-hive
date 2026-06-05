import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.warn('[supabase] WARNING: SUPABASE_URL or SUPABASE_SERVICE_KEY not set — file uploads disabled')
}

export const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null

const BUCKET = 'deliverables'

// File type detection by extension
const CODE_EXTS = ['.ts', '.js', '.py', '.sol', '.rs', '.go', '.jsx', '.tsx', '.c', '.cpp', '.java', '.rb', '.php', '.swift', '.kt']
const DOC_EXTS = ['.md', '.txt', '.doc', '.docx', '.pdf', '.rtf']
const DATA_EXTS = ['.json', '.csv', '.yaml', '.yml', '.xml', '.toml', '.sql']
const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp']
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

// Upload file to Supabase Storage
export async function uploadFile(
  jobId: number,
  version: number,
  filename: string,
  fileBuffer: ArrayBuffer,
  mimeType: string
): Promise<{ path: string; error?: string }> {
  if (!supabase) return { path: '', error: 'Supabase not configured' }

  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${jobId}/${version}/${safeFilename}`

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, fileBuffer, {
      contentType: mimeType,
      upsert: false,
    })

  if (error) return { path: '', error: error.message }
  return { path }
}

// Download file from Supabase Storage
export async function downloadFile(
  storagePath: string
): Promise<{ data: ArrayBuffer | null; error?: string }> {
  if (!supabase) return { data: null, error: 'Supabase not configured' }

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .download(storagePath)

  if (error) return { data: null, error: error.message }
  const buffer = await data.arrayBuffer()
  return { data: buffer }
}

// Get file as text (for evaluator)
export async function getFileAsText(storagePath: string): Promise<string | null> {
  if (!supabase) return null

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .download(storagePath)

  if (error) return null
  return await data.text()
}

// Delete file from Supabase Storage
export async function deleteFile(storagePath: string): Promise<boolean> {
  if (!supabase) return false

  const { error } = await supabase.storage
    .from(BUCKET)
    .remove([storagePath])

  return !error
}

// Delete multiple files
export async function deleteFiles(storagePaths: string[]): Promise<boolean> {
  if (!supabase || storagePaths.length === 0) return false

  const { error } = await supabase.storage
    .from(BUCKET)
    .remove(storagePaths)

  return !error
}
