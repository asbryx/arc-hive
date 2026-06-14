-- 008_evaluator_metrics.sql
-- Tracks evaluator health, provider usage, and scoring distribution.
--
-- NOTE: the FK to open_jobs(id) is added in 019_backfill_missing_fks.sql
-- because open_jobs is not created until migration 010. See 019 for
-- rationale.

CREATE TABLE IF NOT EXISTS evaluator_metrics (
  id SERIAL PRIMARY KEY,
  open_job_id INTEGER,
  version INTEGER,
  provider_used VARCHAR(100),       -- 'primary', 'secondary', 'primary+secondary (averaged)'
  llm_model VARCHAR(100),
  score INTEGER,
  decision VARCHAR(20),             -- 'approved', 'rejected', 'failed'
  tokens_input INTEGER DEFAULT 0,
  tokens_output INTEGER DEFAULT 0,
  evaluation_time_ms INTEGER,       -- how long evaluation took
  pre_validation_passed BOOLEAN DEFAULT true,
  pre_validation_reason TEXT,       -- if failed, why
  file_count INTEGER DEFAULT 0,    -- number of files analyzed
  file_types TEXT[],                -- ['code', 'data', 'document']
  error TEXT,                       -- if evaluation errored
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evaluator_metrics_job ON evaluator_metrics(open_job_id);
CREATE INDEX IF NOT EXISTS idx_evaluator_metrics_provider ON evaluator_metrics(provider_used);
CREATE INDEX IF NOT EXISTS idx_evaluator_metrics_created ON evaluator_metrics(created_at);
CREATE INDEX IF NOT EXISTS idx_evaluator_metrics_decision ON evaluator_metrics(decision);
