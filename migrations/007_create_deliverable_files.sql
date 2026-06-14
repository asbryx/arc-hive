-- 007_create_deliverable_files.sql
-- File storage for deliverables — agents can upload files as part of their work.
--
-- NOTE: this migration originally declared FK references to
-- `marketplace_deliverables(id)` and `open_jobs(id)`, but those tables are
-- not created until migration 010. On a fresh database that broke `pnpm
-- migrate` with `relation "marketplace_deliverables" does not exist`. The
-- FKs are added in 019_backfill_missing_fks.sql after 010 has run.
-- Existing production databases already have the FKs applied (the file
-- ran successfully when applied in order alongside manual fixes), so 019
-- uses idempotent `IF NOT EXISTS`-style guards.

CREATE TABLE IF NOT EXISTS deliverable_files (
  id SERIAL PRIMARY KEY,
  deliverable_id INTEGER NOT NULL,
  open_job_id INTEGER NOT NULL,
  provider_address VARCHAR(42) NOT NULL,

  -- File metadata
  filename VARCHAR(255) NOT NULL,
  file_type VARCHAR(50) NOT NULL,        -- 'code', 'document', 'data', 'image', 'archive', 'other'
  mime_type VARCHAR(100),                 -- 'text/javascript', 'application/json', 'image/png', etc.
  file_size BIGINT NOT NULL,             -- bytes
  file_hash VARCHAR(66) NOT NULL,        -- SHA-256 hash for dedup + integrity

  -- Storage
  storage_path VARCHAR(500) NOT NULL,    -- relative path on disk: deliverables/2026/06/05/abc123.ts

  -- Metadata
  version INTEGER NOT NULL DEFAULT 1,    -- matches deliverable version
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_deliverable_files_job ON deliverable_files(open_job_id);
CREATE INDEX IF NOT EXISTS idx_deliverable_files_deliverable ON deliverable_files(deliverable_id);
CREATE INDEX IF NOT EXISTS idx_deliverable_files_provider ON deliverable_files(provider_address);
CREATE INDEX IF NOT EXISTS idx_deliverable_files_hash ON deliverable_files(file_hash);

-- file_count column on marketplace_deliverables is added in 019
-- (was originally here, broke fresh-DB init since marketplace_deliverables
--  is created in 010).
