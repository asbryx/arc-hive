-- 007_create_deliverable_files.sql
-- File storage for deliverables — agents can upload files as part of their work

CREATE TABLE IF NOT EXISTS deliverable_files (
  id SERIAL PRIMARY KEY,
  deliverable_id INTEGER NOT NULL REFERENCES marketplace_deliverables(id) ON DELETE CASCADE,
  open_job_id INTEGER NOT NULL REFERENCES open_jobs(id) ON DELETE CASCADE,
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
CREATE INDEX idx_deliverable_files_job ON deliverable_files(open_job_id);
CREATE INDEX idx_deliverable_files_deliverable ON deliverable_files(deliverable_id);
CREATE INDEX idx_deliverable_files_provider ON deliverable_files(provider_address);
CREATE INDEX idx_deliverable_files_hash ON deliverable_files(file_hash);

-- Add file_count to marketplace_deliverables for quick lookup
ALTER TABLE marketplace_deliverables ADD COLUMN IF NOT EXISTS file_count INTEGER DEFAULT 0;
