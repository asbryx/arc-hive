# `packages/frontend/vercel.json` — Operator Notes

Vercel's `vercel.json` schema rejects unknown properties (including underscore-prefixed comment keys), so context that used to live inline in the JSON file is captured here.

## SEC-060 — API rewrite destination

`rewrites[].destination` for `/api/(.*)` currently points at the cloudflared **quick tunnel** running on the VPS (PM2 process `archivehub-cloudflare-api`):

```
https://retired-informational-existing-fighting.trycloudflare.com
```

The tunnel terminates TLS at Cloudflare's edge and forwards plaintext to `127.0.0.1:3000` on the VPS, which is the right shape for SEC-060 (no JWT-over-plain-HTTP across the public internet).

### ⚠️ This URL is unstable

`pm2 show archivehub-cloudflare-api` runs:

```
cloudflared tunnel --url http://localhost:3000
```

That's a **quick tunnel**, which means a new random subdomain is allocated **every time the process restarts** (current restart count is in the hundreds). When that happens, the value in this file goes stale and the frontend stops being able to reach the API — exactly the failure mode that brought us here.

**Until a stable hostname is wired up, every PM2 restart of the cloudflared process requires:**

1. SSH the VPS, run `pm2 logs archivehub-cloudflare-api --lines 200 --nostream | grep -oE "https://[a-z0-9-]+\.trycloudflare\.com" | tail -1` to get the new URL.
2. Update `rewrites[].destination` here.
3. Push and let Vercel redeploy.

### Proper fix (pending)

Migrate to a **named cloudflared tunnel** with a stable hostname. Requires a Cloudflare-managed domain (free tier is fine):

1. `cloudflared login` — generates `~/.cloudflared/cert.pem` for a domain you own
2. `cloudflared tunnel create archive-api` — gets a stable UUID + credentials JSON
3. `cloudflared tunnel route dns archive-api api.<your-domain>` — DNS record
4. Update PM2 ecosystem to run `cloudflared tunnel run archive-api` instead of `--url`
5. Set the destination here to `https://api.<your-domain>` permanently

**Why the previous placeholder was rejected:** an earlier version of this file rewrote to `http://194.195.209.138` (plain HTTP, Vercel-edge → VPS). That leaked JWTs and signed messages on the wire. Don't revert to that. Use the tunnel.

## Crons

This frontend deployment is a **static Vite SPA — no serverless functions**. Cron jobs (e.g. file cleanup) live in `packages/api/vercel.json`, where the `/api/files/cleanup` Hono route is actually deployed. **Do not duplicate the `crons` block here** — Vercel rejects deploys when a cron path does not resolve to a function on the same project.

## CSP

The `Content-Security-Policy` allows `style-src 'self' 'unsafe-inline'` because Vite's build inlines critical CSS. If this is removed in a future build pipeline, tighten the directive.

`script-src 'self'` is strict — no `'unsafe-inline'`, no `'unsafe-eval'`. Wallet-connect and walletconnect-related JS run from `'self'` after Vite's bundler has emitted them. RainbowKit/wagmi must not introduce inline `<script>` tags or new origins without updating the CSP here.
