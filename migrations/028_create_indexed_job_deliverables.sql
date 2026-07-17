-- Direct Explorer (/api/jobs) deliverables are keyed by on-chain job identity.
-- Keep this separate from job_deliverables, whose job_id is the local
-- open_jobs.id used by the marketplace evaluator pipeline.
CREATE TABLE IF NOT EXISTS indexed_job_deliverables (
  job_id BIGINT NOT NULL,
  source_contract VARCHAR(42) NOT NULL,
  provider_address VARCHAR(42) NOT NULL,
  content TEXT NOT NULL,
  link TEXT,
  notes TEXT,
  deliverable_hash VARCHAR(66) NOT NULL,
  submission_tx VARCHAR(66) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (job_id, source_contract),
  UNIQUE (submission_tx),
  FOREIGN KEY (job_id, source_contract) REFERENCES jobs(job_id, source_contract) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_indexed_job_deliverables_provider
  ON indexed_job_deliverables(provider_address);

-- Direct Explorer delivery is a one-submit contract lifecycle. A duplicate
-- request for the same verified transaction updates only the same row.
COMMENT ON TABLE indexed_job_deliverables IS
  'Off-chain content for direct indexed on-chain jobs; distinct from marketplace job_deliverables.';

-- API runtime role from DATABASE_URL needs only read/write access to direct
-- deliverable content; schema ownership remains with the migration role.
GRANT SELECT, INSERT, UPDATE ON indexed_job_deliverables TO archiveagents;
