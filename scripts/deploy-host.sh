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

echo "[deploy] applying archivehub migrations"
# ON_ERROR_STOP=1 + outer set -e means a broken migration aborts the deploy.
# Same lesson as ci.yml — never swallow this.
for f in migrations/*.sql; do
  echo "  applying $f"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"
done

# archiveagents migrations live in their own dir (see migrations-archiveagents/README.md).
# The runner that should own them is a follow-up; for now apply manually here.
if [ -d migrations-archiveagents ] && [ -n "${AGENTS_DATABASE_URL:-}" ]; then
  echo "[deploy] applying archiveagents migrations"
  for f in migrations-archiveagents/*.sql; do
    echo "  applying $f"
    psql "$AGENTS_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"
  done
fi

echo "[deploy] reloading PM2 apps"
pm2 reload ecosystem.thinkpad.config.cjs --update-env
pm2 save

echo "[deploy] done @ $(date -u +%FT%TZ)"
