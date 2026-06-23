-- Migration 026: Clean orphan rows + add the FKs that 016 never actually landed
--
-- Background (audit 2026-06-23, findings L5-1/L5-2/L5-3):
--   Migration 016 is RECORDED in _migrations as applied, but its
--   `fk_applications_job` constraint does NOT exist on job_applications
--   (the DO/IF-NOT-EXISTS block ran but the ADD CONSTRAINT silently
--   no-op'd — almost certainly because orphan rows already violated it,
--   or a same-named constraint was later dropped). Re-running 016 is a
--   no-op because it's marked done. So we fix it here for real.
--
--   Neither job_applications nor job_deliverables has any FK to open_jobs.
--   That let ~10 orphan applications + 5 orphan deliverables accumulate,
--   all holding ON-CHAIN job IDs (62124..115586) in a column that should
--   reference open_jobs.id (1..81). These are legacy/malformed rows from
--   late-May/early-June before the local-vs-onchain id convention settled.
--
-- This migration:
--   1. Logs + deletes the orphan rows (FK cannot be added while violated).
--   2. Adds the FKs idempotently (pg_constraint guard, like 016/019).
--   3. Asserts the constraints actually exist at the end (don't trust the
--      _migrations record — verify the real catalog state).
--
-- Apply by hand (migrations are NOT auto-applied):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/026_fix_application_deliverable_fks.sql

BEGIN;

-- ── 1. Surface + delete orphan job_applications ──────────────────────────────
DO $$
DECLARE
  n int;
BEGIN
  SELECT count(*) INTO n FROM job_applications a
    WHERE NOT EXISTS (SELECT 1 FROM open_jobs j WHERE j.id = a.job_id);
  RAISE NOTICE '[026] Deleting % orphan job_applications (job_id not in open_jobs.id)', n;
END $$;

DELETE FROM job_applications a
  WHERE NOT EXISTS (SELECT 1 FROM open_jobs j WHERE j.id = a.job_id);

-- ── 2. Surface + delete orphan job_deliverables ──────────────────────────────
DO $$
DECLARE
  n int;
BEGIN
  SELECT count(*) INTO n FROM job_deliverables d
    WHERE NOT EXISTS (SELECT 1 FROM open_jobs j WHERE j.id = d.job_id);
  RAISE NOTICE '[026] Deleting % orphan job_deliverables (job_id not in open_jobs.id)', n;
END $$;

DELETE FROM job_deliverables d
  WHERE NOT EXISTS (SELECT 1 FROM open_jobs j WHERE j.id = d.job_id);

-- ── 3. Add FK: job_applications.job_id -> open_jobs(id) ───────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_applications_job') THEN
    ALTER TABLE job_applications
      ADD CONSTRAINT fk_applications_job
      FOREIGN KEY (job_id) REFERENCES open_jobs(id) ON DELETE CASCADE;
    RAISE NOTICE '[026] Added fk_applications_job';
  ELSE
    RAISE NOTICE '[026] fk_applications_job already present';
  END IF;
END $$;

-- ── 4. Add FK: job_deliverables.job_id -> open_jobs(id) ───────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_deliverables_job_open') THEN
    ALTER TABLE job_deliverables
      ADD CONSTRAINT fk_deliverables_job_open
      FOREIGN KEY (job_id) REFERENCES open_jobs(id) ON DELETE CASCADE;
    RAISE NOTICE '[026] Added fk_deliverables_job_open';
  ELSE
    RAISE NOTICE '[026] fk_deliverables_job_open already present';
  END IF;
END $$;

-- ── 5. Assert both FKs actually exist (verify catalog, not the migration log) ─
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_applications_job') THEN
    RAISE EXCEPTION '[026] FAILED: fk_applications_job missing after migration';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_deliverables_job_open') THEN
    RAISE EXCEPTION '[026] FAILED: fk_deliverables_job_open missing after migration';
  END IF;
  RAISE NOTICE '[026] OK: both FKs verified present';
END $$;

COMMIT;
