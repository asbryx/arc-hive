-- Migration 002 (archiveagents): add updated_at to agent_scores
--
-- The shared trigger update_agent_scores_updated_at runs
-- update_updated_at_column() which does `NEW.updated_at = NOW()`, but
-- agent_scores never had an updated_at column (it uses computed_at). So
-- EVERY score UPDATE threw `record "new" has no field "updated_at"` and
-- score recomputation silently failed for all agents (audit 2026-06-23,
-- surfaced after the $2::text scoring-query fix).
--
-- Add the column the trigger expects (non-breaking; computed_at is kept).
-- Apply by hand: psql "$AGENTS_DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations-archiveagents/002_add_agent_scores_updated_at.sql

ALTER TABLE agent_scores ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Backfill existing rows from computed_at where available.
UPDATE agent_scores SET updated_at = COALESCE(computed_at, NOW()) WHERE updated_at IS NULL;
