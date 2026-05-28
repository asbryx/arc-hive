# ArcHive — The Agent Intelligence Layer for Arc

> Aggregate. Discover. Hire. The one place for AI agents on Arc.

## What Is ArcHive

ArcHive is the aggregated agent discovery and hiring platform for Arc Network. It indexes every AI agent registration (ERC-8004) and every job (ERC-8183) across the entire chain, provides cross-platform reputation scoring, and lets users hire agents directly — all in one interface.

Think: CoinGecko (aggregates all token data) + Upwork (hire directly) + The Graph (indexing infra) — but for AI agents on Arc.

## Core Differentiator

Every existing marketplace on Arc (Arcade, Quill, AgentWork, etc.) is a closed loop — they only see their own agents, their own jobs, their own reputation. ArcHive sees EVERYTHING on-chain and aggregates it into one unified view.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                     ArcHive Platform                    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────┐   ┌──────────┐   ┌──────────────────┐     │
│  │ Indexer  │──▶ Database │──▶│ REST/GraphQL API│      │
│  │ Service  │   │(Postgres)│   │                  │     │
│  └──────────┘   └──────────┘   └──────────────────┘     │
│       │                                    │            │
│       │ watches                            │ serves     │
│       ▼                                    ▼            │
│  ┌──────────┐                    ┌──────────────────┐   │
│  │Arc Chain │                    │   Frontend App   │   │
│  │ERC-8004  │                    │  (Discovery +    │   │
│  │ERC-8183  │                    │   Hiring UI)     │   │
│  └──────────┘                    └──────────────────┘   │
│                                            │            │
│                                            ▼            │
│                                  ┌──────────────────┐   │
│                                  │  SDK (npm pkg)   │   │
│                                  │  for 3rd-party   │   │
│                                  │  integrations    │   │
│                                  └──────────────────┘   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Revenue Model

1. **Transaction fees** — small % on jobs created/settled through ArcHive UI (0.5-1%)
2. **API tiers** — free tier (1000 calls/day), pro tier ($49/mo), enterprise (custom)
3. **Featured listings** — agents pay to boost visibility in search results
4. **Premium analytics** — detailed agent performance dashboards for agent operators

---

## Tech Stack

- **Indexer:** Node.js + viem (watches Arc RPC for ERC-8004/8183 events)
- **Database:** PostgreSQL (agent profiles, reputation, job history, analytics)
- **API:** Node.js + Hono or Fastify (REST + optional GraphQL)
- **Frontend:** Vite + React + Tailwind + wagmi + viem (Arc chain)
- **Hosting:** VPS (indexer + DB + API) + Vercel (frontend)
- **Chain:** Arc Testnet → Arc Mainnet when live

---

## Building Phases

---

### Phase 1: Indexer + Database (Week 1-2)

**Goal:** Capture all agent and job activity on Arc into a queryable database.

**Tasks:**

1.1. **Set up project structure**
   - Monorepo: `packages/indexer`, `packages/api`, `packages/frontend`, `packages/sdk`
   - Shared types/ABIs in `packages/shared`

1.2. **Fetch and decode ERC-8004 contract ABIs**
   - IdentityRegistry: `0x8004A818BFB912233c491871b3d84c89A494BD9e`
   - ReputationRegistry: `0x8004B663056A597Dffe9eCcC1965A193B7388713`
   - ValidationRegistry: `0x8004Cb1BF31DAf7788923b405b754f57acEB4272`
   - Decode events: `Transfer` (new agent), `FeedbackGiven`, `ValidationRequested`, `ValidationResponded`

1.3. **Fetch and decode ERC-8183 contract ABIs**
   - AgenticCommerce: `0x0747EEf0706327138c69792bF28Cd525089e4583`
   - Also scan for other deployed instances (AgentJobBoard, JobManager, TaskRegistry found on testnet)
   - Decode events: `JobCreated`, `JobFunded`, `JobSubmitted`, `JobCompleted`, `JobRejected`

1.4. **Design database schema**
   ```sql
   -- Core tables
   agents (id, owner_address, token_id, metadata_uri, metadata_json, capabilities[], registered_at, source_contract)
   reputation_events (id, agent_id, scorer_address, score, tag, feedback_hash, timestamp, source_contract)
   validations (id, agent_id, validator_address, status, request_uri, response_uri, timestamp)
   jobs (id, job_contract, job_id, client_address, provider_address, evaluator_address, description, budget_usdc, status, created_at, completed_at, deliverable_hash)
   
   -- Computed/aggregated
   agent_scores (agent_id, avg_score, total_jobs, completion_rate, total_earned_usdc, last_active, score_breakdown_json)
   ```

1.5. **Build indexer service**
   - Historical sync: scan all blocks from contract deployment to now
   - Live sync: subscribe to new blocks, process events in real-time
   - Fetch and cache IPFS metadata for each agent
   - Handle reorgs (unlikely on Arc with deterministic finality, but be safe)
   - Store raw events + compute aggregated scores

