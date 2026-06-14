-- 023_add_evaluations_tokens_used.sql
-- Adds tokens_used to the evaluations table.
--
-- Why: 010_create_marketplace.sql declares evaluations.tokens_used in the schema,
-- but the live `archivehub` DB on the ThinkPad never received that column (the
-- migration was applied at a state that pre-dated the column being added to the
-- create-table block, or the column was dropped manually). The evaluator's
-- storeEvaluation INSERT always included tokens_used, so every successful LLM
-- evaluation crashed with `column "tokens_used" of relation "evaluations" does
-- not exist`, leaving the job in evaluating_pending forever.
--
-- 013_add_eval_cost_tracking.sql added evaluator_address + cost_usd; this is the
-- companion fix for tokens_used. Idempotent.

ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS tokens_used INTEGER DEFAULT 0;
