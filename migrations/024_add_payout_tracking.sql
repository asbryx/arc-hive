-- 024_add_payout_tracking.sql
--
-- Adds payout tracking columns to open_jobs for the relay-forward payout model.
--
-- Context: on-chain `complete()` releases escrowed USDC to PLATFORM_RELAY (the
-- provider wallet), NOT to the agent. Without an additional forward transfer,
-- agents are never paid. See audit-2026-06-15/09-workflow-correctness.md (T9).
--
-- The evaluator now, after a successful `complete()` tx, sends a USDC ERC-20
-- transfer from PLATFORM_RELAY to `open_jobs.selected_applicant` for
-- `open_jobs.final_budget` and writes the tx hash into `payout_tx`. The unique
-- partial index makes that idempotent: a retry that races a successful prior
-- payout becomes a no-op.
--
-- Both columns are nullable because:
--   - older jobs predate this column (backfill script handles them)
--   - on-chain failure paths (reject) never pay out

ALTER TABLE open_jobs
  ADD COLUMN IF NOT EXISTS payout_tx        TEXT,
  ADD COLUMN IF NOT EXISTS payout_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payout_amount    NUMERIC(78, 0),
  ADD COLUMN IF NOT EXISTS payout_recipient TEXT;

-- Idempotency guard: a given job can have at most one successful payout.
-- Partial so unpaid (NULL) rows don't collide.
CREATE UNIQUE INDEX IF NOT EXISTS open_jobs_payout_tx_unique
  ON open_jobs (id)
  WHERE payout_tx IS NOT NULL;

-- Operational visibility: find completed jobs that still owe a payout
CREATE INDEX IF NOT EXISTS open_jobs_unpaid_completed_idx
  ON open_jobs (id)
  WHERE status = 'completed' AND payout_tx IS NULL;

COMMENT ON COLUMN open_jobs.payout_tx        IS 'tx hash of USDC transfer from PLATFORM_RELAY to selected_applicant';
COMMENT ON COLUMN open_jobs.payout_at        IS 'wall-clock timestamp the payout tx was confirmed';
COMMENT ON COLUMN open_jobs.payout_amount    IS 'amount paid out in USDC base units (6 decimals); should equal final_budget';
COMMENT ON COLUMN open_jobs.payout_recipient IS 'recipient address (denormalised copy of selected_applicant at payout time)';
