-- 010_create_marketplace.sql
-- Marketplace tables: open jobs, applications, deliverables, notifications, ratings
-- These are separate from the indexed on-chain jobs table (004)

CREATE TABLE IF NOT EXISTS open_jobs (
  id SERIAL PRIMARY KEY,
  job_id BIGINT,                           -- on-chain job ID (null until linked)
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(100),
  requirements TEXT,
  budget_min NUMERIC(78,0),                -- raw USDC amount (6 decimals)
  budget_max NUMERIC(78,0),
  deadline_hours INTEGER NOT NULL DEFAULT 72,
  client_address VARCHAR(42) NOT NULL,
  on_chain_tx VARCHAR(66),                 -- tx hash when job created on-chain
  sector_config JSONB DEFAULT '{}',
  status VARCHAR(32) NOT NULL DEFAULT 'open', -- open, funded, in_progress, evaluating, submitted, revision_requested, completed, approved, rejected, expired, cancelled
  selected_applicant VARCHAR(42),          -- address of selected agent
  provider_address VARCHAR(42),            -- on-chain provider
  evaluator_address VARCHAR(42),           -- assigned evaluator
  budget NUMERIC(78,0),                    -- final budget set on-chain
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_open_jobs_status ON open_jobs(status);
CREATE INDEX idx_open_jobs_client ON open_jobs(client_address);
CREATE INDEX idx_open_jobs_category ON open_jobs(category);
CREATE INDEX idx_open_jobs_job_id ON open_jobs(job_id);
CREATE INDEX idx_open_jobs_selected ON open_jobs(selected_applicant);

-- ─── Job Applications ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS job_applications (
  id SERIAL PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES open_jobs(id) ON DELETE CASCADE,
  applicant_address VARCHAR(42) NOT NULL,
  agent_id BIGINT,                          -- links to agents.agent_id
  message TEXT,
  proposed_budget NUMERIC(78,0),
  status VARCHAR(32) NOT NULL DEFAULT 'pending', -- pending, selected, rejected, withdrawn
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_job_applications_job ON job_applications(job_id);
CREATE INDEX idx_job_applications_applicant ON job_applications(applicant_address);
CREATE INDEX idx_job_applications_status ON job_applications(status);

-- ─── Marketplace Deliverables ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS marketplace_deliverables (
  id SERIAL PRIMARY KEY,
  open_job_id INTEGER NOT NULL REFERENCES open_jobs(id) ON DELETE CASCADE,
  provider_address VARCHAR(42) NOT NULL,
  content TEXT,
  link TEXT,
  notes TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  file_count INTEGER DEFAULT 0,
  status VARCHAR(32) NOT NULL DEFAULT 'pending', -- pending, evaluating, approved, rejected
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_marketplace_deliverables_job ON marketplace_deliverables(open_job_id);
CREATE INDEX idx_marketplace_deliverables_provider ON marketplace_deliverables(provider_address);

-- ─── Auth Nonces ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS auth_nonces (
  id SERIAL PRIMARY KEY,
  wallet_address VARCHAR(42) NOT NULL,
  nonce VARCHAR(64) NOT NULL,
  message TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(wallet_address)
);

CREATE INDEX idx_auth_nonces_wallet ON auth_nonces(wallet_address);
CREATE INDEX idx_auth_nonces_expires ON auth_nonces(expires_at);

-- ─── API Keys ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS api_keys (
  id SERIAL PRIMARY KEY,
  key_hash VARCHAR(64) NOT NULL UNIQUE,
  key_prefix VARCHAR(11) NOT NULL,
  agent_address VARCHAR(42) NOT NULL,
  label VARCHAR(100),
  scopes TEXT[] NOT NULL DEFAULT '{jobs:read,jobs:apply}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX idx_api_keys_agent ON api_keys(agent_address);
CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);

-- ─── Webhooks ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS webhooks (
  id SERIAL PRIMARY KEY,
  agent_address VARCHAR(42) NOT NULL,
  url VARCHAR(500) NOT NULL,
  events TEXT[] NOT NULL,
  category_filter VARCHAR(100),
  budget_min NUMERIC(78,0),
  secret VARCHAR(64) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_triggered_at TIMESTAMPTZ,
  failure_count INTEGER DEFAULT 0
);

CREATE INDEX idx_webhooks_agent ON webhooks(agent_address);
CREATE INDEX idx_webhooks_active ON webhooks(active);

-- ─── Agent Notifications ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS agent_notifications (
  id SERIAL PRIMARY KEY,
  agent_address VARCHAR(42) NOT NULL,
  type VARCHAR(64) NOT NULL,
  reference_id INTEGER,
  message TEXT NOT NULL,
  read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_agent_notifications_agent ON agent_notifications(agent_address);
CREATE INDEX idx_agent_notifications_unread ON agent_notifications(agent_address) WHERE read = FALSE;

-- ─── Marketplace Ratings ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS marketplace_ratings (
  id SERIAL PRIMARY KEY,
  open_job_id INTEGER NOT NULL REFERENCES open_jobs(id) ON DELETE CASCADE,
  agent_address VARCHAR(42) NOT NULL,
  reviewer_address VARCHAR(42) NOT NULL,
  rating SMALLINT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(open_job_id, agent_address, reviewer_address)
);

CREATE INDEX idx_marketplace_ratings_agent ON marketplace_ratings(agent_address);

-- ─── Evaluations ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS evaluations (
  id SERIAL PRIMARY KEY,
  open_job_id INTEGER NOT NULL REFERENCES open_jobs(id) ON DELETE CASCADE,
  deliverable_id INTEGER REFERENCES marketplace_deliverables(id) ON DELETE SET NULL,
  version INTEGER,
  score INTEGER,
  decision VARCHAR(20),                    -- approved, rejected
  reasoning TEXT,
  llm_provider VARCHAR(100),
  tokens_used INTEGER DEFAULT 0,
  evaluation_time_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_evaluations_job ON evaluations(open_job_id);
