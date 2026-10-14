# Deployment Guide — Vercel + Neon + Cloudflare

> See `08-INFRA-SETUP-CHECKLIST.md` for the authoritative, step-by-step setup checklist.
> This file is the operating procedure; `08` is the source of truth for infrastructure choices.

## Overview
```
GitHub repo ──▶ Vercel (Next.js: UI + serverless API routes)
                  ├── Neon PostgreSQL   (pooled DATABASE_URL; direct DIRECT_URL for migrations)
                  ├── Neon Auth         (Managed Better Auth)
                  └── Cloudflare R2     (private buckets, presigned PUT/GET)
Cloudflare DNS: build.harishspace.in ──▶ Vercel (DNS-only)
```
No Railway, Oracle VM, Cloudflare Tunnel, Docker Compose, Supabase, or public image domain.

## 1. Local development
```bash
npm install
cp .env.example .env         # fill in Neon + Neon Auth + R2 values (never commit)
npx prisma migrate dev       # or `prisma db push` during early prototyping
npm run dev
```
- Local origin is `http://localhost:3000`. Neon Auth must allow `http://localhost:3000`; R2 CORS must
  allow it for PUT.
- Prefer a dedicated Neon **dev branch** for local work so dev/preview never touch production data.

## 2. Databases and migrations
- Runtime uses the **pooled** `DATABASE_URL`; Prisma migrations use `DIRECT_URL` (`directUrl`).
- Production changes are applied as reviewed migrations: **`prisma migrate deploy`** (not `db push`),
  in a controlled release, **with a backup taken first**.
- Never run migrations from application request handlers.
- Keep application migrations out of the provider-managed `neon_auth` schema.

```bash
npx prisma migrate deploy    # production / CI
```

## 3. Vercel project
- Import the GitHub repo as a Next.js project (Hobby plan, personal/non-commercial).
- Region: choose a Vercel execution region close to the Neon database region.
- Environment variable scopes (set **separately** per scope):

| Variable | Development | Preview | Production |
|---|---|---|---|
| `DATABASE_URL` | dev branch (pooled) | preview branch | prod branch (pooled) |
| `DIRECT_URL` | dev branch (direct) | preview branch | prod branch (direct) |
| `NEON_AUTH_BASE_URL` | dev Auth URL | preview Auth URL | prod Auth URL |
| `NEON_AUTH_COOKIE_SECRET` | own secret | own secret | own secret |
| `APP_URL` / `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | preview URL | `https://build.harishspace.in` |
| `R2_ACCOUNT_ID`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_REGION` | dev bucket | preview bucket | `construction-ledger-prod` |
| `MAINTENANCE_SECRET` | own secret | own secret | own secret |

- Never give preview builds production DB/Auth/R2 credentials by default.
- `NEXT_PUBLIC_*` values are browser-visible and embedded at build time — never put secrets there.
- Redeploy after changing variables that are read at build time.

> **Build vs runtime:** the build does **not** require secrets — the Neon Auth client is initialized
> lazily at request time (`src/lib/auth/server.ts`), so `next build` succeeds even when `NEON_AUTH_*`
> is unset. The **deployed runtime** still needs `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`,
> `DIRECT_URL` and the `R2_*` values, or auth/upload routes will error. Node is pinned to `22.x`.

### If the Neon integration used a prefix (`construction_*`)
Neon's Vercel integration can inject variables with a prefix; the app expects **unprefixed** names.
Cleanest is to reconnect Neon without a prefix. Otherwise, in Vercel → Environment Variables:

**Rename (keep value, change key):**
- `construction_DATABASE_URL` → `DATABASE_URL`
- `construction_DATABASE_URL_UNPOOLED` → `DIRECT_URL`
- `construction_NEON_AUTH_BASE_URL` → `NEON_AUTH_BASE_URL`

**Delete (unused by the app):** `construction_POSTGRES_USER`, `construction_POSTGRES_PASSWORD`,
`construction_POSTGRES_HOST`, `construction_POSTGRES_DATABASE`, `construction_POSTGRES_URL`,
`construction_POSTGRES_URL_NON_POOLING`, `construction_POSTGRES_URL_NO_SSL`,
`construction_POSTGRES_PRISMA_URL`, `construction_PGHOST`, `construction_PGHOST_UNPOOLED`,
`construction_PGUSER`, `construction_PGPASSWORD`, `construction_PGDATABASE`,
`construction_VITE_NEON_AUTH_URL`, `construction_NEON_PROJECT_ID`.

**Add (missing):** `NEON_AUTH_COOKIE_SECRET` (`openssl rand -base64 32`), `R2_ACCOUNT_ID`,
`R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` (`construction-ledger-dev`),
`R2_REGION` (`auto`). Optional: `MAINTENANCE_SECRET` (or `CRON_SECRET`) for the cleanup cron.

## 4. Build & release
1. Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` locally — all must pass.
2. Take a database backup.
3. Apply reviewed migrations (`prisma migrate deploy`).
4. Deploy to Vercel; test the generated `*.vercel.app` domain.
5. Attach the custom domain (below) once verified.

