# `packages/frontend/vercel.json` — Operator Notes

Vercel's `vercel.json` schema rejects unknown properties (including underscore-prefixed comment keys), so context that used to live inline in the JSON file is captured here.

## SEC-060 — API rewrite destination

`rewrites[].destination` for `/api/(.*)` is currently set to **`https://api.arcs-hive.example.com/api/$1`**, a placeholder TLS host.

**Why a placeholder, not the VPS IP:** an earlier version of this file rewrote to `http://194.195.209.138` (plain HTTP). Vercel-edge → VPS plain HTTP leaks JWTs and signed-message bodies on the wire. Do not revert.

**Before re-enabling:**

1. Put the VPS behind a TLS terminator — Cloudflare, a Caddy/Caddy reverse proxy, or a Cloudflared tunnel.
2. Set the resulting HTTPS hostname as the `API_BACKEND_URL_HTTPS` deploy-time variable, or replace the placeholder in this file with the real `https://...` host.
3. Verify the cert chain is valid (Vercel will not skip TLS verification).

## Crons

This frontend deployment is a **static Vite SPA — no serverless functions**. Cron jobs (e.g. file cleanup) live in `packages/api/vercel.json`, where the `/api/files/cleanup` Hono route is actually deployed. **Do not duplicate the `crons` block here** — Vercel rejects deploys when a cron path does not resolve to a function on the same project.

## CSP

The `Content-Security-Policy` allows `style-src 'self' 'unsafe-inline'` because Vite's build inlines critical CSS. If this is removed in a future build pipeline, tighten the directive.

`script-src 'self'` is strict — no `'unsafe-inline'`, no `'unsafe-eval'`. Wallet-connect and walletconnect-related JS run from `'self'` after Vite's bundler has emitted them. RainbowKit/wagmi must not introduce inline `<script>` tags or new origins without updating the CSP here.
