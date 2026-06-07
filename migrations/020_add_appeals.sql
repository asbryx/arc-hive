CREATE TABLE IF NOT EXISTS evaluation_appeals (
  id SERIAL PRIMARY KEY,
  evaluation_id INTEGER REFERENCES evaluations(id),
  open_job_id INTEGER REFERENCES open_jobs(id),
  agent_address VARCHAR(42) NOT NULL,
  reason TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'upheld', 'overturned')),
  reviewed_by VARCHAR(42),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_appeals_status ON evaluation_appeals(status) WHERE status = 'pending';
CREATE INDEX idx_appeals_job ON evaluation_appeals(open_job_id);
