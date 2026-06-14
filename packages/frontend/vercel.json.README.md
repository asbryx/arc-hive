# `packages/frontend/vercel.json` — Operator Notes

Vercel's `vercel.json` schema rejects unknown properties (including underscore-prefixed comment keys), so context that used to live inline in the JSON file is captured here.

## API rewrite destination

`rewrites[].destination` for `/api/(.*)` currently points at the **Tailscale Funnel** running on the ThinkPad WSL host:

```
https://archive-wsl.tail5a7075.ts.net
```

This is the public face of `archivehub-api-thinkpad` (PM2 on `127.0.0.1:3000` inside WSL). Tailscale terminates TLS at the edge and forwards over the tailnet, so no JWT-on-plain-HTTP risk on the public internet.

### Note on the actual fetch path

The SPA bundles `VITE_API_URL=https://archive-wsl.tail5a7075.ts.net/api` at build time and calls the API directly via that absolute URL — see `packages/frontend/src/api/client.ts` and friends. The Vercel `/api/*` rewrite above is therefore **redundant for the SPA's normal traffic**, but it's kept for safety: any code path that uses a relative `/api/...` URL still resolves correctly instead of 404'ing on Vercel.

The CSP `connect-src` (above) explicitly lists `https://*.ts.net` and the specific Funnel host so the browser allows the fetches.

### History

- **2026-06-13** Initial deploy used `http://194.195.209.138` (VPS plain HTTP). Rejected — JWTs leak on the wire. Replaced with a placeholder.
- **2026-06-13 → 06-14** Placeholder `https://api.arcs-hive.example.com` blocked all Vercel deploys (PR #5 fixed). Was replaced briefly with a cloudflared **quick tunnel** URL (`*.trycloudflare.com`), which churned every PM2 restart and required a watchdog script — too unstable.
- **2026-06-14 (now)** Migrated to ThinkPad-WSL + Tailscale Funnel — stable URL, no churn, no VPS dependency. See `docs/MIGRATION_2026-06-14.md` for the full move.

### Future: when a domain is purchased

Migrate to a **named cloudflared tunnel** with a custom hostname:

1. `cloudflared login` (in WSL) — generates `~/.cloudflared/cert.pem` for the domain.
2. `cloudflared tunnel create archive-api` — stable UUID + credentials.
3. `cloudflared tunnel route dns archive-api api.<your-domain>` — DNS record.
4. Run via PM2 instead of Tailscale Funnel.
5. Update `rewrites[].destination` and CSP `connect-src` here, plus the Vercel env var `VITE_API_URL`.
6. `tailscale funnel reset` to drop the Tailscale-side exposure.

## Crons

This frontend deployment is a **static Vite SPA — no serverless functions**. Cron jobs (e.g. file cleanup) live in `packages/api/vercel.json`, where the `/api/files/cleanup` Hono route is actually deployed. **Do not duplicate the `crons` block here** — Vercel rejects deploys when a cron path does not resolve to a function on the same project.

## CSP

The `Content-Security-Policy` allows `style-src 'self' 'unsafe-inline'` because Vite's build inlines critical CSS. If this is removed in a future build pipeline, tighten the directive.

`script-src 'self'` is strict — no `'unsafe-inline'`, no `'unsafe-eval'`. Wallet-connect and walletconnect-related JS run from `'self'` after Vite's bundler has emitted them. RainbowKit/wagmi must not introduce inline `<script>` tags or new origins without updating the CSP here.

`connect-src` lists every backend origin the SPA fetches:

- `'self'` — the Vercel app itself (rewrites)
- `https://rpc.testnet.arc.network` — Arc Testnet RPC for direct on-chain reads
- `wss:` — generic WebSocket allow (RainbowKit / WalletConnect signaling)
- `wss://*.walletconnect.com`, `https://*.walletconnect.com` — WalletConnect explicit
- `https://*.ts.net` — any Tailscale Funnel host (covers future hostname changes)
- `https://archive-wsl.tail5a7075.ts.net` — current API host (explicit so browsers without wildcard support still work)

When the API moves to a custom domain, **add that domain here** before flipping `VITE_API_URL`, otherwise CSP will block the fetches.
