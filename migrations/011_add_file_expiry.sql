-- 011_add_file_expiry.sql
-- Add expires_at column to deliverable_files

ALTER TABLE deliverable_files ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_deliverable_files_expires ON deliverable_files(expires_at);
