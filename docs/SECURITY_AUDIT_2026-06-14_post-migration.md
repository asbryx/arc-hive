# Security & Backend Audit — Post Tailscale Migration

**Date:** 2026-06-14
**Scope:** Everything after PRs #5–#8 merged + migration from VPS-cloudflared to ThinkPad-Funnel.
**Live state at audit time:** https://arcs-hive.vercel.app (200), API at https://archive-wsl.tail5a7075.ts.net (200), 333k+ agents indexed.

---

## TL;DR

Three CRITICAL issues found — all fixed in this PR. The pre-existing security posture (JWT, SSRF, IDOR, file upload validation, rate limit) is genuinely solid; the issues were architectural drift from the migration plus a misordered middleware that pre-dated everything.

| ID | Severity | Issue | Status |
|---|---|---|---|
| C-1 | CRITICAL | Global `bodyLimit(100KB)` blocks file uploads (route enforces 10MB but never reached) | Fixed |
| C-2 | CRITICAL | Vercel CSP `connect-src` does not list new API host → browsers block fetches | Fixed |
| C-3 | CRITICAL | Vercel rewrite still points at dead quick-tunnel URL — any `/api/...` relative call 404s | Fixed |
| H-1 | HIGH | JWT stored in `localStorage` — readable from any XSS | Documented; refactor TBD |
| H-2 | HIGH | API listens on `0.0.0.0:3000` (LAN-exposed) inside WSL | Documented; harden TBD |
| M-1 | MEDIUM | `react-router` open-redirect (CVE-2025-XXX) — moderate via pnpm audit | Documented |
| M-2 | MEDIUM | No CORS-allowed origin scoping for future Tailscale URLs | Mitigated by CSP |
| L-1 | LOW | JWT rotation has no warn-log when previous-secret matches | Documented |
| L-2 | LOW | `agents.metadata_uri` length not capped at DB level | Documented |
| L-3 | LOW | Indexer `:3001` and Postgres `:5432` are 127.0.0.1-only ✅ confirmed | OK |

---

## CRITICAL — fixed in this PR

### C-1. Global `bodyLimit({ maxSize: 100 * 1024 })` blocks file uploads

**File:** `packages/api/src/index.ts:28`

```ts
app.use('*', bodyLimit({ maxSize: 100 * 1024 })) // ← applied to /api/open-jobs/:id/deliver too
```

The body-limit middleware is registered with `app.use('*', ...)` — it runs **before** the file-upload route in `packages/api/src/routes/files.ts`. The file-upload route declares `MAX_FILE_SIZE = 10 * 1024 * 1024` (10MB per file) and accepts up to 10 files — but the global 100KB cap rejects any request above that **before the route ever runs**.

**PoC:**
```bash
$ dd if=/dev/zero bs=1024 count=200 | curl -X POST \
    --data-binary @- \
    https://archive-wsl.tail5a7075.ts.net/api/open-jobs/999999999/deliver
{"error":"Request failed","status":413}
```

**Impact:** every file deliverable submission in production has been silently failing if the body exceeds 100KB. Looking at the migration history (012, 022 reference deliverable files extensively), this has likely been broken for the full lifetime of the file-upload feature.

**Fix in this PR:** apply the 100KB cap to non-file routes only; raise to ~110MB (10 files × 10MB + multipart overhead) for the file-upload deliver route. The 10MB-per-file + 10-files-per-deliverable enforcement inside `files.ts` is unchanged.

### C-2. Vercel CSP `connect-src` does not list the new API host

**File:** `packages/frontend/vercel.json` (pre-PR)

```
connect-src 'self' https://rpc.testnet.arc.network wss: wss://*.walletconnect.com https://*.walletconnect.com
```

The SPA was migrated to `VITE_API_URL=https://archive-wsl.tail5a7075.ts.net/api` and now fetches the API at a host that **isn't in the `connect-src` allowlist**. Browsers that enforce CSP (all modern browsers do) will block these fetches.

**Why it's not visibly broken yet:** the Vercel deployment cache may be serving an older HTML response in some cases, and curl/Postman ignore CSP. End-users opening the SPA in Chrome/Firefox/Safari right now should see a blank UI + "Refused to connect to '...': it violates the following CSP directive" in their console.

**Fix in this PR:** added `https://*.ts.net` and the specific Funnel host to `connect-src`. The wildcard means future Tailscale Funnel hostname changes work without another deploy.

