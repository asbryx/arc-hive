-- 025_add_missing_columns_and_indexes.sql
--
-- Audit fix T1 (2026-06-15). Multiple columns referenced by production
-- code were never created in migrations and only existed in prod because
-- someone ALTER'd them by hand. This brings the migration set back into
-- sync with what the code actually reads/writes, and indexes the hot
-- evaluator-poll path.
--
-- Each block is IF NOT EXISTS so it's a no-op on the host where the
-- column was hand-created. On a fresh deploy / replica restore, this
-- finally makes the schema correct.

-- ─── agent_scores.composite_score ─────────────────────────────────────
-- Written by indexer/src/scoring/aggregator.ts (ON CONFLICT … SET
-- composite_score = EXCLUDED.composite_score), read by api/src/routes/
-- agents.ts (ORDER BY, WHERE IS NOT NULL, projection). NUMERIC because
-- the aggregator stores a weighted floating value, not an integer rank.

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
-- TEXT because we don't yet have a stable enum — current values seen
-- in production: 'available', 'busy', 'unavailable'. CHECK constraint
-- deliberately omitted to keep this migration risk-free.

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS availability TEXT;

CREATE INDEX IF NOT EXISTS idx_agents_availability
  ON agents(availability)
  WHERE availability IS NOT NULL;

-- ─── open_jobs missing tracking columns ───────────────────────────────
-- All four are read by api/src/routes/open-jobs.ts:1473-1477 in the
-- response projection. Silent NULL fallbacks meant refund tracking was
-- effectively broken: the UI saw refundTx=null even when the on-chain
-- refund had landed and been recorded somewhere else (it wasn't —
-- evaluator/src/db.ts writes refund_tx but had no place to put it).

ALTER TABLE open_jobs
  ADD COLUMN IF NOT EXISTS refund_tx       TEXT,
  ADD COLUMN IF NOT EXISTS refunded_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS max_revisions   INT  DEFAULT 2,
  ADD COLUMN IF NOT EXISTS revision_count  INT  DEFAULT 0;

-- Backfill existing rows so non-null reads behave deterministically.
UPDATE open_jobs SET max_revisions  = 2 WHERE max_revisions  IS NULL;
UPDATE open_jobs SET revision_count = 0 WHERE revision_count IS NULL;

-- ─── marketplace_deliverables.status index ────────────────────────────
-- Hot evaluator poll: `WHERE status='submitted'` runs every 15s. Was
-- a seq scan on a table that grows linearly with all-time deliverables.

CREATE INDEX IF NOT EXISTS idx_deliverables_status
  ON marketplace_deliverables(status);

-- Combined index for the joined evaluator query in getPendingEvaluations:
-- `WHERE oj.status='evaluating' AND md.status='submitted' AND
--        md.version = (SELECT MAX(version) ...)`. The MAX subquery
-- still needs a per-job scan, but limiting the outer scan to submitted
-- rows is the bigger win.

CREATE INDEX IF NOT EXISTS idx_deliverables_open_job_status
  ON marketplace_deliverables(open_job_id, status, version DESC);

COMMENT ON COLUMN agent_scores.composite_score IS 'Weighted reputation score, 0–100. Computed by indexer aggregator.';
COMMENT ON COLUMN agents.availability        IS 'Free-form availability label: available / busy / unavailable / etc.';
COMMENT ON COLUMN open_jobs.refund_tx        IS 'tx hash of on-chain claimRefund (set by evaluator when deadline passes)';
COMMENT ON COLUMN open_jobs.refunded_at      IS 'wall-clock timestamp the refund landed';
COMMENT ON COLUMN open_jobs.max_revisions    IS 'Max evaluator revision rounds before final reject. Default 2 (3 strikes).';
COMMENT ON COLUMN open_jobs.revision_count   IS 'Number of evaluator revision rounds already used.';
