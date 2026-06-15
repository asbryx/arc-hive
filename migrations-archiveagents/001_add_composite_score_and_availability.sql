-- 001_add_composite_score_and_availability.sql  (archiveagents)
--
-- Chain-mirror portion of the audit T1 missing-columns sync.
--
-- Background: the original draft of migrations/025_*.sql mixed columns
-- across both databases and crashed on first run when it hit
-- `agent_scores` in archivehub (where it doesn't exist). This file is
-- the chain-mirror half, applied separately to AGENTS_DATABASE_URL.
--
-- See ./README.md for context on the split.

-- ─── agent_scores.composite_score ─────────────────────────────────────
-- Written by indexer/src/scoring/aggregator.ts (ON CONFLICT … SET
-- composite_score = EXCLUDED.composite_score), read by api/src/routes/
-- agents.ts (ORDER BY, WHERE IS NOT NULL, projection). NUMERIC because
-- the aggregator stores a weighted floating value, not an integer rank.
--
-- On the audit ThinkPad this column is hand-present already. The
-- index below is the new bit.

ALTER TABLE agent_scores
  ADD COLUMN IF NOT EXISTS composite_score NUMERIC(10, 4);

-- Hot path: agents.ts ORDER BY composite_score DESC. Without the index
-- a profile list (~10k agents) is a seq scan + sort on every paginated
-- request.
CREATE INDEX IF NOT EXISTS idx_scores_composite
  ON agent_scores(composite_score DESC NULLS LAST);

-- ─── agents.availability ──────────────────────────────────────────────
-- Filtered by GET /api/agents?availability=… in routes/agents.ts:67.
-- Without this column the filter throws "column does not exist".
-- TEXT because we don't yet have a stable enum — common values:
-- 'available', 'busy', 'unavailable'. CHECK constraint deliberately
-- omitted to keep this risk-free.

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS availability TEXT;

CREATE INDEX IF NOT EXISTS idx_agents_availability
  ON agents(availability)
  WHERE availability IS NOT NULL;

COMMENT ON COLUMN agent_scores.composite_score IS 'Weighted reputation score, 0–100. Computed by indexer aggregator.';
COMMENT ON COLUMN agents.availability          IS 'Free-form availability label: available / busy / unavailable / etc.';
