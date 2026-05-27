-- 003_create_validations.sql
-- Validation requests/responses from ERC-8004 ValidationRegistry

CREATE TABLE IF NOT EXISTS validations (
    id SERIAL PRIMARY KEY,
    agent_id BIGINT NOT NULL,
    validator_address VARCHAR(42) NOT NULL,
    request_hash VARCHAR(66) NOT NULL,                 -- unique identifier for this validation
    request_uri TEXT,
    
    -- Response (NULL until validator responds)
    response_status SMALLINT,                          -- 0=pending, 1=approved, 2=rejected (uint8 in contract)
    response_uri TEXT,
    response_hash VARCHAR(66),
    response_tag TEXT,
    responded_at TIMESTAMPTZ,
    response_block BIGINT,
    response_tx VARCHAR(66),
    
    -- Request block info
    request_block BIGINT NOT NULL,
    request_timestamp TIMESTAMPTZ NOT NULL,
    request_tx VARCHAR(66) NOT NULL,
    source_contract VARCHAR(42) NOT NULL,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(request_hash, source_contract)
);

CREATE INDEX idx_val_agent ON validations(agent_id);
CREATE INDEX idx_val_validator ON validations(validator_address);
CREATE INDEX idx_val_status ON validations(response_status);
CREATE INDEX idx_val_request_hash ON validations(request_hash);
