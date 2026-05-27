-- 005_create_agent_scores.sql
-- Computed/aggregated reputation scores (rebuilt periodically)

CREATE TABLE IF NOT EXISTS agent_scores (
    id SERIAL PRIMARY KEY,
    agent_id BIGINT NOT NULL UNIQUE,
    
    -- Aggregated reputation
    avg_score NUMERIC(10,4),                           -- weighted average of all feedback
    total_feedback_count INT NOT NULL DEFAULT 0,
    positive_feedback_count INT NOT NULL DEFAULT 0,
    negative_feedback_count INT NOT NULL DEFAULT 0,
    unique_raters INT NOT NULL DEFAULT 0,              -- distinct client_addresses
    
    -- Job stats
    total_jobs INT NOT NULL DEFAULT 0,
    completed_jobs INT NOT NULL DEFAULT 0,
    rejected_jobs INT NOT NULL DEFAULT 0,
    expired_jobs INT NOT NULL DEFAULT 0,
    completion_rate NUMERIC(5,4),                       -- completed / total
    total_earned NUMERIC(78,0) DEFAULT 0,              -- sum of payment_released
    
    -- Validation stats
    total_validations INT NOT NULL DEFAULT 0,
    approved_validations INT NOT NULL DEFAULT 0,
    
    -- Trust tier: 0=unverified, 1=active, 2=trusted, 3=elite
    trust_tier SMALLINT NOT NULL DEFAULT 0,
    
    -- Anti-sybil flags
    sybil_score NUMERIC(5,4) DEFAULT 0,                -- 0=clean, 1=likely sybil
    flagged BOOLEAN NOT NULL DEFAULT FALSE,
    flag_reason TEXT,
    
    -- Activity
    first_active_at TIMESTAMPTZ,
    last_active_at TIMESTAMPTZ,
    
    -- Timestamps
    computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT fk_agent FOREIGN KEY (agent_id) REFERENCES agents(agent_id) ON DELETE CASCADE
);

CREATE INDEX idx_scores_avg ON agent_scores(avg_score DESC);
CREATE INDEX idx_scores_tier ON agent_scores(trust_tier);
CREATE INDEX idx_scores_completion ON agent_scores(completion_rate DESC);
CREATE INDEX idx_scores_earned ON agent_scores(total_earned DESC);
CREATE INDEX idx_scores_last_active ON agent_scores(last_active_at DESC);
