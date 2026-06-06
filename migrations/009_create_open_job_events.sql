-- 009_create_open_job_events.sql
-- API-level events for marketplace operations (file downloads, etc.)
-- Separate from job_events which tracks on-chain events

CREATE TABLE IF NOT EXISTS open_job_events (
  id SERIAL PRIMARY KEY,
  open_job_id INTEGER NOT NULL REFERENCES open_jobs(id) ON DELETE CASCADE,
  event_type VARCHAR(64) NOT NULL,
  actor_address VARCHAR(42) NOT NULL,
  data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_open_job_events_job ON open_job_events(open_job_id);
CREATE INDEX idx_open_job_events_type ON open_job_events(event_type);
