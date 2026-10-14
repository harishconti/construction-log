---
name: release
description: Ship Construction Ledger to production — backup, apply Prisma migrations, deploy to Vercel, verify. Use when releasing, deploying, applying migrations to prod, or taking/restoring a database backup.
---

# Release runbook

Full runbook: `docs/10-OPERATIONS.md`. Infra: `docs/08-INFRA-SETUP-CHECKLIST.md`. Every step here
touches production — confirm with the user before running anything that writes to prod.

## 1. Pre-flight (local)
```bash
git switch develop && git pull
npm ci && npx prisma generate
npm run lint && npm run typecheck && npm test && npm run build
npx prisma migrate status          # lists migrations not yet applied to DIRECT_URL's DB
```
Confirm which Neon branch `DIRECT_URL` points at before continuing.

## 2. Backup (only needed if there are pending migrations or risky data changes)
```bash
npm run db:backup
```
Dumps the `public` schema only (not `neon_auth`), AES-256 encrypts with `BACKUP_PASSPHRASE`,
uploads to `BACKUP_BUCKET` (or `R2_BUCKET`/`backups/`), prunes past `BACKUP_RETENTION_DAYS`.
Needs `pg_dump` matching the server major version — the script falls back to Docker `postgres:<major>`.

## 3. Migrate
```bash
npm run prisma:deploy              # prisma migrate deploy against DIRECT_URL
```
Forward-only. To undo a schema change, write a new migration; for data loss, restore (§6).

## 4. Deploy
Vercel builds `prisma generate && next build` on Node 22. The repo only has `develop` (no `main`);
check Vercel → Settings → Git for which branch is Production before assuming a merge deploys. Env vars are per-scope in Vercel — preview must
never get production credentials. The daily cron (`vercel.json`) calls `/api/maintenance/cleanup`
with `CRON_SECRET`/`MAINTENANCE_SECRET`.

## 5. Verify
- `curl -s https://build.harishspace.in/api/health` → 200 (503 means the DB is unreachable).
- Sign in, open a project, add + edit + delete an expense with a photo (exercises R2 CORS + finalize).
- Rollback code: promote the previous deployment in Vercel.

## 6. Restore (destructive)
```bash
npm run db:restore -- --key backups/<file>.dump.enc --target "<DIRECT_URL of target>" --yes
```
Runs `pg_restore --clean --if-exists` and verifies SHA-256. Restore into a throwaway Neon branch first.
Does **not** restore Neon Auth users/config.
