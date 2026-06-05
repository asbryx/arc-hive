import { Hono } from 'hono'
import { query } from '../db.js'
import { supabase, uploadFile, downloadFile, deleteFile, detectFileType } from '../supabase.js'
import { createHash } from 'crypto'
import { requireAuth } from '../middleware/auth.js'

export const fileRoutes = new Hono()

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB per file
const MAX_FILES_PER_DELIVERABLE = 10
const ALLOWED_MIME_PREFIXES = [
  'text/', 'application/json', 'application/javascript', 'application/typescript',
  'application/pdf', 'application/zip', 'application/x-tar', 'application/gzip',
  'image/png', 'image/jpeg', 'image/gif', 'image/svg+xml', 'image/webp',
]

function isAllowedMime(mime: string): boolean {
  return ALLOWED_MIME_PREFIXES.some(prefix => mime.startsWith(prefix))
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

  // Validation
  if (!applicantAddress) {
    return c.json({ error: 'applicantAddress required' }, 400)
  }
  if (!content && files.length === 0) {
    return c.json({ error: 'Either content or at least one file is required' }, 400)
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

    // Validate mime type
    const mime = file.type || 'application/octet-stream'
    if (!isAllowedMime(mime)) {
      errors.push(`${file.name}: file type not allowed (${mime})`)
      continue
    }

    // Read file
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Compute hash
    const hash = createHash('sha256').update(buffer).digest('hex')

    // Detect file type
    const fileType = detectFileType(file.name)

    // Upload to Supabase
    const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const storagePath = `${job.job_id || job.id}/${nextVersion}/${safeFilename}`

    const uploadResult = await uploadFile(
      job.job_id || job.id,
      nextVersion,
      file.name,
      arrayBuffer,
      mime
    )

    if (uploadResult.error) {
      errors.push(`${file.name}: upload failed — ${uploadResult.error}`)
      continue
    }

    // Save metadata to DB
    await query(
      `INSERT INTO deliverable_files (deliverable_id, open_job_id, provider_address, filename, file_type, mime_type, file_size, file_hash, storage_path, version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [deliverableId, job.id, applicantAddress.toLowerCase(), file.name, fileType, mime, file.size, hash, uploadResult.path, nextVersion]
    )

    uploadedFiles.push({
      filename: file.name,
      fileType,
      size: file.size,
      hash: `0x${hash}`,
    })
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

// GET /api/open-jobs/:id/files — list files for a job (with expiry info)
fileRoutes.get('/:id/files', async (c) => {
  const id = c.req.param('id')
  const requester = c.req.query('requester')?.toLowerCase() || null

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

// GET /api/open-jobs/:id/files/:fileId/download — download a specific file
fileRoutes.get('/:id/files/:fileId/download', async (c) => {
  const id = c.req.param('id')
  const fileId = c.req.param('fileId')
  const requester = c.req.query('requester')?.toLowerCase() || null

  if (!requester) {
    return c.json({ error: 'requester query param required' }, 400)
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

  // Log the download
  await query(
    `INSERT INTO job_events (open_job_id, event_type, actor_address, data)
     VALUES ($1, 'file_downloaded', $2, $3)`,
    [job.id, requester, JSON.stringify({ fileId: file.id, filename: file.filename })]
  )

  // Return file
  return new Response(data, {
    headers: {
      'Content-Type': file.mime_type || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${file.filename}"`,
      'Content-Length': file.file_size.toString(),
    },
  })
})
