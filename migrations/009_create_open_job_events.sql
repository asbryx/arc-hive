-- 009_create_open_job_events.sql
-- API-level events for marketplace operations (file downloads, etc.)
-- Separate from job_events which tracks on-chain events.
--
-- NOTE: the FK to open_jobs(id) is added in 019_backfill_missing_fks.sql
-- because open_jobs is not created until migration 010. See 019 for
-- rationale.

CREATE TABLE IF NOT EXISTS open_job_events (
  id SERIAL PRIMARY KEY,
  open_job_id INTEGER NOT NULL,
  event_type VARCHAR(64) NOT NULL,
  actor_address VARCHAR(42) NOT NULL,
  data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_open_job_events_job ON open_job_events(open_job_id);
CREATE INDEX IF NOT EXISTS idx_open_job_events_type ON open_job_events(event_type);
