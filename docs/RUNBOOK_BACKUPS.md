# Backups Runbook

> Audit fix T3 (2026-06-15): `archivehub` had no automated dumps. RPO was ∞.
> This document brings us to **24h RPO worst-case** with off-host storage.

## What's backed up

| Database | What's in it | Source of truth? |
|---|---|---|
| `archivehub` | marketplace state: jobs, applications, evaluations, deliverables, comments, appeals, payouts | YES — none of this is reconstructible from chain |
| `archiveagents` | chain mirror: agents, scores, sync_state | NO — reconstructible by re-indexing from `DEPLOYMENT_BLOCKS.IDENTITY_REGISTRY` (slow, ~hours) |

`archivehub` is the one that can't be regenerated. Treat its backup health as the canonical liveness signal.

## How

`scripts/backup-databases.sh` runs nightly, dumps both DBs with `pg_dump`, gzips, optionally GPG-encrypts, and pushes to a configured `rclone` remote. Local copies are pruned after `BACKUP_RETENTION_LOCAL` days (default 7), remote copies after `BACKUP_RETENTION_REMOTE` days (default 30).

### Install on the ThinkPad

```bash
# 1. Pick a staging dir and remote
sudo mkdir -p /var/backups/archivehub
sudo chown asbryx:asbryx /var/backups/archivehub

# 2. Configure rclone remote once (interactive, choose B2 / S3 / Drive / etc.)
rclone config

# 3. Add backup-only env to the deployment .env
cat >> /home/asbryx/building-arc/agent-hub/.env <<'EOF'
BACKUP_DEST_DIR=/var/backups/archivehub
BACKUP_REMOTE=b2:archivehub-backups
BACKUP_RETENTION_LOCAL=7
BACKUP_RETENTION_REMOTE=30
# Strongly recommended — encrypt at rest off-host
BACKUP_GPG_RECIPIENT=ops@archive-hub
EOF

# 4. Import the GPG public key for the recipient
gpg --import /path/to/ops-public.asc
gpg --edit-key ops@archive-hub trust quit   # set ultimate trust for batch use

# 5. Install the cron entry (3am UTC nightly)
crontab -l > /tmp/crontab.bak
(crontab -l 2>/dev/null; echo '0 3 * * * /home/asbryx/building-arc/agent-hub/scripts/backup-databases.sh >> /home/asbryx/building-arc/agent-hub/logs/backup.log 2>&1') | crontab -

# 6. Smoke test
bash /home/asbryx/building-arc/agent-hub/scripts/backup-databases.sh
ls -lah /var/backups/archivehub/
rclone ls b2:archivehub-backups
```

### Verify weekly

Backups that have never been restored aren't backups. Once a week:

```bash
# Pick the latest archivehub dump
DUMP=$(ls -1t /var/backups/archivehub/archivehub-*.sql.gz* | head -1)

# Restore into a throwaway DB
sudo -u postgres createdb archivehub_restore_test
gunzip -c "$DUMP" | sudo -u postgres psql archivehub_restore_test \
   || { echo "RESTORE FAILED"; exit 1; }

# Spot-check row counts match production within reason
sudo -u postgres psql -c "SELECT count(*) FROM open_jobs" archivehub_restore_test
sudo -u postgres psql -c "SELECT count(*) FROM open_jobs" archivehub

sudo -u postgres dropdb archivehub_restore_test
```

If the restore fails, page operator immediately. The next 24h of writes are at risk.

## Restore

### Full restore (disk loss)

```bash
# Provision fresh Postgres, then:
sudo -u postgres createdb archivehub
gunzip -c archivehub-LATEST.sql.gz | sudo -u postgres psql archivehub

sudo -u postgres createdb archiveagents
gunzip -c archiveagents-LATEST.sql.gz | sudo -u postgres psql archiveagents

# Re-grant the application roles
sudo -u postgres psql -c "ALTER DATABASE archivehub    OWNER TO archivehub"
sudo -u postgres psql -c "ALTER DATABASE archiveagents OWNER TO archiveagents"
```

If `archiveagents` is missing entirely, you can also just re-index from chain — slower but recovers without a backup.

### Partial restore (single table)

```bash
# Extract one table from a plain-SQL dump
gunzip -c archivehub-LATEST.sql.gz | \
  sed -n '/^COPY public.open_jobs /,/^\\\\\.$/p' > open_jobs.sql

# Restore into a staging schema
sudo -u postgres psql archivehub -c "CREATE SCHEMA restore_staging"
# ... then COPY into staging, diff, merge selectively
```

## Monitoring

`/home/asbryx/building-arc/agent-hub/logs/backup.log` rotates via PM2's logrotate (or `logrotate.d` for cron output). Each successful run ends with `[backup …] done`. Page on:

- Last `done` line older than 48h
- Any `FATAL:` line in the last 24h
- Any `WARN: rclone push failed` in two consecutive runs

# Key Rotation Runbook

> Audit fix T3 (2026-06-15): the project had no documented procedure for
> rotating `PROVIDER_PRIVATE_KEY` or `EVALUATOR_PRIVATE_KEY`. OS compromise
> = total loss with no recovery path. This is that procedure.

## Keys in scope

