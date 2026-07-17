-- A single verified on-chain JobCreated event maps to exactly one marketplace listing.
-- PostgreSQL UNIQUE permits multiple NULLs, preserving any legacy unlinked rows.
CREATE UNIQUE INDEX IF NOT EXISTS open_jobs_job_id_key
  ON open_jobs (job_id);
