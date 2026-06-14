-- 017_add_missing_indexes.sql
--
-- Corrected replacement for the broken 013_add_missing_indexes.sql.
--
-- The migration runner wraps every file in BEGIN/COMMIT, so this file
-- uses plain CREATE INDEX (no CONCURRENTLY). On the current data sizes
-- the brief table lock is acceptable; revisit if any of these tables
-- exceeds ~1M rows, in which case run the corresponding CONCURRENTLY
-- DDL by hand outside the migration runner.

-- ─── open_jobs ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_open_jobs_status_created
  ON open_jobs(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_open_jobs_category_open
  ON open_jobs(category)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_open_jobs_client
  ON open_jobs(client_address);

-- ─── job_applications ─────────────────────────────────────────────────────────
-- NOTE: real column names per 010 are `applicant_address` and `job_id`,
-- NOT `agent_address`/`open_job_id` as the broken 013 claimed.
CREATE INDEX IF NOT EXISTS idx_job_applications_applicant_status
  ON job_applications(applicant_address, status);

CREATE INDEX IF NOT EXISTS idx_job_applications_job_status
  ON job_applications(job_id, status);

-- ─── evaluations ──────────────────────────────────────────────────────────────
-- NOTE: `evaluations` has no `status` column (it has `decision`). The broken
-- 013 also tried to add `idx_evaluations_job ON evaluations(open_job_id, status)`
-- which would have failed; instead index by `decision` for filtering by
-- approved/rejected.
CREATE INDEX IF NOT EXISTS idx_evaluations_job_decision
  ON evaluations(open_job_id, decision);

CREATE INDEX IF NOT EXISTS idx_evaluations_score
  ON evaluations(score);

-- ─── jobs (on-chain) ──────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_jobs_provider_status
  ON jobs(provider_address, status);

CREATE INDEX IF NOT EXISTS idx_jobs_client_status
  ON jobs(client_address, status);

-- ─── auth_nonces ──────────────────────────────────────────────────────────────
-- Composite for the common lookup: "is this wallet's nonce still valid?"
CREATE INDEX IF NOT EXISTS idx_auth_nonces_wallet_used_expires
  ON auth_nonces(wallet_address, used, expires_at);

-- Indexes for `agent_notifications.unread`, `marketplace_ratings.agent_address`,
-- and `marketplace_deliverables.open_job_id` were intentionally dropped here —
-- 010_create_marketplace.sql already creates them.