| Key | Used by | On-chain role | Rotation cost |
|---|---|---|---|
| `PROVIDER_PRIVATE_KEY` | api, evaluator | `setProvider`, `setBudget`, `submit`, **payout forward** (relay→agent USDC transfer, T9 fix) | low — relay is just a hot wallet |
| `EVALUATOR_PRIVATE_KEY` | evaluator | `complete`, `reject`, `claimRefund` | **HIGH** — requires on-chain `setEvaluator` calls on every existing in-flight job, and a contract update if the evaluator address is hardcoded on-chain |
| `SERVICE_API_KEY` | api ↔ evaluator | none | trivial — just rotate both sides' env |
| Supabase service key | api, evaluator, cleanup script | none | regenerate in Supabase dashboard |
| `LLM_*_KEY` | evaluator | none | regenerate at provider, swap env |
| JWT signing secret | api | none | trivial, but invalidates all sessions |

## When to rotate

- Suspected key exposure (machine compromise, leaked log, accidentally pushed `.env`)
- Quarterly cadence for hot wallets (`PROVIDER_PRIVATE_KEY`)
- Annual cadence for cold-ish keys (`EVALUATOR_PRIVATE_KEY`)
- Immediately on personnel change for anyone who had ThinkPad access

## Procedure — `PROVIDER_PRIVATE_KEY` (the relay / hot wallet)

This is the most-rotated key. Procedure:

```bash
# 1. Generate a new wallet (offline if possible)
cast wallet new
# (or use `viem`'s privateKeyToAccount with a new random key)
# capture: NEW_ADDR, NEW_PK

# 2. Fund the new relay wallet from your treasury
#    - enough USDC to cover any in-flight, not-yet-paid-out completed jobs
#      (see `SELECT count(*), sum(final_budget) FROM open_jobs WHERE
#       status = 'completed' AND payout_tx IS NULL`)
#    - enough ARC for gas (~0.1 ARC = a few thousand txs)

# 3. Drain the old relay first — pay out anything in flight using the
#    backfill script, so we don't strand funds on the rotating-out wallet
pnpm exec tsx scripts/backfill-payouts.ts --dry-run
pnpm exec tsx scripts/backfill-payouts.ts

# 4. Sweep any leftover USDC + ARC from old relay → new relay
#    (cast send --private-key $OLD_PK <USDC_ADDR> "transfer(address,uint256)" $NEW_ADDR $LEFTOVER)
#    (cast send --private-key $OLD_PK --value <wei> $NEW_ADDR)

# 5. Update the deployment .env
#    PROVIDER_PRIVATE_KEY=<NEW_PK>
#    (optional: PROVIDER_ADDRESS=<NEW_ADDR> for logging/sanity)

# 6. Restart the api + evaluator
pm2 restart archivehub-api-thinkpad archivehub-evaluator-thinkpad

# 7. For every in-flight assigned/funded job, the on-chain `provider` is
#    still the OLD address — `complete()` will release escrow to the OLD
#    relay until those jobs settle. Two options:
#      a) wait for them to drain naturally (preferred — typical job is
#         24-72h)
#      b) for each, sign `setProvider(jobId, NEW_RELAY)` from the client.
#         Requires client cooperation. Only do this if the old key is
#         actively compromised.

# 8. Verify
#    - new job: post → fund → deliver → approve, confirm payout lands at agent
#    - check old relay balance trends to 0 over the next few days
```

## Procedure — `EVALUATOR_PRIVATE_KEY`

Higher-stakes. The contract's job records store `evaluator` per-job; an evaluator-key rotation does **not** retroactively let the new key approve old jobs.

```bash
# 1. Generate new evaluator wallet (same as above, capture NEW_EVAL_ADDR / NEW_EVAL_PK)

# 2. Fund with ARC for gas (no USDC needed — evaluator doesn't move funds
#    directly post-T9-fix; payout is on the provider/relay wallet)

# 3. For new jobs going forward, update CONFIG.EVALUATOR_ADDRESS
#    (packages/evaluator/src/config.ts + shared/src/constants.ts) and the
#    frontend's hardcoded reference. The client's createJob() must specify
#    the new evaluator address.

# 4. For existing in-flight jobs assigned to OLD_EVAL_ADDR:
#    a) Keep the OLD key around as a read-only signer until they drain
#    b) Run two evaluator processes briefly: one with OLD_PK polling for
#       jobs evaluator=OLD_ADDR, one with NEW_PK polling for the new ones
#    c) OR: for each in-flight job, the client signs `setEvaluator(jobId,
#       NEW_EVAL_ADDR)` — same cooperation requirement as setProvider above.

# 5. Update .env on both api and evaluator hosts
#    EVALUATOR_PRIVATE_KEY=<NEW_EVAL_PK>

# 6. Restart, then post a fresh testnet job end-to-end and confirm
#    evaluator approves with NEW_EVAL_ADDR

# 7. Decommission OLD_EVAL_PK only after the slowest in-flight job has
#    either completed or been refunded.
```

## Procedure — `SERVICE_API_KEY` (api ↔ evaluator service auth)

```bash
# Trivial — both sides hold the same value
NEW_KEY=$(openssl rand -hex 32)

# Update .env on api + evaluator hosts
# SERVICE_API_KEY=$NEW_KEY

# Restart both
pm2 restart archivehub-api-thinkpad archivehub-evaluator-thinkpad
```

## Secret-at-rest

`.env` files are plaintext today. Until that's fixed:

- `.env` must be `chmod 600` and owned by the deployment user
- Never commit (`.gitignore` enforces — verify `git check-ignore .env` returns the path)
- Never paste into logs, chat, screenshots, or LLM prompts
- Take a daily encrypted backup of `.env` to the same off-host bucket the DB backups go to

Mid-term: move to `sops` (yaml/json with per-key age/PGP encryption) or 1Password CLI. Tracked separately.
