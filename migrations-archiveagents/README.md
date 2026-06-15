# `archiveagents` migrations

Migrations for the **chain-mirror** database (`archiveagents`), distinct from
the marketplace database (`archivehub`).

## Why split?

The two databases have entirely different ownership and lifecycles:

| | `archivehub` | `archiveagents` |
|---|---|---|
| Holds | marketplace state — jobs, applications, evaluations, deliverables, comments | chain mirror — agents, scores, validations, sync state |
| Source of truth? | YES (no chain backing) | NO (re-indexable from chain) |
| Read by | api, evaluator | indexer, api (read-only joins) |
| `DATABASE_URL` env var | `DATABASE_URL` | `AGENTS_DATABASE_URL` |
| Migration runner | `migrations/*.sql` via CI's `psql` loop | `migrations-archiveagents/*.sql` via `pnpm migrate` *(planned — see below)* |

Mixing the two in the same migrations directory caused migration 025
to fail in prod with `relation "agent_scores" does not exist` because
`agent_scores` lives in `archiveagents`, not `archivehub`. See
audit-2026-06-15/01-database.md for the broader schema-drift context.

## Current state of the runner

Today the `pnpm migrate` script in `packages/indexer` runs files from
`migrations/` (the archivehub set) against `AGENTS_DATABASE_URL`, which
is wrong but happens to be a no-op in most cases because the early
chain-mirror tables (agents, agent_scores) were created out-of-band.
The `_migrations` tracking table on `archiveagents` is stuck at 006
because no one has run that runner since May 2026.

A follow-up will:
1. Update `packages/indexer/src/db/migrate.ts` to read from this
   directory instead of `migrations/`.
2. Backfill historical chain-side migrations into this directory if
   any were ever applied to archiveagents.
3. Reconcile the `_migrations` table to reflect what's actually
   applied today.

For now, files in this directory are applied **manually** with:
```bash
psql "$AGENTS_DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations-archiveagents/<file>.sql
```

## Convention

- Numbered `NNN_description.sql`, starting at `001_*` independent of
  the archivehub set.
- `IF NOT EXISTS` everywhere — these tables predate the runner.
- One DB per file. Never reach across into `archivehub`.
