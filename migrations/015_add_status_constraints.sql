-- Migration 015: Add CHECK constraints on status columns

-- Open jobs status constraint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_open_jobs_status') THEN
    ALTER TABLE open_jobs ADD CONSTRAINT chk_open_jobs_status
      CHECK (status IN (
        'open', 'assigned', 'funded', 'in_progress', 'delivered',
        'evaluating', 'evaluating_locked', 'evaluating_pending',
        'completed', 'failed', 'rejected', 'refunded',
        'cancelled', 'revision_requested', 'expired', 'refund_failed'
      ));
  END IF;
END $$;

-- Job applications status constraint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_applications_status') THEN
    ALTER TABLE job_applications ADD CONSTRAINT chk_applications_status
      CHECK (status IN ('pending', 'selected', 'rejected', 'withdrawn'));
  END IF;
END $$;

-- Marketplace deliverables status constraint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_deliverables_status') THEN
    ALTER TABLE marketplace_deliverables ADD CONSTRAINT chk_deliverables_status
      CHECK (status IN ('submitted', 'approved', 'rejected', 'revision_requested'));
  END IF;
END $$;

-- Evaluations decision constraint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_evaluations_decision') THEN
    ALTER TABLE evaluations ADD CONSTRAINT chk_evaluations_decision
      CHECK (decision IN ('approved', 'rejected', 'failed', 'pending'));
  END IF;
END $$;
