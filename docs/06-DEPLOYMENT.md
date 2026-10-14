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

## 6. Runtime constraints (serverless)
- No local file storage, daemons, WebSocket servers, or infinite loops.
- Direct-to-R2 uploads keep request payloads small.
- Long jobs (DB exports, orphan cleanup) run outside request handlers via a scheduler.

## 7. Scheduled maintenance
- **Cleanup job**: `GET /api/maintenance/cleanup` reaps `pending` uploads older than 24h and retries
  deferred R2 object deletions. It is wired as a **daily Vercel Cron** in `vercel.json`
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
- Health endpoint must expose no secrets or private data.

## 9. Rollback
- Vercel: promote a previous deployment (instant). Database changes are forward-only — apply a new
  migration to reverse, or restore from backup for data loss.
