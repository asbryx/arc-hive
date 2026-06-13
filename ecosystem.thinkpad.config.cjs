// PM2 ecosystem for the ThinkPad WSL deployment (asbryx user, /home/asbryx/...).
//
// The VPS-side ecosystem.config.cjs is for a different deployment (root,
// /root/building-arc/...). Don't merge them — the env mapping and paths differ.
//
// Usage:
//   cd /home/asbryx/building-arc/agent-hub
//   pm2 start ecosystem.thinkpad.config.cjs
//   pm2 save
//
// Why each app's `env` block exists:
//   - The shared .env defines DATABASE_URL=archivehub (because the API and
//     evaluator query marketplace tables) and AGENTS_DATABASE_URL=archiveagents.
//   - The indexer needs the OPPOSITE: it reads sync_state / agents from
//     archiveagents, so we override DATABASE_URL for that one process here.
//   - We never edit .env per-process because the api+evaluator+indexer all
//     read the same file. Per-app env in this config solves it.

const ROOT = '/home/asbryx/building-arc/agent-hub'
const ENV_FILE = `${ROOT}/.env`

const COMMON = {
  cwd: ROOT,
  env_file: ENV_FILE,
  log_date_format: 'YYYY-MM-DD HH:mm:ss',
  max_size: '10M',
  retain: 7,
  compress: true,
}

module.exports = {
  apps: [
    {
      ...COMMON,
      name: 'archivehub-api-thinkpad',
      script: `${ROOT}/packages/api/dist/index.js`,
      error_file: `${ROOT}/logs/api-error.log`,
      out_file: `${ROOT}/logs/api-out.log`,
    },
    {
      ...COMMON,
      name: 'archivehub-indexer-thinkpad',
      script: `${ROOT}/packages/indexer/dist/index.js`,
      // Override: indexer reads sync_state etc. from archiveagents.
      // The new client.ts prefers AGENTS_DATABASE_URL, so this stays correct
      // even if someone later flips DATABASE_URL back.
      env: {
        AGENTS_DATABASE_URL: 'postgresql://archiveagents:archiveagents@localhost:5432/archiveagents',
      },
      error_file: `${ROOT}/logs/indexer-error.log`,
      out_file: `${ROOT}/logs/indexer-out.log`,
    },
    {
      ...COMMON,
      name: 'archivehub-evaluator-thinkpad',
      script: `${ROOT}/packages/evaluator/dist/index.js`,
      cwd: `${ROOT}/packages/evaluator`,
      error_file: `${ROOT}/logs/evaluator-error.log`,
      out_file: `${ROOT}/logs/evaluator-out.log`,
    },
    {
      ...COMMON,
      name: 'archivehub-cleanup',
      script: 'npx',
      args: 'tsx scripts/cleanup-expired-files.ts',
      cron_restart: '0 * * * *',
      autorestart: false,
      instances: 1,
    },
  ],
}