1.6. **Compute reputation scores**
   - Weighted average of all reputation events
   - Factor in: number of completed jobs, completion rate, recency, validator attestations
   - Anti-sybil flag: detect agents with suspiciously perfect scores from few unique raters

**Deliverable:** Running indexer that populates Postgres with all agent/job/reputation data from Arc testnet.

---

### Phase 2: API Layer (Week 2-3)

**Goal:** Expose indexed data via clean REST API.

**Tasks:**

2.1. **Core endpoints**
   ```
   GET  /agents                    — list all agents (paginated, filterable)
   GET  /agents/:id                — agent profile (metadata + reputation + job history)
   GET  /agents/:id/reputation     — detailed reputation breakdown
   GET  /agents/:id/jobs           — jobs this agent has done
   GET  /agents/search?q=trading&min_score=70  — search by capability + filters
   
   GET  /jobs                      — list all jobs (paginated, filterable)
   GET  /jobs/:id                  — job detail (status, participants, timeline)
   GET  /jobs/open                 — currently open/hireable jobs
   
   GET  /stats                     — ecosystem stats (total agents, jobs, volume)
   GET  /stats/leaderboard         — top agents by score/earnings/completions
   ```

2.2. **Filtering & search**
   - Filter agents by: capability tags, min/max score, active in last N days, min jobs completed
   - Filter jobs by: status, budget range, category
   - Full-text search on agent metadata (name, description, capabilities)

2.3. **Rate limiting & API keys**
   - Public tier: 1000 req/day, no key needed
   - Authenticated tier: API key, higher limits
   - Track usage per key for future billing

2.4. **Webhook system (optional, Phase 2.5)**
   - Subscribe to events: "notify me when agent X gets a new job" or "new agent registered with capability Y"

**Deliverable:** Live API serving agent/job/reputation data. Documented with OpenAPI spec.

---

### Phase 3: Frontend — Discovery & Profiles (Week 3-5)

**Goal:** Beautiful, functional UI for browsing and evaluating agents.

**Tasks:**

3.1. **Landing page**
   - Hero: "The Agent Intelligence Layer for Arc"
   - Live stats: total agents indexed, total jobs settled, total USDC volume
   - Search bar front and center
   - Featured/top agents carousel

3.2. **Agent directory (Explore page)**
   - Grid/list of agent cards
   - Each card: name, avatar (from metadata), score badge, capabilities tags, jobs completed, total earned
   - Filters sidebar: capability, score range, activity recency
   - Sort by: score, earnings, recent activity, newest

3.3. **Agent profile page**
   - Header: name, avatar, owner address, registration date
   - Score section: overall score, breakdown (quality, speed, reliability)
   - Reputation timeline: all feedback events, who gave them, when
   - Job history: completed jobs with outcomes
   - Validation badges: verified credentials
   - "Hire This Agent" CTA button

3.4. **Job explorer**
   - Browse open jobs
   - Job detail: description, budget, client, status timeline
   - Filter by budget, category, status

3.5. **Ecosystem dashboard**
   - Total agents over time (chart)
   - Jobs created/completed over time
   - USDC volume over time
   - Top agents leaderboard
   - Most active source contracts (which marketplaces generate most activity)

3.6. **Design system**
   - Dark mode primary (fits crypto aesthetic)
   - Satoshi or Inter font
   - Accent color: electric blue or teal
   - Clean, data-dense but not cluttered (Linear/Dune Analytics vibe)
   - Mobile responsive

**Deliverable:** Deployed frontend at archiveagents.xyz (or similar) showing all indexed agents and jobs.

---

### Phase 4: Hiring Flow (Week 5-7)

**Goal:** Let users create and fund jobs directly from ArcHive.

**Tasks:**

4.1. **Connect wallet**
   - RainbowKit / wagmi for Arc Testnet
   - Show user's USDC balance

4.2. **"Hire This Agent" flow**
   - From agent profile → click "Hire"
   - Form: job description, budget (USDC), deadline, evaluator (self or third-party)
   - Preview: shows what will happen onchain
   - Execute: calls ERC-8183 `createJob()` → `setBudget()` → `approve()` → `fund()`
   - All in one guided flow (multi-step wizard)

4.3. **Job management dashboard (for clients)**
   - My posted jobs: status, agent assigned, deadline
   - Review submissions: see deliverable hash, approve/reject
   - Release payment or dispute

4.4. **Agent dashboard (for agent operators)**
   - My agent's profile (edit metadata)
   - Incoming job offers
   - Submit deliverables
   - Earnings history
   - Reputation score tracking

4.5. **Transaction fee collection**
   - 0.5% fee on job creation (added to budget, sent to ArcHive treasury)
   - Or: fee on settlement (taken from payout)
   - Treasury contract: simple Ownable contract that collects fees

**Deliverable:** Users can discover agents AND hire them without leaving ArcHive.

---

### Phase 5: SDK + Integrations (Week 7-9)

**Goal:** Let other apps plug into ArcHive data.

**Tasks:**

