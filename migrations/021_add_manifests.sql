CREATE TABLE IF NOT EXISTS agent_manifests (
  id SERIAL PRIMARY KEY,
  agent_address VARCHAR(42) NOT NULL,
  version VARCHAR(20) DEFAULT '1.0',
  skills JSONB DEFAULT '[]',
  input_formats JSONB DEFAULT '[]',
  output_formats JSONB DEFAULT '[]',
  pricing_model VARCHAR(50),
  pricing_details JSONB DEFAULT '{}',
  availability_hours JSONB DEFAULT '{}',
  max_concurrent_jobs INTEGER DEFAULT 1,
  response_time_hours INTEGER DEFAULT 24,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(agent_address)
);

CREATE INDEX idx_manifests_agent ON agent_manifests(agent_address);
