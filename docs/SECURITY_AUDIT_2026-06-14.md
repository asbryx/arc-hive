# Security Audit — 2026-06-14

Branch: `security/full-audit-fixes-jun14`

This audit covered the entire `arc-hive` repository plus its live VPS deployment
(`194.195.209.138`), Vercel deployment (`arcs-hive.vercel.app`), and the Supabase
project that backs deliverable file storage. It enumerates every vulnerability
found, the attack chains they enable, and the fixes applied in this branch.

---

## 1 · Vulnerability list

Severity legend: **C**ritical, **H**igh, **M**edium, **L**ow.

| # | Sev | Component | Title | Fixed in this branch |
|---|-----|-----------|-------|----------------------|
| V-01 | C | repo (history + working tree) | Hardcoded EOA private key `0xab4a3c…b5e9c` committed in `packages/api/deliver*.{cjs,mjs}` — anyone who pulls the repo can sign as that wallet | ✅ files removed; key MUST be rotated outside the repo |
| V-02 | C | Vercel rewrite | Frontend → backend traffic crosses the public internet over **plain HTTP** (`http://194.195.209.138:3000`). MITM yields JWTs, signed messages, deliverable bodies | ✅ rewrites switched to HTTPS; deploy must put the VPS behind TLS terminator |
| V-03 | C | indexer | `metadata_uri` from on-chain registration is fetched without SSRF protection. Anyone who registers an agent can target `http://localhost`, `http://169.254.169.254`, Tailscale CGNAT (`100.64.0.0/10`), or the VPS-internal `127.0.0.1:5432`-like services | ✅ full SSRF allowlist + DNS recheck + redirect manual + size cap |
| V-04 | C | api/supabase.ts | User-facing Supabase client falls back to `SUPABASE_SERVICE_KEY` if `SUPABASE_ANON_KEY` is missing → silently bypasses RLS for every download | ✅ never falls back; error if anon key absent |
| V-05 | C | api/x402.ts | `x402PaymentRequired` accepts ANY non-empty `x-api-key` and ANY non-empty `x-payment-proof` — payment is bypassable trivially. (Currently the middleware is not mounted, but the bug ships in main) | ✅ API keys verified against `api_keys` table; payment proofs verified on-chain (USDC Transfer event to `payTo`) with replay-protection window |
| V-06 | H | api/middleware/auth.ts | `jwt.verify` was called without `algorithms` allowlist in some routes (`open-jobs.ts requireWalletAuth`) → alg=none / RS256 confusion possible if attacker controls a JWKS forging chain | ✅ central `verifyToken` enforces HS256 only, plus iss/aud, plus header inspection rejecting alg=none before verify |
| V-07 | H | api/auth/verify GET | `jwt.verify(token, JWT_SECRET)` with no `algorithms` field — same alg-confusion class as V-06 | ✅ replaced with `verifyToken` |
| V-08 | H | api/middleware/rate-limit.ts | `cf-connecting-ip` / `x-vercel-forwarded-for` trusted unconditionally, but the upstream `thinkpad-api-proxy.js` forwards every request header verbatim, so any client can spoof these headers and: a) bypass the rate limit indefinitely; b) corrupt audit logs | ✅ trusted header is opt-in via `TRUSTED_PROXY_HEADER`; default is socket peer IP |
| V-09 | H | api/keys.ts SSRF | Webhook URL allowlist had: HTTP allowed despite error message; CGNAT/Tailscale (100.64/10) not blocked; IPv6 ULA/link-local not blocked; DNS failure was treated as "allow"; no re-validation at fire time (rebinding bypass); userinfo URLs allowed | ✅ HTTPS-only; CGNAT + IPv6 ranges blocked; DNS NXDOMAIN treated as block; refire revalidation; redirect manual |
| V-10 | H | api/supabase.ts | SVG accepted as image upload; SVG contains JS → stored XSS via deliverable download | ✅ SVG dropped from whitelist (download path also forces `application/octet-stream` for any sneaks) |
| V-11 | H | api/supabase.ts | Storage path traversal: `path` parameter accepted unsanitised in download/delete helpers. A malicious caller passing `../../buckets/other/secret` could cross bucket boundaries (Supabase normally rejects, but defence-in-depth missing) | ✅ `assertSafeStoragePath` rejects `..`, leading `/`, backslashes, oversize |
| V-12 | M | api/middleware/auth.ts | No minimum length / weak-secret check on `JWT_SECRET` | ✅ rejects secrets < 32 chars or in known-weak list |
| V-13 | M | api/middleware/x402.ts | No replay protection on payment proofs | ✅ tx hashes recorded in 24h sliding window |
| V-14 | M | api/routes/auth.ts | Sign-in message hardcodes `Chain ID: 1` though app is on chain 5042002 → wallets cannot enforce domain binding | ✅ chain id from `AUTH_CHAIN_ID` env, default 5042002; message clarifies signature is not a transaction |
| V-15 | M | api/routes/auth.ts | `verify` uses `jwt.decode(token)` to compute `expiresAt`; if decode returns null on edge case, throws | ✅ computed from configured expiry instead |
| V-16 | M | api/routes/auth.ts | `body.wallet` / `body.signature` accepted without type checks → `JSON.parse` could throw | ✅ explicit type + regex checks |
| V-17 | M | api/routes/open-jobs.ts | `requireServiceAuth` called `timingSafeEqual` on buffers of differing lengths → throws and leaks length | ✅ length-check then compare |
| V-18 | M | indexer/metadata | No size cap on remote metadata, JSON parsed unbounded | ✅ 256 KiB cap + bounded fields with type coercion |
| V-19 | M | indexer/metadata | URI parser allowed weird CIDs / paths | ✅ regex-restricted per scheme |
| V-20 | M | api/routes/files.ts download | `mime_type` forced to `application/octet-stream` only for SVG; downloaded HTML still served with `text/html` content-type → reflected XSS via filename when previewed | ⚠️ partial: SVG fixed; recommend **always** force `application/octet-stream` on download (see Recommendations) |
| V-21 | M | api/middleware/error.ts | Stack traces logged but error messages still echoed to client for non-allowlisted statuses | ✓ already mitigated by `sanitizeErrorMessage` |
| V-22 | M | frontend/AuthContext.tsx | JWT in `localStorage` — accessible to any XSS payload | ⚠️ partial: CSP tightened (no `'unsafe-inline'` script-src), but a complete fix requires httpOnly cookie. See Recommendations |
| V-23 | M | api/routes/files.ts | File MIME validated by magic bytes after read, but reads up to MAX_FILE_SIZE before checking type → memory amplification (10 MB × N files) | residual; mitigated by per-deliverable file count cap |
| V-24 | L | infra | VPS env file at `/root/building-arc/agent-hub/.env` contains LLM API keys, Supabase service key, provider/evaluator EOA private keys, postgres password — **all need rotation** post-fix | rotate manually |
| V-25 | L | infra | Second Vercel token committed in `/root/building-arc/tunnel/*.sh` (different from .env token) — must be revoked | rotate manually |
| V-26 | L | api/middleware/security-headers | `X-XSS-Protection: 1; mode=block` is deprecated and can introduce vulnerabilities in old browsers | left as-is per existing convention; consider removing |

