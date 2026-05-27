# Database Schema

## Design Principles

- All addresses stored lowercase (checksummed on read, not in DB)
- All timestamps stored as `timestamptz` (UTC)
- Block numbers as `bigint`
- USDC amounts as `numeric(78,0)` (raw wei/smallest unit, 6 decimals for USDC)
- Agent IDs as `bigint` (ERC-721 tokenId)
- Job IDs as `bigint`
- Source contract address stored on every row (future-proofs for multiple deployments)

## Tables

### agents
Populated from: IdentityRegistry `Registered` + `Transfer` events

### reputation_events
Populated from: ReputationRegistry `NewFeedback` + `FeedbackRevoked` events

### reputation_responses
Populated from: ReputationRegistry `ResponseAppended` events

### validations
Populated from: ValidationRegistry `ValidationRequest` + `ValidationResponse` events

### jobs
Populated from: AgenticCommerce `JobCreated` + status change events

### job_events
Populated from: All AgenticCommerce events (full audit trail)

### agent_scores
Computed table — rebuilt periodically from reputation_events + jobs

### agent_metadata
Cached IPFS metadata for agents

### sync_state
Tracks last processed block per contract

---

## Event → Table Mapping

| Event | Source Contract | Target Table | Action |
|-------|---------------|--------------|--------|
| `Registered` | IdentityRegistry | agents | INSERT |
| `Transfer` | IdentityRegistry | agents | UPDATE owner |
| `URIUpdated` | IdentityRegistry | agents | UPDATE metadata_uri |
| `MetadataSet` | IdentityRegistry | agents (or agent_metadata) | UPDATE |
| `NewFeedback` | ReputationRegistry | reputation_events | INSERT |
| `FeedbackRevoked` | ReputationRegistry | reputation_events | UPDATE (mark revoked) |
| `ResponseAppended` | ReputationRegistry | reputation_responses | INSERT |
| `ValidationRequest` | ValidationRegistry | validations | INSERT |
| `ValidationResponse` | ValidationRegistry | validations | UPDATE (add response) |
| `JobCreated` | AgenticCommerce | jobs | INSERT |
| `ProviderSet` | AgenticCommerce | jobs | UPDATE provider |
| `BudgetSet` | AgenticCommerce | jobs | UPDATE budget |
| `JobFunded` | AgenticCommerce | jobs | UPDATE status=Funded |
| `JobSubmitted` | AgenticCommerce | jobs | UPDATE status=Submitted |
| `JobCompleted` | AgenticCommerce | jobs | UPDATE status=Completed |
| `JobRejected` | AgenticCommerce | jobs | UPDATE status=Rejected |
| `JobExpired` | AgenticCommerce | jobs | UPDATE status=Expired |
| `PaymentReleased` | AgenticCommerce | jobs | UPDATE payment_amount |
| `Refunded` | AgenticCommerce | jobs | UPDATE refund_amount |
| ALL AgenticCommerce events | AgenticCommerce | job_events | INSERT (audit log) |
