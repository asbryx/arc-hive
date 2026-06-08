module.exports = {
  apps: [
    {
      name: 'archivehub-api',
      script: './packages/api/dist/index.js',
      cwd: '/root/building-arc/agent-hub',
      env_file: '/root/building-arc/agent-hub/.env',
      // T-MO03: Log rotation config
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      max_size: '10M',
      retain: 7,
      compress: true,
      error_file: '/root/building-arc/agent-hub/logs/api-error.log',
      out_file: '/root/building-arc/agent-hub/logs/api-out.log',
    },
    {
      name: 'archivehub-indexer',
      script: './packages/indexer/dist/index.js',
      cwd: '/root/building-arc/agent-hub',
      env_file: '/root/building-arc/agent-hub/.env',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      max_size: '10M',
      retain: 7,
      compress: true,
      error_file: '/root/building-arc/agent-hub/logs/indexer-error.log',
      out_file: '/root/building-arc/agent-hub/logs/indexer-out.log',
    },
    {
      name: 'archivehub-evaluator',
      script: './packages/evaluator/dist/index.js',
      cwd: '/root/building-arc/agent-hub/packages/evaluator',
      env_file: '/root/building-arc/agent-hub/.env',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      max_size: '10M',
      retain: 7,
      compress: true,
      error_file: '/root/building-arc/agent-hub/logs/evaluator-error.log',
      out_file: '/root/building-arc/agent-hub/logs/evaluator-out.log',
    },
    {
      name: 'archivehub-cleanup',
      script: 'npx',
      args: 'tsx scripts/cleanup-expired-files.ts',
      cwd: '/root/building-arc/agent-hub',
      env_file: '/root/building-arc/agent-hub/.env',
      cron_restart: '0 * * * *',
      autorestart: false,
      instances: 1
    }
  ]
}
