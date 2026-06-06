-- 012_fix_missing_tables_and_columns.sql
-- Fixes missing tables referenced by API code and missing columns

-- ─── marketplace_comments (referenced by open-jobs.ts comments endpoints) ─────
CREATE TABLE IF NOT EXISTS marketplace_comments (
  id SERIAL PRIMARY KEY,
  open_job_id INTEGER NOT NULL REFERENCES open_jobs(id) ON DELETE CASCADE,
  sender_address VARCHAR(42) NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marketplace_comments_job ON marketplace_comments(open_job_id);

-- ─── job_deliverables (referenced by jobs.ts deliverable endpoint) ────────────
CREATE TABLE IF NOT EXISTS job_deliverables (
  id SERIAL PRIMARY KEY,
  job_id BIGINT NOT NULL,
  provider_address VARCHAR(42) NOT NULL,
  content TEXT NOT NULL,
  link TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(job_id)
);

CREATE INDEX IF NOT EXISTS idx_job_deliverables_job ON job_deliverables(job_id);

-- ─── Add missing columns to open_jobs (referenced by fund/complete flow) ──────
ALTER TABLE open_jobs ADD COLUMN IF NOT EXISTS onchain_job_id BIGINT;
ALTER TABLE open_jobs ADD COLUMN IF NOT EXISTS funded_tx VARCHAR(66);
ALTER TABLE open_jobs ADD COLUMN IF NOT EXISTS funded_at TIMESTAMPTZ;
ALTER TABLE open_jobs ADD COLUMN IF NOT EXISTS final_budget NUMERIC(78,0);
ALTER TABLE open_jobs ADD COLUMN IF NOT EXISTS completed_tx VARCHAR(66);
ALTER TABLE open_jobs ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE open_jobs ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;

-- ─── Add client_feedback to marketplace_deliverables (referenced by reject flow)
ALTER TABLE marketplace_deliverables ADD COLUMN IF NOT EXISTS client_feedback TEXT;

-- ─── Add status/evaluation columns to evaluations (referenced by API) ─────────
ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS status VARCHAR(20);
ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS breakdown JSONB;
ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS suggestions TEXT;
ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS tx_hash VARCHAR(66);
ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS llm_model VARCHAR(100);

-- ─── Fix migration 007 ordering: ensure marketplace_deliverables exists first ──
-- (This migration runs AFTER 010, so marketplace_deliverables already exists.
--  If running fresh, this is handled by IF NOT EXISTS on all CREATE TABLE.)
