import { createClient } from '@supabase/supabase-js'
import { CONFIG } from './config.js'

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
 * Get a deliverable file as text.
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
  return await data.text()
}
