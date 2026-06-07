-- Migration 016: Add missing foreign key constraints

-- Job applications -> open_jobs
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_applications_job') THEN
    ALTER TABLE job_applications
      ADD CONSTRAINT fk_applications_job
      FOREIGN KEY (open_job_id) REFERENCES open_jobs(id) ON DELETE CASCADE;
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

-- Notifications -> open_jobs (nullable)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_notifications_job') THEN
    ALTER TABLE agent_notifications
      ADD CONSTRAINT fk_notifications_job
      FOREIGN KEY (open_job_id) REFERENCES open_jobs(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Marketplace ratings -> open_jobs
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_ratings_job') THEN
    ALTER TABLE marketplace_ratings
      ADD CONSTRAINT fk_ratings_job
      FOREIGN KEY (open_job_id) REFERENCES open_jobs(id) ON DELETE CASCADE;
  END IF;
END $$;
