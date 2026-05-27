# Indexer Strategy & Error Handling

## Sync Strategy

### Historical Sync (backfill)

1. Read `sync_state` table for each contract's `last_synced_block`
2. If `last_synced_block` < current head, start backfill
3. Query `eth_getLogs` in chunks:
   - Chunk size: 10,000 blocks (safe with address filter — we only watch 4 contracts)
   - If we hit 20k result limit, halve chunk size and retry
   - Process events in order (block number → log index)
4. After each chunk: update `sync_state.last_synced_block`
5. On error: log, increment `error_count`, retry with exponential backoff (1s, 2s, 4s, max 30s)
6. On persistent failure (5 retries): skip chunk, log error, continue with next chunk

### Live Sync (real-time)

1. After historical sync catches up to head, switch to live mode
2. Connect WebSocket (`wss://rpc.testnet.arc.network`)
3. Subscribe to `newHeads`
4. On new block: fetch logs for that block (all 4 contracts in one `eth_getLogs` call)
5. Process events same as historical
6. Update `sync_state` after each block

### WebSocket Reconnection

- On disconnect: wait 1s, reconnect
- On 3 consecutive failures: fall back to HTTP polling (every 1s)
- On HTTP polling success for 30s: attempt WSS reconnect
- Log all connection state changes

## Error Handling

### RPC Errors

| Error | Action |
|-------|--------|
| Rate limited (429) | Exponential backoff, max 30s |
| Timeout | Retry 3x, then skip + log |
| Invalid response | Retry 1x, then skip + log |
| Connection refused | Switch to fallback RPC if available |

### Processing Errors

| Error | Action |
|-------|--------|
| Unknown event topic | Log warning, skip (don't crash) |
| Decode failure | Log error with raw data, skip event |
| DB insert failure (duplicate) | Ignore (idempotent) |
| DB insert failure (other) | Retry 3x, then dead-letter queue |
| Metadata fetch failure | Queue for retry (max 3 attempts) |

### Idempotency

All event processing is idempotent:
- `agents`: UPSERT on (agent_id, source_contract)
- `reputation_events`: UPSERT on (agent_id, client_address, feedback_index, source_contract)
- `validations`: UPSERT on (request_hash, source_contract)
- `jobs`: UPSERT on (job_id, source_contract)
- `job_events`: INSERT with (tx_hash, log_index) uniqueness check

This means: if indexer crashes and restarts, it can re-process the same block range without creating duplicates.

## IPFS Metadata Strategy

### Gateways (in priority order)

1. `https://ipfs.io/ipfs/` — public, reliable, slow
2. `https://gateway.pinata.cloud/ipfs/` — fast, rate limited
3. `https://cloudflare-ipfs.com/ipfs/` — fast, sometimes stale
4. `https://dweb.link/ipfs/` — fallback

### Fetch Logic

1. Agent registered → add to `metadata_queue` with status=pending
2. Background worker polls queue every 5s
3. Fetch metadata JSON from URI (handle ipfs://, https://, ar:// schemes)
4. Parse JSON, extract: name, description, image, agent_type, capabilities, version
5. Update `agents` table with denormalized fields
6. Mark queue entry as done
7. On failure: increment attempts, retry later (backoff: 30s, 60s, 120s)
8. After max_attempts: mark as failed, move on

### URI Handling

```
ipfs://Qm...        → https://ipfs.io/ipfs/Qm...
ipfs://bafk...      → https://ipfs.io/ipfs/bafk...
https://...         → fetch directly
ar://...            → https://arweave.net/...
data:application/json;base64,... → decode inline
```

## Scoring Strategy

### When to Recompute

- After processing a batch of reputation events
- After a job status changes to Completed/Rejected
- NOT on every single event (too expensive)
- Batch recompute: every 60 seconds if there are dirty agents

### Score Formula (v1, simple)

```
avg_score = SUM(value) / COUNT(*) WHERE is_revoked = FALSE
completion_rate = completed_jobs / total_jobs
trust_tier:
  0 (unverified) = just registered, no activity
  1 (active) = completed >= 3 jobs
  2 (trusted) = completed >= 10 jobs AND avg_score >= 70 AND has validation
  3 (elite) = completed >= 50 jobs AND avg_score >= 90 AND multiple validations
```

### Dirty Tracking

- Maintain a `SET` in memory of agent_ids that need score recomputation
- On reputation event: add agent_id to dirty set
- On job completion/rejection: add provider_agent_id to dirty set
- Every 60s: recompute scores for all dirty agents, clear set

## Testing Strategy

### Unit Tests

- Each processor: given raw log → correct DB row
- Score aggregator: given reputation events → correct score
- URI parser: given various URI formats → correct gateway URL

### Integration Tests

- Spin up Postgres (docker-compose)
- Run migrations
- Feed sample events (captured from testnet)
- Verify DB state

### Testnet Verification

- Run indexer against live testnet
- Compare agent count with `IdentityRegistry.balanceOf` or Transfer event count
- Compare job count with `AgenticCommerce.jobCounter()`
- Spot-check individual agents/jobs against explorer
