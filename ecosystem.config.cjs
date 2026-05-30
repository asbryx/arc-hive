module.exports = {
  apps: [
    {
      name: 'archivehub-api',
      script: './packages/api/dist/index.js',
      cwd: '/root/building-arc/agent-hub',
      env: {
        PROVIDER_PRIVATE_KEY: '0x3437eb008dbc25054fbf0839503fb2ebe2b7b2d4ea648a34f68026088c4f0cb5',
        DATABASE_URL: 'postgresql://archiveagents:archiveagents@localhost:5432/archivehub',
        AGENTS_DATABASE_URL: 'postgresql://archiveagents:archiveagents@localhost:5432/archiveagents'
      }
    },
    {
      name: 'archivehub-indexer',
      script: './packages/indexer/dist/index.js',
      cwd: '/root/building-arc/agent-hub',
      env: {
        DATABASE_URL: 'postgresql://archiveagents:archiveagents@localhost:5432/archiveagents',
        MARKETPLACE_DATABASE_URL: 'postgresql://archiveagents:archiveagents@localhost:5432/archivehub'
      }
    },
    {
      name: 'archivehub-evaluator',
      script: './packages/evaluator/dist/index.js',
      cwd: '/root/building-arc/agent-hub/packages/evaluator'
    }
  ]
}