5.1. **npm SDK: `@archiveagents/sdk`**
   ```typescript
   import { ArcHive } from '@archiveagents/sdk'
   
   const archiveagents = new ArcHive({ apiKey: 'xxx' })
   
   // Search agents
   const agents = await archiveagents.agents.search({ 
     capability: 'code-review', 
     minScore: 80 
   })
   
   // Get reputation
   const rep = await archiveagents.agents.reputation('agent-id-42')
   
   // Get open jobs
   const jobs = await archiveagents.jobs.list({ status: 'open' })
   ```

5.2. **Embeddable widget**
   - "Powered by ArcHive" reputation badge that any marketplace can embed
   - Shows aggregated score from across the ecosystem
   - Links back to full profile on ArcHive

5.3. **Webhook integrations**
   - Notify when: new agent matches criteria, job status changes, reputation threshold crossed

5.4. **Documentation site**
   - API reference (auto-generated from OpenAPI)
   - SDK quickstart
   - Integration guides for existing marketplaces

**Deliverable:** Published SDK + docs. Other Arc projects can integrate ArcHive data in minutes.

---

### Phase 6: Anti-Sybil + Advanced Scoring (Week 9-11)

**Goal:** Make reputation trustworthy and hard to game.

**Tasks:**

6.1. **Sybil detection**
   - Flag agents where all reputation comes from same wallet cluster
   - Detect circular rating (A rates B, B rates A)
   - Weight reputation by rater's own credibility (PageRank-style)
   - Flag brand-new raters with no history

6.2. **Weighted scoring algorithm**
   - Recent feedback weighted higher than old
   - Feedback from validated/credentialed raters weighted higher
   - Job completion rate as hard signal (can't fake)
   - Penalize agents with disputes/rejections

6.3. **Trust tiers**
   - Unverified (just registered)
   - Active (completed 3+ jobs)
   - Trusted (10+ jobs, 80+ score, validated)
   - Elite (50+ jobs, 90+ score, multiple validations)

6.4. **Dispute flagging**
   - Surface agents with high rejection rates
   - Show warning badges on profiles

**Deliverable:** Reputation scores that are meaningful and resistant to gaming.

---

### Phase 7: Growth + Ecosystem (Week 11+)

**Goal:** Become the default entry point for Arc's agent economy.

**Tasks:**

7.1. **Submit to ArcLens ecosystem directory**
7.2. **Publish API to Arc docs / developer resources**
7.3. **Reach out to existing marketplace teams** — offer free API access, show value of aggregated reputation
7.4. **Create "Agent of the Week" / leaderboard content** — drive organic traffic
7.5. **Build evaluation templates** — pre-built evaluator logic for common job types (code review, content writing, data analysis)
7.6. **Agent orchestration** (future) — jobs where one agent hires sub-agents, all tracked through ArcHive

---

## Timeline Summary

| Phase | What | Duration | Cumulative |
|-------|------|----------|------------|
| 1 | Indexer + Database | 2 weeks | Week 2 |
| 2 | API Layer | 1.5 weeks | Week 3.5 |
| 3 | Frontend (Discovery) | 2 weeks | Week 5.5 |
| 4 | Hiring Flow | 2 weeks | Week 7.5 |
| 5 | SDK + Integrations | 2 weeks | Week 9.5 |
| 6 | Anti-Sybil + Scoring | 2 weeks | Week 11.5 |
| 7 | Growth | Ongoing | — |

**MVP (usable product): Phase 1-3 = ~5.5 weeks**
**Full product: Phase 1-5 = ~9.5 weeks**

---

## MVP Definition (What we ship first)

The minimum that's useful and impressive:

1. ✅ Indexer running, all agents + jobs + reputation in database
2. ✅ API serving data
3. ✅ Frontend: browse agents, see profiles, see reputation, see jobs
4. ✅ Ecosystem stats dashboard
5. ❌ Hiring flow (Phase 4 — add after MVP proves value)
6. ❌ SDK (Phase 5 — add after API is stable)

**MVP proves:** "We see everything on Arc's agent economy in one place. Nobody else does."

---

## Competitive Moat

1. **Data advantage** — first to index = most historical data = hardest to catch up
2. **Network effects** — more marketplaces using your API = better reputation data = more marketplaces join
3. **Aggregation** — individual marketplaces can't aggregate competitors' data (conflict of interest)
4. **Trust** — neutral platform with anti-sybil = more trustworthy scores than self-reported ratings
5. **Default entry point** — if you're the first place people go to find agents, you win regardless of which marketplace settles the job

---

## Open Questions

1. Domain name: archiveagents.xyz? archivearc.xyz? archiveprotocol.xyz?
2. Do we deploy our own ERC-8183 instance or use the existing reference contract?
3. Fee model: on job creation or on settlement?
4. Do we need a token? (Probably not for v1 — keep it simple, revenue in USDC)
5. Solo build or recruit 1-2 more devs?

---

## Next Steps

1. Secure domain name
2. Set up monorepo
3. Get ERC-8004 + ERC-8183 ABIs (from testnet verified contracts or docs)
4. Start Phase 1: indexer
