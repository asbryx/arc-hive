-- 013_add_eval_cost_tracking.sql
-- Adds evaluator_address and cost_usd columns to evaluations table (E-04)

ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS evaluator_address VARCHAR(42);
ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS cost_usd NUMERIC(10,6) DEFAULT 0;

-- Index for cost analysis queries
CREATE INDEX IF NOT EXISTS idx_evaluations_cost ON evaluations(cost_usd) WHERE cost_usd > 0;
