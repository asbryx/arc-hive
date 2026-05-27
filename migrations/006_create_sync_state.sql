-- 006_create_sync_state.sql
-- Tracks indexer progress per contract

CREATE TABLE IF NOT EXISTS sync_state (
    id SERIAL PRIMARY KEY,
    contract_address VARCHAR(42) NOT NULL UNIQUE,
    contract_name VARCHAR(64) NOT NULL,
    last_synced_block BIGINT NOT NULL DEFAULT 0,
    deployment_block BIGINT NOT NULL,
    is_syncing BOOLEAN NOT NULL DEFAULT FALSE,
    last_sync_at TIMESTAMPTZ,
    total_events_processed BIGINT NOT NULL DEFAULT 0,
    error_count INT NOT NULL DEFAULT 0,
    last_error TEXT,
    last_error_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed with known contracts
INSERT INTO sync_state (contract_address, contract_name, deployment_block) VALUES
    ('0x8004a818bfb912233c491871b3d84c89a494bd9e', 'IdentityRegistry', 29241340),
    ('0x8004b663056a597dffe9eccc1965a193b7388713', 'ReputationRegistry', 29241344),
    ('0x8004cb1bf31daf7788923b405b754f57aceb4272', 'ValidationRegistry', 29241349),
    ('0x0747eef0706327138c69792bf28cd525089e4583', 'AgenticCommerce', 33908011)
ON CONFLICT (contract_address) DO NOTHING;

-- Metadata fetch queue
CREATE TABLE IF NOT EXISTS metadata_queue (
    id SERIAL PRIMARY KEY,
    agent_id BIGINT NOT NULL,
    metadata_uri TEXT NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'pending',     -- pending, fetching, done, failed
    attempts INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 3,
    last_attempt_at TIMESTAMPTZ,
    error TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(agent_id)
);

CREATE INDEX idx_meta_queue_status ON metadata_queue(status) WHERE status = 'pending';
