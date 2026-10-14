# System Architecture

## High-Level Diagram

```
[Phone / Laptop browser — PWA]
            │ HTTPS
            ▼
[Cloudflare DNS — build.harishspace.in]
            │
            ▼
[Vercel — Next.js UI + serverless API routes]
            │
            ├──▶ [Neon PostgreSQL]        (shared data, pooled connection at runtime)
            ├──▶ [Neon Auth]              (Managed Better Auth: users, sessions)
            └──▶ [Cloudflare R2 — private]◀── presigned direct uploads from browser
```

Cloudflare is the DNS provider only (DNS-only records to Vercel, not a traffic proxy). The domain
is registered at Hostinger; nameservers point to Cloudflare.

## Component Responsibilities

### Vercel (Next.js app, single deployable)
- Serves the responsive UI (web + mobile browser + PWA) and REST API under `/api/*`.
- Proxies Neon Auth at `/api/auth/[...path]`; sessions live in httpOnly cookies.
- Enforces role-based authorization **server-side** on every read/write (session + project membership).
- Issues short-lived R2 presigned PUT/GET URLs; persists attachment metadata only after finalize.
- Computes budget vs actual on read (never stores derived "actual").
- Exposes a secret-protected maintenance endpoint (`/api/maintenance/cleanup`) that reaps stale
  `pending` uploads and retries deferred R2 object deletions; invoked by a daily Vercel Cron.
- **Serverless constraints**: stateless; no local disk persistence, no long-running jobs, no
  WebSocket server. Long jobs (backups, cleanup) run outside the request path.

### Neon PostgreSQL
- Single source of truth for all project data.
- Serverless, scales to zero; expect cold-start/wake latency after idle.
- Runtime uses the **pooled** connection string; migrations use the **direct** (`DIRECT_URL`).
- Application tables live in `public`; Neon Auth owns the `neon_auth` schema (never migrate into it).

### Neon Auth (Managed Better Auth)
- Users, sessions, and auth config live in the `neon_auth` schema, branchable with the DB.
- Fixed managed plugin set; no custom JWT issuance or password storage alongside it.
- Verified user IDs are mirrored into the app's `User` table (keyed by Neon Auth user id) for FK integrity.

### Cloudflare R2
- Stores all images (transaction bills, diary photos) in a **private** bucket (dev: `construction-ledger-dev`, prod: `construction-ledger-prod`).
- Accessed via S3-compatible API with short-lived presigned URLs issued only after membership checks.
- No public image domain; `r2.dev` public access stays disabled.

## Request Flow Examples

### Add Transaction with Photo (direct-to-R2, with finalize)
1. User fills the form on their phone and selects a bill photo.
2. Client calls `POST /api/uploads/presign` with `{projectId, parentType, mimeType, size}`.
3. Server validates session + project membership + role (editor/admin), enforces the MIME/size
   allowlist, and returns a presigned R2 PUT URL + a server-generated project-scoped object key.
4. Client `PUT`s the file directly to R2 with matching `Content-Type` (bytes never pass through Vercel).
5. Client calls the finalize endpoint; the server verifies the object exists and its size/metadata,
   then creates/marks the attachment row `ready` and links it to the transaction.
6. Client calls `POST /api/projects/:id/transactions` with the finalized attachment id(s).
7. Server validates, inserts the transaction, writes the audit log atomically, and returns it.

### View Budget Variance
1. User opens the Dashboard.
2. Client calls `GET /api/projects/:id/budgets?period=2026-10&granularity=month`.
3. Server joins `Budgets` with aggregated `Transactions` (`SUM(amount)` by category + period range).
4. Returns planned, actual, variance per category. Derived "actual" is never cached or stored.

## Data Consistency Guarantees
- One Neon database; all users share it.
- All writes go through Next.js route handlers with server-side validation — never direct DB access from the client.
- Optimistic version checks (`version`/`updatedAt`) prevent silent concurrent overwrites.
- Idempotency keys make create/finalize safe to retry.
- Audit logs and budget revisions are written in the **same transaction** as the mutation (atomic).

## Failure / Recovery
- Vercel outage → app unavailable; data intact in Neon.
- Neon compute suspended on idle → first request pays a wake-up latency (expected; do not heartbeat).
- R2 outage → images unreachable but transaction/diary text still loads (graceful image fallback).
  Deletions that fail are queued in `ObjectDeletion` and retried by the maintenance job.
- Corrupted/deleted data → restore from encrypted DB exports (separate private bucket + independent copy);
  business-table SQL dump alone does not restore Neon Auth config.
