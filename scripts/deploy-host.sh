#!/usr/bin/env bash
# Deploy script run by the self-hosted GitHub Actions runner on the ThinkPad.
# Triggered by .github/workflows/deploy.yml on every push to main that touches
# backend code.
#
# DELIBERATE NON-GOAL: this script does NOT apply database migrations. Two
# attempts to auto-apply them (PR #29's first deploy + PR #33's tracking
# rewrite) both broke prod because:
#   - historical migrations are not all idempotent (CREATE INDEX without
#     IF NOT EXISTS, hand-applied columns, etc.)
#   - the two databases (archivehub, archiveagents) drifted independently
#     and the .sql files don't reliably know which one they target
#   - failed migrations leave a half-state that needs human triage
#
# Migrations are infrequent + irreversible. Apply them manually with the
# operator's eyes on the diff:
#   psql "$DATABASE_URL"        -v ON_ERROR_STOP=1 -f migrations/NNN.sql
#   psql "$AGENTS_DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations-archiveagents/NNN.sql
#
# Then push code that depends on the new schema. Order matters; auto-deploy
# does not handle ordering.
#
# Idempotent — re-running on an already-deployed SHA is a no-op pull + rebuild.

set -euo pipefail

DEPLOY_PATH="${DEPLOY_PATH:-/home/asbryx/building-arc/agent-hub}"
DEPLOY_SHA="${DEPLOY_SHA:?DEPLOY_SHA must be set by the workflow}"
DEPLOY_REF="${DEPLOY_REF:-main}"

cd "$DEPLOY_PATH"

# Load env so PM2 reload picks up the same vars the operator sees
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

# If the pushed commit touches a migrations directory, fail LOUD with a
# reminder rather than silently pretending the deploy is complete. Operator
# is expected to apply the migration manually then re-trigger the workflow.
CHANGED_SINCE_PARENT=$(git diff --name-only "${DEPLOY_SHA}~1" "${DEPLOY_SHA}" 2>/dev/null || true)
if echo "$CHANGED_SINCE_PARENT" | grep -qE '^migrations(-archiveagents)?/'; then
  echo ""
  echo "[deploy] ⚠️  This commit touches a migrations/ directory."
  echo "[deploy] ⚠️  Auto-deploy does NOT apply migrations — apply manually before relying on the new schema:"
  echo "$CHANGED_SINCE_PARENT" | grep -E '^migrations(-archiveagents)?/' | sed 's/^/[deploy]    /'
  echo ""
fi

echo "[deploy] reloading PM2 apps"
pm2 reload ecosystem.thinkpad.config.cjs --update-env
pm2 save

echo "[deploy] done @ $(date -u +%FT%TZ)"