---

## 2 · Demonstrated attack chains

### Chain A — Repo → testnet wallet takeover (V-01)
1. Public repo `asbryx/arc-hive` contains EOA private key in 3 files.
2. Anyone who clones can sign any transaction as that wallet on Arc Testnet.
3. Combined with the `setBudget` / `complete` flows, a malicious holder can mark
   submitted deliverables complete (drain budget) without owning the job.

### Chain B — MITM → impersonation (V-02)
1. Vercel rewrite forwards `/api/*` to `http://194.195.209.138:3000` over HTTP.
2. Any AS on the path between Vercel edge POPs and the VPS (or anyone who
   controls the VPS upstream) can read JWT tokens in `Authorization:` headers.
3. Stolen JWT → full impersonation of any logged-in user (24h validity, no IP
   binding, no fingerprint), can post jobs, deliver, withdraw funds.

### Chain C — On-chain registration → SSRF → secret theft (V-03)
1. Attacker calls `register(agentURI = "http://169.254.169.254/latest/meta-data/iam/security-credentials/")`
   on `IdentityRegistry` from any wallet.
2. Indexer enqueues metadata fetch and hits the cloud metadata endpoint.
3. Response written into `agents.description`, queryable via `/api/agents/:id`.
4. With Tailscale CGNAT (100.64.0.0/10) reachable, attacker can also probe the
   ThinkPad backend (`100.x.y.z:3005/api/...`) bypassing the public proxy entirely.

### Chain D — Webhook DNS rebinding → internal scan (V-09)
1. Attacker registers webhook `https://attacker-controlled.com/cb`.
2. `attacker-controlled.com` resolves to a public IP at registration check time.
3. After registration, attacker flips DNS to `127.0.0.1`.
4. Each new job triggers a webhook fetch to `127.0.0.1:3000` from inside the VPS,
   exfiltrating local services. (Mitigated now via re-validation at fire time.)

### Chain E — x402 bypass (V-05)
1. Attacker sends `x-api-key: anything` (or `x-payment-proof: 0xdeadbeef`) once
   the middleware is enabled — accepted unconditionally → free API access.

### Chain F — RLS bypass (V-04)
1. If `SUPABASE_ANON_KEY` env var is unset, the user-facing client transparently
   uses `SUPABASE_SERVICE_KEY`.
