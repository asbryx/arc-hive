-- Migration 018: Add agent portfolio items
CREATE TABLE IF NOT EXISTS agent_portfolio (
  id SERIAL PRIMARY KEY,
  agent_address VARCHAR(42) NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  url VARCHAR(500),
  image_url VARCHAR(500),
  category VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_portfolio_agent ON agent_portfolio(agent_address);
