import { Hono } from 'hono'
import { getPool, query } from '../db.js'
import { uploadFile, downloadFile, deleteFile, deleteFiles, detectFileType } from '../supabase.js'
import { createHash } from 'crypto'
import { fileTypeFromBuffer } from 'file-type'
import { requireAuth } from '../middleware/auth.js'

export const fileRoutes = new Hono()

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB per file
const MAX_FILES_PER_DELIVERABLE = 10
const ALLOWED_MIME_PREFIXES = [
  'text/',
  'application/json',
  'application/javascript',
  'application/typescript',
  'application/pdf',
  'application/zip',
  'application/x-tar',
  'application/gzip',
  'application/x-gzip',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]
const ALLOWED_MIME_TYPES = new Set([
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/x-7z-compressed',
  'application/vnd.rar',
  'application/x-msdownload',
  'application/vnd.microsoft.portable-executable',
])
const ALLOWED_EXTENSIONS = new Set([
  'ts',
  'js',
  'py',
  'sol',
  'rs',
  'go',
  'jsx',
  'tsx',
  'c',
  'cpp',
  'java',
  'rb',
  'php',
  'swift',
  'kt',
  'md',
  'txt',
  'doc',
  'docx',
  'pdf',
  'rtf',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'json',
  'csv',
  'yaml',
  'yml',
  'xml',
  'toml',
  'sql',
  'html',
  'css',
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'bmp',
  'zip',
  'tar',
  'gz',
  'tgz',
  'rar',
  '7z',
  'dll',
])