## 5. Custom domain (Cloudflare DNS + Hostinger)
- Domain `harishspace.in` is registered at **Hostinger**; nameservers point to **Cloudflare**.
- Vercel → Settings → Domains → add `build.harishspace.in`; copy Vercel's exact DNS records.
- In Cloudflare DNS, add the required CNAME (and any ownership TXT) as **DNS-only** (grey cloud)
  initially; remove only conflicting records for `build`, never `@`/`www`.
- Wait for Vercel "valid" + HTTPS cert, then verify `https://build.harishspace.in`.
- Then update app URL, Neon Auth allowed origins, and production R2 CORS.
- Preserve existing website/email records; do not enable Flexible SSL.
- **Certs:** every hostname you actually serve needs its own valid cert. If the apex redirects to
  `www` (or vice-versa), the redirect target must be a valid Vercel domain too, or the browser shows
  "not secure". Simplest is to use one hostname (e.g. apex) as primary, or wait for both to show
  **Valid** in Vercel. DNS must point at the values Vercel shows, as **DNS-only** (grey cloud).
- The **Cloudflare Tunnel** (`cloudflared`) from the old Oracle-VM plan is **not used** by Vercel — delete the tunnel and any `*.cfargotunnel.com` DNS record if present. DNS for `harishspace.in` is managed in Cloudflare (nameservers moved there); Hostinger is only the registrar.

## 6. Runtime constraints (serverless)
- No local file storage, daemons, WebSocket servers, or infinite loops.
- Direct-to-R2 uploads keep request payloads small.
- Long jobs (DB exports, orphan cleanup) run outside request handlers via a scheduler.

## 7. Scheduled maintenance
- **Cleanup job**: `GET /api/maintenance/cleanup` reaps stale uploads (never-finalized `pending`, and
  finalized-but-unlinked `ready`, older than 24h), batch-deletes deferred R2 objects, and purges
  idempotency keys older than 7 days. It is wired as a **daily Vercel Cron** in `vercel.json`
  (`0 3 * * *`). It authenticates with a shared secret: set `MAINTENANCE_SECRET`, or rely on Vercel
  Cron's `CRON_SECRET` (Vercel sends `Authorization: Bearer $CRON_SECRET`). With neither set, the
  endpoint denies (401). If the Hobby cron/runtime limits don't fit, call it from an external scheduler.
- **Backups**: `npm run db:backup` dumps the `public` schema, encrypts it, and uploads to R2
  (`backups/`); `npm run db:restore -- --key … --target … --yes` restores. Suggest 7 daily + 4 weekly
  copies in a separate private bucket and an independent copy; test a restore into an isolated DB before
  launch. Business-table dumps do **not** restore Neon Auth config. See `10-OPERATIONS.md`.

## 8. Monitoring
- Watch Neon compute/storage/transfer, R2 storage/operations, and Vercel function usage/quotas.
- Expect Neon wake-up latency after idle; do not keep it awake with heartbeats.
- Health endpoint (`GET /api/health`) exposes no secrets or private data.
- **Security headers** (CSP, HSTS in production, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy`, `Permissions-Policy`) are set in `next.config.mjs` `headers()`. The CSP allows
  `connect-src`/`img-src` to the R2 S3 endpoint (browser uploads/downloads).

## 9. Rollback
- Vercel: promote a previous deployment (instant). Database changes are forward-only — apply a new
  migration to reverse, or restore from backup for data loss.
