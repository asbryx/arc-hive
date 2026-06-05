#!/usr/bin/env node
// Cleanup cron: deletes expired deliverable files from Supabase + DB
// Run hourly via PM2 or system cron

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import pg from 'pg'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_KEY
const dbUrl = process.env.DATABASE_URL || process.env.MARKETPLACE_DATABASE_URL

if (!supabaseUrl || !supabaseKey) {
  console.error('[cleanup] Missing SUPABASE_URL or SUPABASE_SERVICE_KEY')
  process.exit(1)
}
if (!dbUrl) {
  console.error('[cleanup] Missing DATABASE_URL')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)
const pool = new pg.Pool({ connectionString: dbUrl })
const BUCKET = 'deliverables'

async function cleanup() {
  console.log(`[cleanup] Starting file cleanup at ${new Date().toISOString()}`)

  // Find expired files
  const { rows: expiredFiles } = await pool.query(
    `SELECT id, storage_path, filename FROM deliverable_files WHERE expires_at < NOW()`
  )

  if (expiredFiles.length === 0) {
    console.log('[cleanup] No expired files found')
    return
  }

  console.log(`[cleanup] Found ${expiredFiles.length} expired files`)

  // Delete from Supabase Storage
  const storagePaths = expiredFiles.map(f => f.storage_path)
  const { error } = await supabase.storage.from(BUCKET).remove(storagePaths)

  if (error) {
    console.error('[cleanup] Supabase delete error:', error.message)
    // Still delete from DB even if Supabase fails (files might already be gone)
  } else {
    console.log(`[cleanup] Deleted ${storagePaths.length} files from Supabase`)
  }

  // Delete from DB
  const ids = expiredFiles.map(f => f.id)
  await pool.query(
    `DELETE FROM deliverable_files WHERE id = ANY($1)`,
    [ids]
  )
  console.log(`[cleanup] Deleted ${ids.length} records from DB`)

  // Log details
  for (const file of expiredFiles) {
    console.log(`[cleanup]   - ${file.filename} (${file.storage_path})`)
  }
}

cleanup()
  .then(() => {
    console.log('[cleanup] Done')
    pool.end()
    process.exit(0)
  })
  .catch(err => {
    console.error('[cleanup] Error:', err)
    pool.end()
    process.exit(1)
  })
