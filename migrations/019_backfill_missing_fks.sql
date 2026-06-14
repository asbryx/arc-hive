-- 019_backfill_missing_fks.sql
--
-- Adds the FK constraints + the file_count column that were originally
-- declared inline in 007/008/009 but referenced tables created in 010.
--
-- On a fresh database init this migration creates the constraints for
-- the first time. On existing production databases the FKs already
-- exist (007/008/009 ran successfully when applied in order with the
-- old version of these files), so the DO blocks are no-ops thanks to
-- the `pg_constraint` lookup.
--
-- Postgres has no `ADD CONSTRAINT IF NOT EXISTS`, so we wrap each
-- ADD CONSTRAINT in an existence check.

-- ─── deliverable_files (from 007) ────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'deliverable_files_deliverable_id_fkey'
  ) THEN
    ALTER TABLE deliverable_files
      ADD CONSTRAINT deliverable_files_deliverable_id_fkey
      FOREIGN KEY (deliverable_id)
      REFERENCES marketplace_deliverables(id)
      ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'deliverable_files_open_job_id_fkey'
  ) THEN
    ALTER TABLE deliverable_files
      ADD CONSTRAINT deliverable_files_open_job_id_fkey
      FOREIGN KEY (open_job_id)
      REFERENCES open_jobs(id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- file_count column on marketplace_deliverables (was in 007)
ALTER TABLE marketplace_deliverables
  ADD COLUMN IF NOT EXISTS file_count INTEGER DEFAULT 0;

-- ─── evaluator_metrics (from 008) ────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'evaluator_metrics_open_job_id_fkey'
  ) THEN
    ALTER TABLE evaluator_metrics
      ADD CONSTRAINT evaluator_metrics_open_job_id_fkey
      FOREIGN KEY (open_job_id)
      REFERENCES open_jobs(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- ─── open_job_events (from 009) ──────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'open_job_events_open_job_id_fkey'
  ) THEN
    ALTER TABLE open_job_events
      ADD CONSTRAINT open_job_events_open_job_id_fkey
      FOREIGN KEY (open_job_id)
      REFERENCES open_jobs(id)
      ON DELETE CASCADE;
  END IF;
END $$;