function isAllowedMime(mime: string, filename?: string): boolean {
  if (
    ALLOWED_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix)) ||
    ALLOWED_MIME_TYPES.has(mime)
  )
    return true
  // Fallback: extension checks are only permitted for generic/unidentified bytes.
  if (filename && (mime === 'application/octet-stream' || !mime)) {
    const ext = filename.toLowerCase().split('.').pop()
    return !!ext && ALLOWED_EXTENSIONS.has(ext)
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
      files = Array.isArray(rawFiles) ? (rawFiles as File[]) : [rawFiles as File]
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

  // Validate every file before changing storage or database state. A mixed
  // request is all-or-nothing: silently dropping a requested artifact produces
  // a deliverable that the evaluator cannot honestly assess.
  const preparedFiles: Array<{
    name: string
    fileType: string
    mime: string
    size: number
    hash: string
    data: ArrayBuffer
  }> = []
  const errors: string[] = []
  const seenNames = new Set<string>()

  for (const file of files) {
    if (file.size > MAX_FILE_SIZE) {
      errors.push(`${file.name}: exceeds 10MB limit (${(file.size / 1024 / 1024).toFixed(1)}MB)`)
      continue
    }

    const data = await file.arrayBuffer()
    const buffer = Buffer.from(data)
    const detected = await fileTypeFromBuffer(buffer)
    const mime = detected?.mime || 'application/octet-stream'
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200)

    if (!safeName || !isAllowedMime(mime, file.name)) {
      errors.push(`${file.name}: file type not allowed (${mime})`)
      continue
    }
    if (seenNames.has(safeName)) {
      errors.push(`${file.name}: duplicate filename in one deliverable`)
      continue
    }
    seenNames.add(safeName)
    preparedFiles.push({
      name: file.name,
      fileType: detectFileType(file.name),
      mime,
      size: file.size,
      hash: createHash('sha256').update(buffer).digest('hex'),
      data,
    })
  }

  if (errors.length > 0) {
    return c.json({ error: 'File validation failed', errors }, 400)
  }

  // A file-only submission still needs stable text for evaluator input and the
  // on-chain JobSubmitted content hash. Bind that text to each uploaded object.
  const deliverableContent =
    content?.trim() ||
    [
      'File deliverable manifest',
      ...preparedFiles.map((file) => `${file.name} sha256:${file.hash}`),
    ].join('\n')

  // Hold the job row lock across version allocation, storage upload, and DB
  // commit. This makes an upload a single submission: no duplicate version,
  // no persisted deliverable before all requested artifacts exist, and no DB
  // metadata without a storage object.
  const dbClient = await getPool().connect()
  const uploadedStoragePaths: string[] = []
  let transactionOpen = false
  let committed = false

  try {
    await dbClient.query('BEGIN')
    transactionOpen = true

    const jobResult = await dbClient.query(
      `SELECT * FROM open_jobs
       WHERE (id = $1 OR job_id = $1::bigint) AND lower(selected_applicant) = lower($2)
       FOR UPDATE`,
      [id, applicantAddress],
    )
    if (jobResult.rows.length === 0) {
      return c.json({ error: 'Job not found or not assigned to you' }, 404)
    }

    const job = jobResult.rows[0]
    if (!['funded', 'in_progress', 'revision_requested'].includes(job.status)) {
      return c.json(
        { error: 'Job must be funded, in progress, or awaiting revision to deliver' },
        400,
      )
    }

    const versionResult = await dbClient.query(
      `SELECT COALESCE(MAX(version), 0) as max_version FROM marketplace_deliverables WHERE open_job_id = $1`,
      [job.id],
    )
    const nextVersion = parseInt(versionResult.rows[0].max_version) + 1
    const storageJobId = job.job_id != null ? String(job.job_id) : String(job.id)

    for (const file of preparedFiles) {
      const uploadResult = await uploadFile(
        storageJobId,
        nextVersion,
        file.name,
        file.data,
        file.mime,
      )
      if (uploadResult.error)
        throw new Error(`File upload failed: ${file.name}: ${uploadResult.error}`)
      uploadedStoragePaths.push(uploadResult.path)
    }

    const deliverableResult = await dbClient.query(
      `INSERT INTO marketplace_deliverables (open_job_id, provider_address, content, link, notes, version, status, file_count)
       VALUES ($1, $2, $3, $4, $5, $6, 'submitted', $7) RETURNING id`,
      [
        job.id,
        applicantAddress.toLowerCase(),
        deliverableContent,
        link,
        notes,
        nextVersion,
        preparedFiles.length,
      ],
    )
    const deliverableId = deliverableResult.rows[0].id

    for (let index = 0; index < preparedFiles.length; index++) {
      const file = preparedFiles[index]
      await dbClient.query(
        `INSERT INTO deliverable_files (deliverable_id, open_job_id, provider_address, filename, file_type, mime_type, file_size, file_hash, storage_path, version)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          deliverableId,
          job.id,
          applicantAddress.toLowerCase(),
          file.name,
          file.fileType,
          file.mime,
          file.size,
          file.hash,
          uploadedStoragePaths[index],
          nextVersion,
        ],
      )
    }

    await dbClient.query(
      `UPDATE open_jobs SET status = 'evaluating', updated_at = NOW() WHERE id = $1`,
      [job.id],
    )
    await dbClient.query('COMMIT')
    transactionOpen = false
    committed = true

    return c.json({
      id: deliverableId,
      version: nextVersion,
      files: preparedFiles.map((file) => ({
        filename: file.name,
        fileType: file.fileType,
        size: file.size,
        hash: `0x${file.hash}`,
      })),
    })
  } catch (error: any) {
    if (transactionOpen) {
      await dbClient.query('ROLLBACK').catch(() => {})
      transactionOpen = false
    }
    const message = error?.message?.startsWith('File upload failed:')
      ? error.message
      : 'Could not save deliverable'
    return c.json({ error: message }, 500)
  } finally {
    if (transactionOpen) await dbClient.query('ROLLBACK').catch(() => {})
    dbClient.release()
    if (!committed && uploadedStoragePaths.length > 0) {
      const cleaned = await deleteFiles(uploadedStoragePaths)
      if (!cleaned)
        console.error('[files] failed to clean uploaded objects after deliverable rollback')
    }
  }
})

// GET /api/open-jobs/:id/files — list files for a job (with expiry info, auth required)
fileRoutes.get('/:id/files', requireAuth, async (c) => {
  const id = c.req.param('id')
  const requester = ((c as any).get('wallet') as string)?.toLowerCase() || null

  // Find job
  const jobResult = await query(
    `SELECT id, client_address, selected_applicant, status FROM open_jobs WHERE id = $1 OR job_id = $1::bigint`,
    [id],
  )
  if (jobResult.rows.length === 0) {
    return c.json({ error: 'Job not found' }, 404)
  }

  const job = jobResult.rows[0]
  const isClient = requester && job.client_address && requester === job.client_address.toLowerCase()
  const isProvider =
    requester && job.selected_applicant && requester === job.selected_applicant.toLowerCase()

  // Job is unlocked for the client only when an approved deliverable exists,
  // i.e. job.status === 'completed'. After 3 failed evaluations the job is
  // 'failed'/'refunded' — client gets money back but NEVER the files.
  // (The previous check also accepted job.status === 'approved' but that
  // status is for deliverables, not jobs — it was dead code.)
  const isClientUnlocked = job.status === 'completed'

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
    [job.id],
  )

  // Providers can inspect all of their own iterations. Clients see no file
  // metadata until a specific deliverable is approved and the job completes.
  const visibleRows = isProvider
    ? filesResult.rows
    : isClientUnlocked
      ? filesResult.rows.filter((row) => row.deliverable_status === 'approved')
      : []

  const now = new Date()
  const files = visibleRows.map((row) => {
    const expiresAt = row.expires_at ? new Date(row.expires_at) : null
    const expired = expiresAt ? expiresAt < now : false
    const hoursLeft = expiresAt
      ? Math.max(0, (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60))
      : null
    const downloadable = !expired

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
      downloadable,
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
    [id],
  )
  if (jobResult.rows.length === 0) {
    return c.json({ error: 'Job not found' }, 404)
  }

  const job = jobResult.rows[0]
  const isClient = requester === job.client_address?.toLowerCase()
  const isProvider = requester === job.selected_applicant?.toLowerCase()
  // Client only unlocks files once the job is 'completed' (= an approved
  // deliverable exists). 'failed'/'refunded' jobs (3-strike rejection) keep
  // files private — the client got their money back, the agent keeps the work.
  const isClientUnlocked = job.status === 'completed'

  // Access control: only client (after approval) or provider can download
  if (!isClient && !isProvider) {
    return c.json({ error: 'Access denied' }, 403)
  }
  if (isClient && !isClientUnlocked) {
    return c.json(
      {
        error:
          'Files not available until the deliverable is approved by the evaluator (score ≥ 70)',
      },
      403,
    )
  }

  // Find file. For clients, additionally require this specific file's
  // deliverable to be the approved one — files from earlier rejected
  // attempts stay locked even after a later attempt was approved.
  const fileResult = await query(
    `SELECT df.*, md.status AS deliverable_status
       FROM deliverable_files df
       JOIN marketplace_deliverables md ON md.id = df.deliverable_id
      WHERE df.id = $1 AND df.open_job_id = $2`,
    [fileId, job.id],
  )
  if (fileResult.rows.length === 0) {
    return c.json({ error: 'File not found' }, 404)
  }

  const file = fileResult.rows[0]
  if (isClient && file.deliverable_status !== 'approved') {
    return c.json(
      { error: 'This file belongs to a rejected attempt and is not viewable by the client' },
      403,
    )
  }

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
      [job.id, requester, JSON.stringify({ fileId: file.id, filename: file.filename })],
    )
  } catch {
    // Download auditing is non-critical.
  }

  // Determine safe MIME type
  const isSvg = file.mime_type === 'image/svg+xml' || file.filename?.toLowerCase().endsWith('.svg')
  const safeMimeType = isSvg
    ? 'application/octet-stream'
    : file.mime_type || 'application/octet-stream'

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
    `SELECT id, storage_path FROM deliverable_files WHERE expires_at IS NOT NULL AND expires_at < NOW()`,
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
