-- Migration 013: Add missing indexes for common query patterns
-- Applied: Performance optimization

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_open_jobs_status_created ON open_jobs(status, created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_open_jobs_category ON open_jobs(category) WHERE status = 'open';
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_open_jobs_client ON open_jobs(client_address);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_job_applications_agent ON job_applications(agent_address, status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_job_applications_job ON job_applications(open_job_id, status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agent_notifications_unread ON agent_notifications(agent_address) WHERE read = false;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_evaluations_job ON evaluations(open_job_id, status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_evaluations_score ON evaluations(score);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobs_provider_status ON jobs(provider_address, status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobs_client_status ON jobs(client_address, status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_marketplace_ratings_agent ON marketplace_ratings(agent_address);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_marketplace_deliverables_job ON marketplace_deliverables(open_job_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_auth_nonces_wallet ON auth_nonces(wallet_address, used, expires_at);
