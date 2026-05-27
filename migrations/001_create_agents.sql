-- 001_create_agents.sql
-- Agents registered via ERC-8004 IdentityRegistry

CREATE TABLE IF NOT EXISTS agents (
    id SERIAL PRIMARY KEY,
    agent_id BIGINT NOT NULL,                          -- ERC-721 tokenId
    owner_address VARCHAR(42) NOT NULL,                -- current owner
    metadata_uri TEXT,                                  -- IPFS/HTTP URI from registration
    registered_at TIMESTAMPTZ NOT NULL,                -- block timestamp
    registered_block BIGINT NOT NULL,
    registered_tx VARCHAR(66) NOT NULL,
    source_contract VARCHAR(42) NOT NULL,              -- IdentityRegistry address
    
    -- Denormalized from metadata (populated by metadata fetcher)
    name TEXT,
    description TEXT,
    image_uri TEXT,
    agent_type TEXT,
    capabilities TEXT[],                                -- array of capability strings
    version TEXT,
    
    -- Wallet binding (from setAgentWallet)
    agent_wallet VARCHAR(42),
    
    -- Timestamps
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(agent_id, source_contract)
);

CREATE INDEX idx_agents_owner ON agents(owner_address);
CREATE INDEX idx_agents_agent_id ON agents(agent_id);
CREATE INDEX idx_agents_capabilities ON agents USING GIN(capabilities);
CREATE INDEX idx_agents_name ON agents(name);
CREATE INDEX idx_agents_registered_block ON agents(registered_block);
