#!/usr/bin/env bash
# Deploy script run via SSH stdin from .github/workflows/deploy.yml.
#
# The workflow streams this file to the host via `ssh ... 'bash -s' < deploy-host.sh`
# and exports DEPLOY_SHA / DEPLOY_REF before that. Doing it this way (a real
# file streamed over stdin) avoids the heredoc/quoting traps that broke the
# previous in-yaml inline script.
#
# Idempotent — re-running on an already-deployed SHA is a no-op pull + rebuild.
set -euo pipefail

DEPLOY_PATH="${DEPLOY_PATH:-/home/asbryx/building-arc/agent-hub}"
DEPLOY_SHA="${DEPLOY_SHA:?DEPLOY_SHA must be set by the workflow}"
DEPLOY_REF="${DEPLOY_REF:-main}"

cd "$DEPLOY_PATH"

# Load env so the migrations step can hit Postgres
set +u
[ -f .env ] && source .env
set -u

echo "[deploy] pulling $DEPLOY_REF @ $DEPLOY_SHA"
git fetch --quiet origin "$DEPLOY_REF"
git reset --hard "$DEPLOY_SHA"
echo "[deploy] now at: $(git rev-parse --short HEAD) — $(git log -1 --format=%s)"

echo "[deploy] installing deps"
pnpm i --frozen-lockfile

echo "[deploy] building packages"
pnpm -r build

apply_migrations() {
  # Apply *.sql files from $1 against $2, skipping any already recorded
  # in the per-db `_migrations` table. ON_ERROR_STOP=1 means any genuine
  # SQL error aborts the deploy — see CI's same pattern.
  local dir="$1" url="$2"
  [ -d "$dir" ] || { echo "[deploy] skip $dir (missing)"; return 0; }
  [ -n "$url" ] || { echo "[deploy] skip $dir (no db url)"; return 0; }

  # Ensure tracking table exists (idempotent — same shape as
  # packages/indexer/src/db/migrate.ts).
  psql "$url" -v ON_ERROR_STOP=1 -c "
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )" > /dev/null

  for f in "$dir"/*.sql; do
    local base
    base="$(basename "$f")"
    # Already applied? Skip silently.
    local already
    already=$(psql "$url" -tA -c "SELECT 1 FROM _migrations WHERE name = '$base'")
    if [ "$already" = "1" ]; then
      continue
    fi
    echo "[deploy]   applying $f"
    # Run the migration + record in a single transaction so a half-applied
    # migration never gets marked done.
    psql "$url" -v ON_ERROR_STOP=1 --single-transaction \
      -c "BEGIN" \
      -f "$f" \
      -c "INSERT INTO _migrations (name) VALUES ('$base')" \
      -c "COMMIT"
  done
}

backfill_migrations_if_empty() {
  # First-run handshake: if a DB has existing schema but no `_migrations`
  # tracking table populated, mark every CURRENT migration file as already
  # applied. Without this the first post-this-PR deploy would re-run 001+
  # and fail on indexes that exist (idx_jobs_client, etc.) because the
  # historical files don't all use IF NOT EXISTS.
  #
  # Detection: _migrations table just got created (count=0) AND a
  # well-known historical table is present.
  local dir="$1" url="$2" sentinel_table="$3"
  [ -d "$dir" ] || return 0
  [ -n "$url" ] || return 0

  # Ensure _migrations exists first
  psql "$url" -v ON_ERROR_STOP=1 -c "
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )" > /dev/null

  local count
  count=$(psql "$url" -tA -c "SELECT count(*) FROM _migrations")
  local has_schema
  has_schema=$(psql "$url" -tA -c "SELECT to_regclass('$sentinel_table') IS NOT NULL")
  if [ "$count" = "0" ] && [ "$has_schema" = "t" ]; then
    echo "[deploy] $url: _migrations empty but $sentinel_table exists — marking historical migrations as already applied"
    for f in "$dir"/*.sql; do
      base="$(basename "$f")"
      psql "$url" -v ON_ERROR_STOP=1 -c \
        "INSERT INTO _migrations (name) VALUES ('$base') ON CONFLICT (name) DO NOTHING" > /dev/null
    done
  fi
}

# Run backfill BEFORE apply, so a fresh _migrations table on a long-running
# host doesn't cause apply to re-execute non-idempotent historical files.
backfill_migrations_if_empty migrations                "$DATABASE_URL"        open_jobs
backfill_migrations_if_empty migrations-archiveagents  "${AGENTS_DATABASE_URL:-}" agents

echo "[deploy] applying archivehub migrations"
apply_migrations migrations "$DATABASE_URL"

echo "[deploy] applying archiveagents migrations"
apply_migrations migrations-archiveagents "${AGENTS_DATABASE_URL:-}"

echo "[deploy] reloading PM2 apps"
pm2 reload ecosystem.thinkpad.config.cjs --update-env
pm2 save

echo "[deploy] done @ $(date -u +%FT%TZ)"
