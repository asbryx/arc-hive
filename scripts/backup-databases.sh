#!/usr/bin/env bash
# backup-databases.sh
#
# Nightly pg_dump of both Postgres databases off-host.
#
# Audit fix T3 (2026-06-15): archivehub had no automated dumps. Disk dies,
# all marketplace state (jobs, applications, evaluations, comments) is gone.
# RPO was effectively infinity. This script gives us a 24h RPO at worst.
#
# Designed for the ThinkPad WSL deployment. Add to crontab:
#   0 3 * * * /home/asbryx/building-arc/agent-hub/scripts/backup-databases.sh \
#               >> /home/asbryx/building-arc/agent-hub/logs/backup.log 2>&1
#
# Required env (in /home/asbryx/building-arc/agent-hub/.env or exported):
#   DATABASE_URL              — archivehub connection string
#   AGENTS_DATABASE_URL       — archiveagents connection string
#   BACKUP_DEST_DIR           — local staging dir (e.g. /var/backups/archivehub)
#   BACKUP_REMOTE             — rclone remote spec (e.g. "b2:archivehub-backups")
#                                or "" to skip off-host push
#   BACKUP_RETENTION_LOCAL    — days to keep locally (default 7)
#   BACKUP_RETENTION_REMOTE   — days to keep remotely (default 30)
#
# Optional:
#   BACKUP_GPG_RECIPIENT      — if set, dumps are encrypted with gpg --encrypt
#                                before upload. Strongly recommended for any
#                                remote that's not already encrypted at rest.
#
# Failure modes the script guards against:
#   - pg_dump returns non-zero (caught via `set -e` + per-step status check)
#   - remote upload fails (logged but doesn't delete local copy)
#   - disk full on staging (df check before dumping)
#   - silent zero-byte dumps (size check before pruning)

set -euo pipefail

# Load env if running outside PM2 / login shell context
if [[ -f "${BASH_SOURCE%/*}/../.env" ]]; then
  # shellcheck disable=SC1091
  set -a
  . "${BASH_SOURCE%/*}/../.env"
  set +a
fi

: "${DATABASE_URL:?DATABASE_URL not set}"
: "${AGENTS_DATABASE_URL:?AGENTS_DATABASE_URL not set}"
: "${BACKUP_DEST_DIR:?BACKUP_DEST_DIR not set}"

BACKUP_RETENTION_LOCAL="${BACKUP_RETENTION_LOCAL:-7}"
BACKUP_RETENTION_REMOTE="${BACKUP_RETENTION_REMOTE:-30}"
BACKUP_REMOTE="${BACKUP_REMOTE:-}"

mkdir -p "$BACKUP_DEST_DIR"

# Refuse to start if staging dir has < 1 GiB free
FREE_KB=$(df -k --output=avail "$BACKUP_DEST_DIR" | tail -1 | tr -d ' ')
if (( FREE_KB < 1048576 )); then
  echo "[backup] FATAL: only ${FREE_KB} KiB free on $BACKUP_DEST_DIR" >&2
  exit 2
fi

TS=$(date -u +%Y%m%dT%H%M%SZ)
LOG_PREFIX="[backup $TS]"

dump_one() {
  local label="$1" url="$2"
  local out="$BACKUP_DEST_DIR/${label}-${TS}.sql.gz"
  echo "$LOG_PREFIX dumping $label -> $out"
  # custom format would be smaller, but plain SQL is grep-able for emergencies
  pg_dump --no-owner --no-acl "$url" | gzip -9 > "$out"
  local size
  size=$(stat -c%s "$out")
  if (( size < 1024 )); then
    echo "$LOG_PREFIX FATAL: dump $out is only $size bytes — refusing to upload/prune" >&2
    exit 3
  fi
  echo "$LOG_PREFIX dumped $label, size=$size bytes"

  # Optional encryption
  if [[ -n "${BACKUP_GPG_RECIPIENT:-}" ]]; then
    gpg --batch --yes --trust-model always \
        --encrypt --recipient "$BACKUP_GPG_RECIPIENT" \
        --output "${out}.gpg" "$out"
    rm -f "$out"
    out="${out}.gpg"
    echo "$LOG_PREFIX encrypted -> $out"
  fi

  echo "$out"
}

ARCHIVEHUB_DUMP=$(dump_one archivehub "$DATABASE_URL" | tail -1)
ARCHIVEAGENTS_DUMP=$(dump_one archiveagents "$AGENTS_DATABASE_URL" | tail -1)

# Off-host push
if [[ -n "$BACKUP_REMOTE" ]]; then
  if ! command -v rclone >/dev/null 2>&1; then
    echo "$LOG_PREFIX WARN: BACKUP_REMOTE set but rclone not installed — keeping local copy only" >&2
  else
    echo "$LOG_PREFIX pushing to $BACKUP_REMOTE"
    rclone copy "$ARCHIVEHUB_DUMP"     "$BACKUP_REMOTE/" --no-traverse || \
      echo "$LOG_PREFIX WARN: rclone push failed for $ARCHIVEHUB_DUMP" >&2
    rclone copy "$ARCHIVEAGENTS_DUMP"  "$BACKUP_REMOTE/" --no-traverse || \
      echo "$LOG_PREFIX WARN: rclone push failed for $ARCHIVEAGENTS_DUMP" >&2

    # Remote prune by age
    rclone delete "$BACKUP_REMOTE/" --min-age "${BACKUP_RETENTION_REMOTE}d" || \
      echo "$LOG_PREFIX WARN: remote prune failed" >&2
  fi
fi

# Local prune by age
find "$BACKUP_DEST_DIR" -maxdepth 1 -type f \
     \( -name 'archivehub-*.sql.gz*' -o -name 'archiveagents-*.sql.gz*' \) \
     -mtime "+${BACKUP_RETENTION_LOCAL}" -print -delete | \
  sed "s|^|$LOG_PREFIX pruned |"

echo "$LOG_PREFIX done"
