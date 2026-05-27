-- 002_create_reputation_events.sql
-- Feedback events from ERC-8004 ReputationRegistry

CREATE TABLE IF NOT EXISTS reputation_events (
    id SERIAL PRIMARY KEY,
    agent_id BIGINT NOT NULL,                          -- which agent received feedback
    client_address VARCHAR(42) NOT NULL,               -- who gave feedback
    feedback_index BIGINT NOT NULL,                    -- per-agent per-client index
    value INT NOT NULL,                                -- score value (int128 in contract, fits int here)
    value_decimals SMALLINT NOT NULL DEFAULT 0,        -- decimal places for value
    tag1 TEXT,                                         -- primary tag (e.g. "successful_trade")
    tag2 TEXT,                                         -- secondary tag
    endpoint TEXT,                                     -- service endpoint
    feedback_uri TEXT,                                 -- IPFS URI with detailed feedback
    feedback_hash VARCHAR(66),                         -- bytes32 hash
    is_revoked BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Block info
    block_number BIGINT NOT NULL,
    block_timestamp TIMESTAMPTZ NOT NULL,
    tx_hash VARCHAR(66) NOT NULL,
    source_contract VARCHAR(42) NOT NULL,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(agent_id, client_address, feedback_index, source_contract)
);

CREATE INDEX idx_rep_agent_id ON reputation_events(agent_id);
CREATE INDEX idx_rep_client ON reputation_events(client_address);
CREATE INDEX idx_rep_tag1 ON reputation_events(tag1);
CREATE INDEX idx_rep_not_revoked ON reputation_events(agent_id) WHERE is_revoked = FALSE;
CREATE INDEX idx_rep_block ON reputation_events(block_number);

-- Responses to feedback
CREATE TABLE IF NOT EXISTS reputation_responses (
    id SERIAL PRIMARY KEY,
    agent_id BIGINT NOT NULL,
    client_address VARCHAR(42) NOT NULL,
    feedback_index BIGINT NOT NULL,
    responder_address VARCHAR(42) NOT NULL,
    response_uri TEXT,
    response_hash VARCHAR(66),
    
    block_number BIGINT NOT NULL,
    block_timestamp TIMESTAMPTZ NOT NULL,
    tx_hash VARCHAR(66) NOT NULL,
    source_contract VARCHAR(42) NOT NULL,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rep_resp_agent ON reputation_responses(agent_id);
CREATE INDEX idx_rep_resp_feedback ON reputation_responses(agent_id, client_address, feedback_index);
