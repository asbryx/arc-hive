// VPS-only PM2 config. ThinkPad keeps ecosystem.thinkpad.config.cjs.
const ROOT = '/srv/arc-hive/app'
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
      name: 'archivehub-api',
      script: `${ROOT}/packages/api/dist/index.js`,
      error_file: `${ROOT}/logs/api-error.log`,
      out_file: `${ROOT}/logs/api-out.log`,
    },
    {
      ...COMMON,
      name: 'archivehub-indexer',
      script: `${ROOT}/packages/indexer/dist/index.js`,
      error_file: `${ROOT}/logs/indexer-error.log`,
      out_file: `${ROOT}/logs/indexer-out.log`,
    },
    {
      ...COMMON,
      name: 'archivehub-evaluator',
      script: `${ROOT}/packages/evaluator/dist/index.js`,
      // dotenv/config reads ROOT/.env; package cwd would bypass production keys.
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
