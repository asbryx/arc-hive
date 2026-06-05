import { createClient } from '@supabase/supabase-js'
import { CONFIG } from './config.js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_KEY

export const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null

const BUCKET = 'deliverables'

// Get file as text (for evaluator)
export async function getFileAsText(storagePath: string): Promise<string | null> {
  if (!supabase) return null

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .download(storagePath)

  if (error) return null
  return await data.text()
}
