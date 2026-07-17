#!/usr/bin/env bash
# VPS deploy only. Historical migrations remain manual.
set -euo pipefail

DEPLOY_PATH="${DEPLOY_PATH:-/srv/arc-hive/app}"
DEPLOY_REF="${DEPLOY_REF:-main}"
DEPLOY_SHA="${DEPLOY_SHA:-}"

# PM2 state belongs to the isolated production user. Running this script as a
# different account creates a second daemon and makes reload/save unreliable.
if [[ "$(id -un)" != "arc-hive" ]]; then
  echo "deploy-vps-host.sh must run as arc-hive" >&2
  exit 1
fi
export HOME=/srv/arc-hive
export PM2_HOME="$HOME/.pm2"

cd "$DEPLOY_PATH"
git fetch --quiet origin "$DEPLOY_REF"
if [[ -n "$DEPLOY_SHA" ]]; then
  git reset --hard "$DEPLOY_SHA"
else
  git reset --hard "origin/$DEPLOY_REF"
fi

pnpm install --frozen-lockfile
pnpm -r build
# First VPS deploy has no PM2 app yet; later deploys reload the same config.
pm2 startOrReload ecosystem.vps.config.cjs --update-env
pm2 save
curl -fsS --max-time 15 http://127.0.0.1:3000/api/health
