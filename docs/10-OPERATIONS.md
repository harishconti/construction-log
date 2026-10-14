# Operations: Environments, Release, Backups

Operational runbook for Construction Ledger. Infra choices live in `08-INFRA-SETUP-CHECKLIST.md`;
this file covers day‑to‑day operations.

## 1. Environments & Neon branches
| Env | App | Neon | R2 bucket | Origin |
|---|---|---|---|---|
| Local dev | `next dev` | **dev branch** (recommended) | `construction-ledger-dev` | `http://localhost:3000` |
| Preview | Vercel preview | preview/test branch | preview bucket | preview URL |
| Production | Vercel prod | production branch | `construction-ledger-prod` | `https://build.harishspace.in` |

Per-environment variables (set in Vercel scopes — see `06-DEPLOYMENT.md`): `DATABASE_URL`,
`DIRECT_URL`, `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`, `R2_*`, `NEXT_PUBLIC_APP_URL`.

**Create a dev branch** (requires Neon CLI auth, or use the Console → Branches → Create):
```bash
neon login                          # if the session is invalid
neon branches create --name dev     # or: Console → Branches → Create branch
neon env pull --file .env.dev       # get the dev branch's DATABASE_URL/DIRECT_URL/NEON_AUTH_BASE_URL
```
Record which branch each `DATABASE_URL`/Auth URL belongs to. **Never** give preview builds production
credentials. Apply the schema to a new branch with `prisma migrate deploy`.
> Current state: local dev points at the default (production) branch. Move to a `dev` branch before
> storing real records.

## 2. Release process (migrations)
Prisma migrations are forward-only and applied outside request handlers.
```bash
# 1) Take a backup first (§3)
npm run db:backup

# 2) Review + apply to production (uses DIRECT_URL)
npx prisma migrate status
npm run prisma:deploy        # prisma migrate deploy

# 3) Deploy to Vercel (build runs `prisma generate && next build`)
# 4) Verify https://build.harishspace.in
```
**Rollback:** promote the previous Vercel deployment for code. The database is forward-only — write a
new migration to reverse a change, or restore from backup for data loss (§3).

## 3. Backups (verified)
`scripts/db-backup.mjs` — dumps **only the `public` schema** (never the provider-managed `neon_auth`
schema), encrypts with AES‑256‑CBC, and uploads to R2 under `backups/`.

```bash
npm run db:backup            # dump → encrypt → upload → prune
npm run db:restore -- --key backups/<file>.dump.enc --target "$DIRECT_URL" --yes
```
- Requires `pg_dump`/`pg_restore` matching the server major version; the scripts **auto-fall back to
  Docker** (`postgres:<major>`) when the local client is older (e.g. local 16 vs server 18).
- Env: `BACKUP_BUCKET` (prefer a **separate private bucket**; falls back to `R2_BUCKET` under `backups/`),
  `BACKUP_PASSPHRASE` (store in a password manager), `BACKUP_RETENTION_DAYS` (default 30).
- **Restore is destructive** (`--clean --if-exists`) and requires `--yes`. Always test a restore into an
  isolated database first.
- Suggested cadence: **7 daily + 4 weekly** copies, scheduled **outside Vercel** (cron on your machine/VM).
- Keep an independent copy elsewhere; R2 durability is not deletion-proof. A business-table SQL dump
  does **not** restore Neon Auth configuration (users/sessions/settings) — document a separate Auth recovery step.

Verified 14 Oct 2026: backup uploaded; restore into a throwaway Neon database recreated all 13 tables.

## 4. Expanding users (onboarding) — note
Use this if the ledger grows beyond the initial admin:
1. **Sign-up / sign-in**: each person signs in via the login page — email+password, **Continue with Google**,
   or a magic link. To stop open registration, disable sign-up in **Neon Console → Auth → settings** once
   your accounts exist; then create accounts deliberately.
2. **Add to a project**: the project creator is the first **admin**. Members screen → add by email + role.
   If the person already has an account they're added immediately; otherwise a **pending invitation** is
   stored and applied automatically on their first sign-in. Pending invitations can be cancelled.
3. **Roles are per project** (admin/editor/viewer). New sign-ups get **no membership** automatically.
4. **Origins**: add any new app origin to Neon Auth trusted origins **and** to the R2 bucket CORS
   (`PUT, GET, HEAD`, `Content-Type`).
5. **Future self-serve onboarding** would need an invite-by-email flow (mailer + accept-invitation route)
   and possibly an organization model — not built.

## 5. Identity for production
- **Google**: the branch uses **shared Google keys** (dev only). For production, create your own Google
  OAuth app and set it on the branch; add the app origin to the provider's authorized redirect URIs.
- **Email**: Neon's **shared SMTP** (`auth@mail.myneon.app`) is used in dev. Production should use custom
  SMTP for reliable verification/reset delivery.

## 6. Optional hardening (not implemented)
- Malware/AV scan hook on finalize.
- ~~Magic-byte content sniffing~~: done in A3 (`sniffMatches` in `src/lib/files.ts`, checked at finalize).
- Separate restricted runtime vs migration DB credentials.