### C-3. Vercel rewrite still points at a dead host

**File:** `packages/frontend/vercel.json` (pre-PR)

```
"destination": "https://retired-informational-existing-fighting.trycloudflare.com/api/$1"
```

That cloudflared quick-tunnel URL died when the migration completed (the underlying `archivehub-cloudflare-api` PM2 process was deleted on the VPS). Any code path in the SPA that still uses a relative `/api/...` URL (instead of `${API_BASE}${path}`) will hit Vercel's rewrite, which proxies to a dead host = 530/timeout.

**Fix in this PR:** rewrite now points at the same Tailscale Funnel URL as `VITE_API_URL`.

---

## HIGH — documented, not shipped in this PR (require refactor)

### H-1. JWT in `localStorage`

**File:** `packages/frontend/src/contexts/AuthContext.tsx:37,109,124`

```ts
localStorage.setItem('arc-hive-auth', JSON.stringify({ token, ... }))
```

Any XSS on the SPA can read `localStorage.getItem('arc-hive-auth')` and exfiltrate the JWT. The token is then valid for 24h and lets the attacker impersonate the user against the API.

**Mitigation in place:**
- CSP is strict (`script-src 'self'`, no `unsafe-inline`, no `unsafe-eval`)
- Vite builds bundles from `'self'` only
- RainbowKit / wagmi do not inject inline scripts

So XSS is hard to land. But the impact if it does land is severe (24-hour wallet-level impersonation).

**Proper fix (separate PR):**
1. Set the JWT as an `HttpOnly; Secure; SameSite=Lax; Path=/api` cookie from `/api/auth/verify` instead of returning it in JSON.
2. SPA reads only the wallet address from the response (not the token).
3. Browsers send the cookie automatically on `fetch(..., { credentials: 'include' })`.
4. API needs to support cookie-based auth in `middleware/auth.ts` (currently only Bearer header).

### H-2. API listens on `0.0.0.0:3000`

**File:** `packages/api/src/index.ts:130`

```ts
const hostname = process.env.API_HOST || '0.0.0.0'
```

Inside WSL on ThinkPad, this exposes the API to **any host that can route to the WSL2 IP** — including the Windows host (always) and the LAN (if WSL2 mirrored networking is enabled). Tailscale Funnel routes through `127.0.0.1:3000` so the public path is unchanged; this is about defense-in-depth.

**Mitigation:** set `API_HOST=127.0.0.1` in `/home/asbryx/building-arc/agent-hub/.env` and PM2-restart the API. Tailscale Funnel still works (it lives on the same machine). LAN/Windows-host bypass closed.

---

## MEDIUM

### M-1. `react-router` open-redirect advisory

`pnpm audit --prod` reports:

```
moderate  react-router  Same-origin redirect with path starting `//` causes open
                       redirect via protocol-relative URL reinterpretation
```

**Fix:** bump `react-router-dom` in `packages/frontend/package.json` to a version that resolves `react-router` ≥ the patched version. Audit the SPA for any user-supplied path passed to `<Navigate>`, `useNavigate()`, or `redirect()` without a leading-`/` validation.

### M-2. No CORS-allowed origin scoping for future Tailscale URLs

`packages/api/src/index.ts:31-44` allows `https://arcs-hive.vercel.app`, `https://archive-kappa-weld.vercel.app`, plus an optional env-supplied origin. That's fine today, but if the SPA is ever moved to a different Vercel project the list will need an update. Not a vulnerability now.

---

## VERIFIED (claimed fixes confirmed present)

