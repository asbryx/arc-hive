-- 004_create_jobs.sql
-- Jobs from ERC-8183 AgenticCommerce

CREATE TABLE IF NOT EXISTS jobs (
    id SERIAL PRIMARY KEY,
    job_id BIGINT NOT NULL,                            -- on-chain job ID
    client_address VARCHAR(42) NOT NULL,
    provider_address VARCHAR(42),                       -- NULL until provider set
    evaluator_address VARCHAR(42),
    provider_agent_id BIGINT,                          -- links to agents.agent_id
    
    description TEXT,
    budget NUMERIC(78,0),                              -- raw USDC amount (6 decimals)
    payment_token VARCHAR(42),                         -- token used for payment
    
    -- Status: Open, Funded, Submitted, Completed, Rejected, Expired
    status SMALLINT NOT NULL DEFAULT 0,
    
    -- Lifecycle timestamps
    expired_at TIMESTAMPTZ,
    submitted_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    rejected_at TIMESTAMPTZ,
    
    -- Deliverable
    deliverable_hash VARCHAR(66),
    completion_reason VARCHAR(66),
    rejection_reason VARCHAR(66),
    
    -- Financial
    payment_released NUMERIC(78,0),                    -- actual amount paid to provider
    platform_fee_paid NUMERIC(78,0),
    evaluator_fee_paid NUMERIC(78,0),
    refund_amount NUMERIC(78,0),
    
    -- Hook
    hook_address VARCHAR(42),
    
    -- Block info (creation)
    created_block BIGINT NOT NULL,
    created_timestamp TIMESTAMPTZ NOT NULL,
    created_tx VARCHAR(66) NOT NULL,
    source_contract VARCHAR(42) NOT NULL,
    
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(job_id, source_contract)
);

CREATE INDEX idx_jobs_client ON jobs(client_address);
CREATE INDEX idx_jobs_provider ON jobs(provider_address);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_provider_agent ON jobs(provider_agent_id);
CREATE INDEX idx_jobs_created_block ON jobs(created_block);
CREATE INDEX idx_jobs_budget ON jobs(budget);

-- Full audit trail of all job events
CREATE TABLE IF NOT EXISTS job_events (
    id SERIAL PRIMARY KEY,
    job_id BIGINT NOT NULL,
    event_name VARCHAR(64) NOT NULL,                   -- JobCreated, JobFunded, etc.
    event_data JSONB,                                  -- raw decoded event args
    
    block_number BIGINT NOT NULL,
    block_timestamp TIMESTAMPTZ NOT NULL,
    tx_hash VARCHAR(66) NOT NULL,
    log_index INT NOT NULL,
    source_contract VARCHAR(42) NOT NULL,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_job_events_job ON job_events(job_id);
CREATE INDEX idx_job_events_name ON job_events(event_name);
CREATE INDEX idx_job_events_block ON job_events(block_number);
