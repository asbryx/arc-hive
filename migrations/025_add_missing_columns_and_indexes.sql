-- 025_add_missing_columns_and_indexes.sql
--
-- archivehub-only portion of the missing-columns sync. (Audit fix T1.)
--
-- IMPORTANT: this project uses TWO databases:
--   - archivehub:    marketplace state (open_jobs, applications, evaluations,
--                     deliverables, comments, …) — what the api/evaluator
--                     read/write under DATABASE_URL
--   - archiveagents: chain mirror (agents, agent_scores, sync_state, …) —
--                     what the indexer reads/writes under AGENTS_DATABASE_URL
--
-- The agent_scores.composite_score + agents.availability columns belong in
-- archiveagents and have been moved to migrations-archiveagents/001_*.sql.
-- DO NOT add chain-mirror columns to files in this directory.
--
-- Background: the migration runner historically only knew about archivehub.
-- An earlier draft of this file ALTERed agents + agent_scores assuming they
-- lived here and crashed on first run with `relation "agent_scores" does
-- not exist`. Split below.
--
-- Every block is IF NOT EXISTS so it's a no-op on the host where the
-- column was hand-created. On a fresh deploy / replica restore, this
-- finally makes the schema correct.

-- ─── open_jobs missing tracking columns ───────────────────────────────
-- All four are read by api/src/routes/open-jobs.ts:1473-1477 in the
-- response projection. Silent NULL fallbacks meant refund tracking was
-- effectively broken: the UI saw refundTx=null even when the on-chain
-- refund had landed.

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
--        md.version = (SELECT MAX(version) ...)`.

CREATE INDEX IF NOT EXISTS idx_deliverables_open_job_status
  ON marketplace_deliverables(open_job_id, status, version DESC);

COMMENT ON COLUMN open_jobs.refund_tx       IS 'tx hash of on-chain claimRefund (set by evaluator when deadline passes)';
COMMENT ON COLUMN open_jobs.refunded_at     IS 'wall-clock timestamp the refund landed';
COMMENT ON COLUMN open_jobs.max_revisions   IS 'Max evaluator revision rounds before final reject. Default 2 (3 strikes).';
COMMENT ON COLUMN open_jobs.revision_count  IS 'Number of evaluator revision rounds already used.';
