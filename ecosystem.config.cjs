module.exports = {
  apps: [
    {
      name: 'archivehub-api',
      script: './packages/api/dist/index.js',
      cwd: '/root/building-arc/agent-hub',
      env_file: '/root/building-arc/agent-hub/.env'
    },
    {
      name: 'archivehub-indexer',
      script: './packages/indexer/dist/index.js',
      cwd: '/root/building-arc/agent-hub',
      env_file: '/root/building-arc/agent-hub/.env'
    },
    {
      name: 'archivehub-evaluator',
      script: './packages/evaluator/dist/index.js',
      cwd: '/root/building-arc/agent-hub/packages/evaluator',
      env_file: '/root/building-arc/agent-hub/.env'
    }
  ]
}