| Claim from prior commits | Verified |
|---|---|
| SEC-001 weak-JWT-secret rejection | ✅ `auth.ts:14-24` |
| SEC-002 alg=none dual-layer rejection | ✅ `auth.ts:38-49` (header inspection + `algorithms:['HS256']`) |
| SEC-005 timing-safe service-key compare | ✅ `open-jobs.ts:8-17` (length pre-check + timingSafeEqual) |
| SEC-006 JWT iss/aud verification | ✅ `auth.ts:35-36` |
| SEC-012 storage path safety / SVG XSS | ✅ `files.ts:327` SVG MIME override + `nosniff` |
| SEC-014 SIWE-style auth message bound to chain | ✅ `auth.ts:14-27` |
| SEC-020..22 SSRF guard (loopback, RFC1918, link-local, CGNAT, cloud-metadata) | ✅ `metadata/ipfs.ts:11-32, 35-58` |
| SEC-030..35 metadata fetch hardening (timeout, redirect:manual, size cap, output bounding) | ✅ `metadata/ipfs.ts:90-130` |
| SEC-040 prompt-injection detection in evaluator | ✅ `evaluator/prompt.ts:8` (rule exists; depth not assessed in this pass) |
| SEC-050..51 rate-limit proxy-trust model | ✅ `rate-limit.ts:24-45` |
| IDOR fix on 8 dashboard endpoints (`my-applications`, `my-active`, etc.) | ✅ each calls `requireWalletAuth(c, address)` |
| Postgres bound to 127.0.0.1 only | ✅ `ss -tlnp` confirms `127.0.0.1:5432` |
| Indexer health bound to 127.0.0.1 only | ✅ `ss -tlnp` confirms `127.0.0.1:3001` |
| Tailscale Funnel exposes only the API | ✅ `tailscale serve status` shows only `/ → :3000` |
| API random 32-byte nonce + atomic check-and-set on `used` | ✅ `auth.ts:30-32, 86+` |
| Per-wallet nonce-rate-limit (5/min) with TTL cleanup | ✅ `auth.ts:36-45` |
| Wallet format validated `/^0x[0-9a-fA-F]{40}$/` before use | ✅ `auth.ts:51` |
| SQL queries parameterized (no `${user}` interpolation in templates) | ✅ `${where}` patterns confirmed safe (built from `$N` placeholders only) |
| File upload MIME from magic bytes (not client header) | ✅ `files.ts:130` `fileTypeFromBuffer` |
| File upload MIME allow-list | ✅ `files.ts:12-31` |
| SVG content-type override to prevent stored XSS | ✅ `files.ts:327` |
| CORS scoped to specific origins (not wildcard) | ✅ `index.ts:31-44` |
| Body size global cap (DoS guard) | ⚠️ Was 100KB everywhere — broke uploads (C-1); now scoped |
| pg pool not leaking | ✅ singleton in `db.ts` |
| No hardcoded secrets in source | ✅ grep clean (excl. `.env.example`, tests) |
| Smart-contract write keys (`PROVIDER_PRIVATE_KEY`, `EVALUATOR_PRIVATE_KEY`) loaded from env only | ✅ `evaluator/config.ts`, `open-jobs.ts:30` |

---

## Architecture exposure inventory (post-migration)

| Surface | Listener | Reachability | Auth |
|---|---|---|---|
| Vercel SPA | edge | Public, anyone | None (static) |
| ThinkPad WSL `:3000` (API) | `0.0.0.0` | Tailscale Funnel + WSL host + LAN | JWT for writes; public reads |
| ThinkPad WSL `:3001` (indexer health) | `127.0.0.1` | WSL-internal only | None (local) |
| ThinkPad WSL `:5432` (Postgres) | `127.0.0.1` | WSL-internal only | None (local; trust) |
| ThinkPad WSL `:22` (sshd) | `0.0.0.0` | Via WSL host + Tailscale-SSH | publickey only |
| VPS | (no arc-hive surface) | — | — |
| Tailnet (3 nodes) | various | Tailnet-only | Tailscale auth |

**Single point of failure:** ThinkPad host. If ThinkPad sleeps / loses power / loses internet → site goes down. Mitigations to consider:
- ThinkPad lid → "do nothing"
- UPS for ThinkPad
- Cloudflare cache layer in front of read-only API endpoints

---

## Outstanding follow-ups (not shipped tonight)

In rough priority:

1. **JWT to HttpOnly cookie** (H-1). Refactor AuthContext + auth middleware.
2. **`API_HOST=127.0.0.1`** in `/home/asbryx/building-arc/agent-hub/.env` (H-2). One-line change + PM2 restart.
3. **Bump `react-router-dom`** (M-1). Single dependency update.
4. **DB-layer length CHECK** on `agents.metadata_uri` etc. (L-2). Defense-in-depth.
5. **JWT rotation logging** — warn-log when a previous secret matches (L-1).
6. **Backup Postgres** — `pg_dump` cron of `archivehub` and `archiveagents` to remote storage (S3/Backblaze/etc.).
7. **Cloudflare cache** for `/api/stats`, `/api/agents` (read-only) — would reduce ThinkPad load by ~10x.
