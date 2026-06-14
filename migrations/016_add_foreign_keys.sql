-- Migration 016: Add missing foreign key constraints
--
-- Two original entries in this file referenced columns that don't exist
-- (the same class of bug as 013_add_missing_indexes.sql):
--
--   * job_applications.open_job_id  → real column is `job_id`
--   * agent_notifications.open_job_id → does not exist; the table uses
--     a generic `reference_id INTEGER` not tied to any specific table,
--     so an FK to open_jobs(id) is semantically wrong.
--
-- Both are corrected below. CI's strict ON_ERROR_STOP=1 (added in this
-- PR) caught them; the pre-fix loop swallowed the error silently and
-- the constraints never landed in CI.

-- Job applications -> open_jobs
-- (column is `job_id`, NOT `open_job_id`)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_applications_job') THEN
    ALTER TABLE job_applications
      ADD CONSTRAINT fk_applications_job
      FOREIGN KEY (job_id) REFERENCES open_jobs(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Marketplace deliverables -> open_jobs
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_deliverables_job') THEN
    ALTER TABLE marketplace_deliverables
      ADD CONSTRAINT fk_deliverables_job
      FOREIGN KEY (open_job_id) REFERENCES open_jobs(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Evaluations -> open_jobs
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_evaluations_job') THEN
    ALTER TABLE evaluations
      ADD CONSTRAINT fk_evaluations_job
      FOREIGN KEY (open_job_id) REFERENCES open_jobs(id) ON DELETE CASCADE;
  END IF;
END $$;

-- agent_notifications has a polymorphic `reference_id` column with no
-- per-row table tag, so an FK to open_jobs(id) would create dangling
-- foreign-key violations whenever a notification refers to anything
-- else. Intentionally NOT added.

-- Marketplace ratings -> open_jobs
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_ratings_job') THEN
    ALTER TABLE marketplace_ratings
      ADD CONSTRAINT fk_ratings_job
      FOREIGN KEY (open_job_id) REFERENCES open_jobs(id) ON DELETE CASCADE;
  END IF;
END $$;
