# ArcHive — File Structure

```
arc-hive/
├── docs/                              # Research, ABIs, specs (DONE)
│   ├── ABI_SUMMARY.md
│   ├── CONTRACT_INTERFACES.md
│   ├── DEPLOYMENT_BLOCKS.md
│   ├── ERC8183_FULL_INTERFACE.md
│   ├── RPC_CONFIG.md
│   ├── abi_agentic_commerce.json
│   ├── abi_identity_registry.json
│   ├── abi_reputation_registry.json
│   └── abi_validation_registry.json
├── packages/
│   ├── shared/                        # Shared types, ABIs, constants
│   │   ├── src/
│   │   │   ├── abis/
│   │   │   │   ├── IdentityRegistry.ts
│   │   │   │   ├── ReputationRegistry.ts
│   │   │   │   ├── ValidationRegistry.ts
│   │   │   │   ├── AgenticCommerce.ts
│   │   │   │   └── index.ts
│   │   │   ├── types.ts              # All TypeScript types
│   │   │   ├── constants.ts          # Addresses, chain config, block numbers
│   │   │   ├── events.ts             # Event name → topic0 mapping
│   │   │   └── index.ts              # Re-exports
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── indexer/                       # Core indexer service
│   │   ├── src/
│   │   │   ├── db/
│   │   │   │   ├── client.ts         # PostgreSQL connection pool
│   │   │   │   ├── queries.ts        # Insert/upsert functions
│   │   │   │   └── index.ts
│   │   │   ├── processors/
│   │   │   │   ├── identity.ts       # IdentityRegistry event handler
│   │   │   │   ├── reputation.ts     # ReputationRegistry event handler
│   │   │   │   ├── validation.ts     # ValidationRegistry event handler
│   │   │   │   ├── commerce.ts       # AgenticCommerce event handler
│   │   │   │   └── index.ts          # Router: topic0 → processor
│   │   │   ├── sync/
│   │   │   │   ├── historical.ts     # Backfill from deployment block to head
│   │   │   │   ├── live.ts           # WebSocket subscription for new blocks
│   │   │   │   ├── state.ts          # Track last synced block per contract
│   │   │   │   └── index.ts
│   │   │   ├── metadata/
│   │   │   │   ├── ipfs.ts           # Fetch + parse IPFS metadata
│   │   │   │   ├── queue.ts          # Background queue for metadata fetching
│   │   │   │   └── index.ts
│   │   │   ├── scoring/
│   │   │   │   ├── aggregator.ts     # Compute agent scores from feedback
│   │   │   │   ├── anti-sybil.ts     # Flag suspicious patterns (Phase 6, stub for now)
│   │   │   │   └── index.ts
│   │   │   ├── health.ts             # /health endpoint showing sync status
│   │   │   └── index.ts              # Entry point: starts sync + health server
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── api/                           # REST API (Phase 2 — scaffold only)
│   │   ├── src/
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── frontend/                      # React app (Phase 3 — scaffold only)
│   │   └── .gitkeep
│   └── sdk/                           # npm SDK (Phase 5 — scaffold only)
│       └── .gitkeep
├── migrations/
│   ├── 001_create_agents.sql
│   ├── 002_create_reputation_events.sql
│   ├── 003_create_validations.sql
│   ├── 004_create_jobs.sql
│   ├── 005_create_agent_scores.sql
│   ├── 006_create_sync_state.sql
│   └── run.ts                         # Migration runner script
├── scripts/
│   └── check-rpc.ts                   # Quick RPC connectivity test
├── docker-compose.yml                 # PostgreSQL for local dev
├── package.json                       # pnpm workspace root
├── pnpm-workspace.yaml
├── tsconfig.base.json                 # Shared TypeScript config
├── .env.example
├── .gitignore
├── PLAN.md
└── README.md
```

## Package Dependency Graph

```
shared ← indexer
shared ← api
shared ← sdk
```

`shared` has zero runtime deps beyond `viem` (for ABI types).
`indexer` depends on `shared` + `pg` + `dotenv`.
`api` depends on `shared` + `pg` + `hono`.
`sdk` depends on nothing (standalone HTTP client).

## Build Order

1. `shared` (types, ABIs, constants)
2. `migrations` (DB schema)
3. `indexer` (core service)
4. `api` (Phase 2)
5. `frontend` (Phase 3)
6. `sdk` (Phase 5)
