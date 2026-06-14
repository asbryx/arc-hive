import { Hono } from 'hono'
import { query } from '../db.js'
import { supabase, supabaseAdmin, uploadFile, downloadFile, deleteFile, detectFileType } from '../supabase.js'
import { createHash } from 'crypto'
import { fileTypeFromBuffer } from 'file-type'
import { requireAuth } from '../middleware/auth.js'

export const fileRoutes = new Hono()

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB per file
const MAX_FILES_PER_DELIVERABLE = 10
const ALLOWED_MIME_PREFIXES = [
  'text/', 'application/json', 'application/javascript', 'application/typescript',
  'application/pdf', 'application/zip', 'application/x-tar', 'application/gzip',
  'image/png', 'image/jpeg', 'image/gif', 'image/svg+xml', 'image/webp',
]

function isAllowedMime(mime: string, filename?: string): boolean {
  // Check mime type first
  if (ALLOWED_MIME_PREFIXES.some(prefix => mime.startsWith(prefix))) return true
  // Fallback: check file extension when mime is generic (e.g. application/octet-stream)
  if (filename && (mime === 'application/octet-stream' || !mime)) {
    const ext = filename.toLowerCase().split('.').pop()
    const allowedExts = ['ts', 'js', 'py', 'sol', 'rs', 'go', 'jsx', 'tsx', 'c', 'cpp', 'java',
      'rb', 'php', 'swift', 'kt', 'md', 'txt', 'doc', 'docx', 'pdf', 'rtf',
      'json', 'csv', 'yaml', 'yml', 'xml', 'toml', 'sql', 'html', 'css',
      'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'zip', 'tar', 'gz']
    return ext ? allowedExts.includes(ext) : false
  }
  return false
}

// POST /api/open-jobs/:id/deliver — submit deliverable with optional files
// Supports both JSON (backward compatible) and multipart/form-data (with files)
fileRoutes.post('/:id/deliver', requireAuth, async (c) => {
  const id = c.req.param('id')
  const contentType = c.req.header('content-type') || ''

  let applicantAddress: string
  let content: string | null = null
  let link: string | null = null
  let notes: string | null = null
  let files: File[] = []

  // Parse request based on content type
  if (contentType.includes('multipart/form-data')) {
    const body = await c.req.parseBody({ all: true })
    applicantAddress = (body.applicantAddress as string) || ''
    content = (body.content as string) || null
    link = (body.link as string) || null
    notes = (body.notes as string) || null

    // Collect files (could be single or multiple)
    const rawFiles = body.files
    if (rawFiles) {
      files = Array.isArray(rawFiles) ? rawFiles as File[] : [rawFiles as File]
    }
  } else {
    // Backward compatible JSON mode
    const body = await c.req.json()
    applicantAddress = body.applicantAddress
    content = body.content
    link = body.link
    notes = body.notes
  }

  // Validate
  const authWallet = ((c as any).get('wallet') as string)?.toLowerCase()
  if (!applicantAddress) {
    return c.json({ error: 'applicantAddress required' }, 400)
  }
  if (authWallet !== applicantAddress.toLowerCase()) {
    return c.json({ error: 'Can only submit deliverables as your own wallet' }, 403)
  }
  if (!content && files.length === 0) {
    return c.json({ error: 'Either content or at least one file is required' }, 400)
  }
  if (content && content.length > 100_000) {
    return c.json({ error: 'Content exceeds 100KB limit' }, 400)
  }
  if (files.length > MAX_FILES_PER_DELIVERABLE) {
    return c.json({ error: `Max ${MAX_FILES_PER_DELIVERABLE} files per deliverable` }, 400)
  }

  // Find job
  const jobResult = await query(
    `SELECT * FROM open_jobs WHERE (id = $1 OR job_id = $1::bigint) AND lower(selected_applicant) = lower($2)`,
    [id, applicantAddress]
  )
  if (jobResult.rows.length === 0) {
    return c.json({ error: 'Job not found or not assigned to you' }, 404)
  }
  if (!['funded', 'in_progress', 'revision_requested'].includes(jobResult.rows[0].status)) {
    return c.json({ error: 'Job must be funded, in progress, or awaiting revision to deliver' }, 400)
  }

  const job = jobResult.rows[0]

  // Get next version
  const versionResult = await query(
    `SELECT COALESCE(MAX(version), 0) as max_version FROM marketplace_deliverables WHERE open_job_id = $1`,
    [job.id]
  )
  const nextVersion = parseInt(versionResult.rows[0].max_version) + 1

  // Insert deliverable
  const deliverableResult = await query(
    `INSERT INTO marketplace_deliverables (open_job_id, provider_address, content, link, notes, version)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [job.id, applicantAddress.toLowerCase(), content, link, notes, nextVersion]
  )
  const deliverableId = deliverableResult.rows[0].id

  // Upload files to Supabase
  const uploadedFiles: any[] = []
  const errors: string[] = []

  for (const file of files) {
    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      errors.push(`${file.name}: exceeds 10MB limit (${(file.size / 1024 / 1024).toFixed(1)}MB)`)
      continue
    }

    // Read file first to detect MIME from magic bytes (not client-supplied)
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Detect MIME type from file content (magic bytes), not from client-supplied Content-Type
    const detected = await fileTypeFromBuffer(buffer)
    const mime = detected?.mime || 'application/octet-stream'

    // Validate mime type
    if (!isAllowedMime(mime, file.name)) {
      errors.push(`${file.name}: file type not allowed (${mime})`)
      continue
    }

    // Compute hash
    const hash = createHash('sha256').update(buffer).digest('hex')

    // Detect file type
    const fileType = detectFileType(file.name)

    // Upload to Supabase
    const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const storagePath = `${job.job_id ?? job.id}/${nextVersion}/${safeFilename}`

    // job.job_id comes back from pg as a string (BIGINT) — coerce to number for
    // uploadFile's Number.isFinite check. Falls through to job.id (SERIAL) which
    // is already a number. Bug fixed 2026-06-15: previous code passed the raw
    // string and uploadFile rejected with "Invalid jobId/version", failing every
    // deliverable upload.
    const numericJobId = job.job_id != null ? Number(job.job_id) : job.id
    const uploadResult = await uploadFile(
      numericJobId,
      nextVersion,
      file.name,
      arrayBuffer,
      mime
    )

    if (uploadResult.error) {
      errors.push(`${file.name}: upload failed — ${uploadResult.error}`)
      continue
    }

    // Save metadata to DB (files expire after 30 days)
    await query(
      `INSERT INTO deliverable_files (deliverable_id, open_job_id, provider_address, filename, file_type, mime_type, file_size, file_hash, storage_path, version, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW() + INTERVAL '30 days')`,
      [deliverableId, job.id, applicantAddress.toLowerCase(), file.name, fileType, mime, file.size, hash, uploadResult.path, nextVersion]
    )

    uploadedFiles.push({
      filename: file.name,
      fileType,
      size: file.size,
      hash: `0x${hash}`,
    })
  }

  // If all files failed validation and no files were uploaded, return 400
  if (errors.length > 0 && uploadedFiles.length === 0) {
    return c.json({ error: 'All files failed validation', errors }, 400)
  }

  // Update job status
  await query(
    `UPDATE open_jobs SET status = 'evaluating', updated_at = NOW() WHERE id = $1`,
    [job.id]
  )

  // Update file count on deliverable
  await query(
    `UPDATE marketplace_deliverables SET file_count = $1 WHERE id = $2`,
    [uploadedFiles.length, deliverableId]
  )

  return c.json({
    id: deliverableId,
    version: nextVersion,
    files: uploadedFiles,
    errors: errors.length > 0 ? errors : undefined,
  })
})

// GET /api/open-jobs/:id/files — list files for a job (with expiry info, auth required)
fileRoutes.get('/:id/files', requireAuth, async (c) => {
  const id = c.req.param('id')
  const requester = ((c as any).get('wallet') as string)?.toLowerCase() || null

  // Find job
  const jobResult = await query(
    `SELECT id, client_address, selected_applicant, status FROM open_jobs WHERE id = $1 OR job_id = $1::bigint`,
    [id]
  )
  if (jobResult.rows.length === 0) {
    return c.json({ error: 'Job not found' }, 404)
  }

  const job = jobResult.rows[0]
  const isClient = requester && job.client_address && requester === job.client_address.toLowerCase()
  const isProvider = requester && job.selected_applicant && requester === job.selected_applicant.toLowerCase()

  // Only client (after approval) or provider can see files
  const isApproved = ['completed', 'approved'].includes(job.status)

  // Gate: must be client or provider to list files
  if (!isClient && !isProvider) {
    return c.json({ error: 'Access denied' }, 403)
  }

  // Get files
  const filesResult = await query(
    `SELECT df.*, md.status as deliverable_status
     FROM deliverable_files df
     JOIN marketplace_deliverables md ON md.id = df.deliverable_id
     WHERE df.open_job_id = $1
     ORDER BY df.version DESC, df.id ASC`,
    [job.id]
  )

  const now = new Date()
  const files = filesResult.rows.map(row => {
    const expiresAt = row.expires_at ? new Date(row.expires_at) : null
    const expired = expiresAt ? expiresAt < now : false
    const hoursLeft = expiresAt ? Math.max(0, (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60)) : null

    return {
      id: row.id,
      filename: row.filename,
      fileType: row.file_type,
      mimeType: row.mime_type,
      size: row.file_size,
      hash: `0x${row.file_hash}`,
      version: row.version,
      deliverableStatus: row.deliverable_status,
      expired,
      expiresAt: row.expires_at,
      hoursUntilExpiry: hoursLeft ? Math.round(hoursLeft * 10) / 10 : null,
      // Only show download URL if client (after approval) or provider
      downloadable: (isClient && isApproved) || isProvider,
    }
  })

  return c.json({ data: files })
})

// GET /api/open-jobs/:id/files/:fileId/download — download a specific file (auth required)
fileRoutes.get('/:id/files/:fileId/download', requireAuth, async (c) => {
  const id = c.req.param('id')
  const fileId = c.req.param('fileId')
  const requester = ((c as any).get('wallet') as string)?.toLowerCase() || null

  if (!requester) {
    return c.json({ error: 'Authentication required' }, 401)
  }

  // Find job
  const jobResult = await query(
    `SELECT id, client_address, selected_applicant, status FROM open_jobs WHERE id = $1 OR job_id = $1::bigint`,
    [id]
  )
  if (jobResult.rows.length === 0) {
    return c.json({ error: 'Job not found' }, 404)
  }

  const job = jobResult.rows[0]
  const isClient = requester === job.client_address?.toLowerCase()
  const isProvider = requester === job.selected_applicant?.toLowerCase()
  const isApproved = ['completed', 'approved'].includes(job.status)

  // Access control: only client (after approval) or provider can download
  if (!isClient && !isProvider) {
    return c.json({ error: 'Access denied' }, 403)
  }
  if (isClient && !isApproved) {
    return c.json({ error: 'Files not available until job is approved' }, 403)
  }

  // Find file
  const fileResult = await query(
    `SELECT * FROM deliverable_files WHERE id = $1 AND open_job_id = $2`,
    [fileId, job.id]
  )
  if (fileResult.rows.length === 0) {
    return c.json({ error: 'File not found' }, 404)
  }

  const file = fileResult.rows[0]

  // Check if expired
  if (file.expires_at && new Date(file.expires_at) < new Date()) {
    return c.json({ error: 'File has expired and been deleted' }, 410)
  }

  // Download from Supabase
  const { data, error } = await downloadFile(file.storage_path)
  if (error || !data) {
    return c.json({ error: 'File not found in storage' }, 404)
  }

  // Log the download (non-fatal if table doesn't exist)
  try {
    await query(
      `INSERT INTO open_job_events (open_job_id, event_type, actor_address, data)
       VALUES ($1, 'file_downloaded', $2, $3)`,
      [job.id, requester, JSON.stringify({ fileId: file.id, filename: file.filename })]
    )
  } catch {}

  // Determine safe MIME type: override SVG to prevent stored XSS via embedded JS
  const isSvg = file.mime_type === 'image/svg+xml' || file.filename?.toLowerCase().endsWith('.svg')
  const safeMimeType = isSvg ? 'application/octet-stream' : (file.mime_type || 'application/octet-stream')

  // Return file — always force attachment disposition to prevent inline rendering
  return new Response(data, {
    headers: {
      'Content-Type': safeMimeType,
      'Content-Disposition': (() => {
        const safeName = (file.filename || 'download').replace(/[^a-zA-Z0-9._-]/g, '_')
        const encodedName = encodeURIComponent(file.filename || 'download')
        return `attachment; filename="${safeName}"; filename*=UTF-8''${encodedName}`
      })(),
      'Content-Length': file.file_size.toString(),
      // Prevent MIME sniffing so browsers don't reinterpret the content
      'X-Content-Type-Options': 'nosniff',
    },
  })
})


// Delete expired deliverable files from storage and database metadata.
export async function cleanupExpiredFiles(): Promise<{ deleted: number; failed: number }> {
  const result = await query(
    `SELECT id, storage_path FROM deliverable_files WHERE expires_at IS NOT NULL AND expires_at < NOW()`
  )

  let deleted = 0
  let failed = 0
  for (const row of result.rows) {
    const ok = await deleteFile(row.storage_path)
    if (!ok) {
      failed++
      continue
    }
    await query(`DELETE FROM deliverable_files WHERE id = $1`, [row.id])
    deleted++
  }

  return { deleted, failed }
}