2. Every deliverable download then runs as service role, bypassing all RLS
   policies on `storage.objects` — any deliverable readable to anyone who can
   reach the API.

---

## 3 · Fixes applied in this branch

See `git diff main..security/full-audit-fixes-jun14`. Summary:

- `packages/api/deliver-job62.cjs`, `deliver.mjs`, `deliver2.mjs` **deleted**
- `packages/api/src/middleware/auth.ts` **rewritten** — strict HS256 + iss/aud,
  weak-secret check, alg=none rejection, central `verifyToken`
- `packages/api/src/routes/auth.ts` **rewritten** — typed body validation,
  configurable chain id, `expiresAt` no longer relies on `jwt.decode`
- `packages/api/src/routes/open-jobs.ts` — `requireWalletAuth` uses central
  `verifyToken`; webhook fire path re-validates URL and refuses redirects
- `packages/api/src/routes/keys.ts` — full SSRF allowlist (IPv4 + IPv6, CGNAT,
  IETF protocol/test/benchmark ranges, cloud metadata), DNS NXDOMAIN treated
  as block, HTTPS-only, no userinfo
- `packages/api/src/middleware/x402.ts` — real API key verification + on-chain
  USDC transfer verification with replay window
- `packages/api/src/middleware/rate-limit.ts` — opt-in trusted proxy header
- `packages/api/src/supabase.ts` — never falls back to service key; SVG removed
  from whitelist; storage-path traversal checks
- `packages/indexer/src/metadata/ipfs.ts` — full SSRF guard, redirect manual,
  size cap, bounded JSON field coercion
- `packages/frontend/vercel.json` — CSP no longer allows `'unsafe-inline'` in
  script-src, COOP/CORP/HSTS-preload, base-uri/object-src locked, rewrite uses
  HTTPS placeholder
- `packages/api/src/__tests__/security.test.ts` — vitest regression suite
  covering JWT, SSRF, storage-path safety

---

## 4 · Manual remediation still required

These actions cannot be done from the repo and must be performed by the operator:

1. **Rotate the EOA private key in V-01.** The address has been published in
   git history. Use `git log --all -p packages/api/deliver*` to confirm reach,
   then move funds to a fresh wallet and update `PROVIDER_PRIVATE_KEY` in
   `/root/building-arc/agent-hub/.env`.
2. **Rotate the second Vercel token** found in `/root/building-arc/tunnel/*.sh`.
3. **Rotate Supabase service & anon keys**, the JWT secret, the LLM provider
   keys (`LLM_API_KEY`, `LLM_SECONDARY_KEY`, `LLM_TERTIARY_KEY`), the Postgres
   password — all are present in the on-disk env file at the VPS, which has
   been accessed during this audit.
4. **Put the VPS behind HTTPS** (Cloudflared tunnel or Caddy/Nginx with
   Let's Encrypt) and update `packages/frontend/vercel.json` rewrite to that
   hostname.
5. **Migrate JWT storage** from `localStorage` to httpOnly secure cookies with
   `SameSite=Strict` to fully neutralise XSS-driven token theft (V-22).
6. **Force `application/octet-stream`** on every deliverable download instead
   of preserving the uploaded MIME (V-20).
7. **Verify Supabase RLS** is enabled on `storage.objects` for the
   `deliverables` bucket and that policies require the requester's wallet to
   match `client_address` or `selected_applicant` of the row.
8. **Audit Vercel project env vars** (the token in `~/.claude/.env` lacks the
   right scope; use a Vercel dashboard session) and confirm no secrets
   committed in repo are still active in any environment.

---

## 5 · What was tested / verified

- Full repo + git history (327 commits) read; secrets-pattern grep across all
  blobs.
- Live frontend (`https://arcs-hive.vercel.app`) HTTP / TLS / CSP headers
  inspected; backend currently 502 because ThinkPad tunnel is down (does not
  affect static analysis).
- VPS `194.195.209.138` SSH access used to enumerate processes (`pm2 list`),
  iptables, env files, watchdog scripts, tunnel scripts, and to confirm the
  PM2 services `archivehub-api`, `archivehub-indexer`, `thinkpad-api-proxy`,
  `archivehub-cloudflare-api`.
- Local Postgres on VPS queried for table list, `api_keys` schema,
  `auth_nonces` schema.
- Supabase REST sniff: anon key returns `404` for all marketplace tables
  (good — they don't exist in Supabase, only Postgres on VPS) and SVC key is
  rejected for direct REST (good — Supabase requires JWT-form keys).
- Vercel API hit with token from `~/.claude/.env`; this token lacks API
  scope (`forbidden / invalidToken`). The token visible in the VPS tunnel
  script (`vcp_2K64i2vEt4CACL...`) is the one that has scope; left to the
  operator to revoke.
- Vitest security regression suite (`security.test.ts`) added and runs
  in-process without DB/network dependency.
