# Implementation Status

Last updated: 14 October 2026 · Stack: Next.js 16 · Prisma · Neon Postgres · Neon Auth · Cloudflare R2 (private) · Vercel.
This document reflects the **actual repository state**. For the target design see 00–08.

## Runtime / stack (as built)
- **Next.js 16.4** (App Router, Turbopack), TypeScript strict, React 18, Tailwind CSS.
- **Prisma** with pooled `DATABASE_URL` + direct `DIRECT_URL` (`directUrl`); schema managed via `prisma/migrations`.
- **Neon Auth** (Managed Better Auth) via `@neondatabase/auth`; session cookies; users mirrored locally.
- **Cloudflare R2** private bucket, presigned PUT/GET, two-phase upload.
- **Vercel** target; `build` runs `prisma generate && next build`; Node `>=20.9.0`; daily cleanup cron (`vercel.json`).

## Data model (implemented)
`User, Project, ProjectMember, Category, Transaction, DiaryEntry, Attachment, Budget, BudgetRevision,
AuditLog, IdempotencyKey, ObjectDeletion`.

Key properties in place:
- `User.id` = Neon Auth user id (no stored password).
- `version` on Project/Transaction/DiaryEntry/Budget (optimistic locking).
- `Attachment`: `transactionId`/`diaryEntryId` (exactly one when attached), `status` (pending|ready), `size`.
- DB CHECK constraints: attachment at-most-one-parent; pending has no parent; status enum.
- `IdempotencyKey` stores the response for replay.
- `ObjectDeletion` retry queue for deferred R2 deletions.

Migrations: `init`, `attachment_parent_check`, `idempotency_response`, `object_deletion_queue`.

## API endpoints (implemented)
| Area | Endpoints |
|---|---|
| Auth | `ALL /api/auth/[...path]` (Neon Auth proxy) |
| Projects | `GET/POST /api/projects`; `GET/PATCH /api/projects/:id` |
| Members | `GET/POST /api/projects/:id/members`; `PATCH/DELETE /api/projects/:id/members/:userId`; `DELETE /api/projects/:id/invitations/:invitationId` |
| Categories | `GET/POST /api/projects/:id/categories`; `PATCH /api/projects/:id/categories/:catId` |
| Transactions | `GET/POST /api/projects/:id/transactions`; `PATCH/DELETE /api/projects/:id/transactions/:txId`; `POST …/restore` |
| Diary | `GET/POST /api/projects/:id/diary`; `PATCH/DELETE /api/projects/:id/diary/:entryId` |
| Budgets | `GET/POST /api/projects/:id/budgets`; `PATCH /api/projects/:id/budgets/:budgetId`; `GET …/revisions` |
| Feed | `GET /api/projects/:id/timeline`; `GET /api/projects/:id/dashboard` |
| Uploads | `POST /api/uploads/presign`; `POST /api/uploads/:attachmentId/finalize`; `GET /api/attachments/:id/download`; `DELETE /api/attachments/:id` |
| Maintenance | `GET/POST /api/maintenance/cleanup` (secret-protected) |

## UI pages (implemented)
`/login` (Neon Auth: email/password + Google + magic-link option) · `/projects` (list/create) · `/projects/:id`
(Dashboard + chart) · `/transactions` (admin soft-delete/restore + "show deleted") · `/diary`
(author/admin edit, admin delete) · `/budgets` · `/members` (admin) · `/settings` (admin, project +
categories). Attachments render as image thumbnails (lightbox) or document download chips; document
uploads accepted on both diary and transactions.
Nav: mobile bottom tabs / desktop sidebar; admin-only links for Members and Settings.
PWA: `manifest.json` + service worker (`public/sw.js`, registered in production).

## Behaviour implemented
- **Auth**: Neon Auth sign-up/in via same-origin proxy; server `getSession`; user mirror upsert.
- **Authorization**: `requireRole(projectId, userId, minRole)` on every route; project isolation via `projectId` scoping; last-admin safeguard; editor-any transaction edits (admin-only delete/restore); diary author/admin edits, admin delete. The project creator is its first admin. Admins can invite by email before the invitee has an account (pending `Invitation` claimed automatically on first sign-in).
- **Uploads**: presign → browser PUT direct to R2 → finalize (HeadObject verifies existence/size,
  re-checks the size cap) → link on create. Images render inline via signed GET; **all other types are
  download-only** through `GET /api/attachments/:id/download` (`octet-stream`, `attachment`, `nosniff`).
  Type allowlist (jpeg/png/webp/gif inline; pdf/txt/csv/xls/xlsx/heic/heif download-only), 10 MB per
  file, ≤10 per record. Delete removes the object (deferred retry on failure).
- **Correctness**: `Idempotency-Key` on transaction/diary create; `version` optimistic locking (409 on stale); audit log written in the same Prisma transaction.
- **Budgets**: planned vs derived actual (`SUM(amount)`), variance + status (green<80 / yellow 80–100 / red>100); revisions append-only.
- **Time**: `Asia/Kolkata` boundaries; weeks start Monday.
- **Maintenance**: reaps `pending` uploads older than 24h and retries deferred R2 deletions (attempt cap + TTL).

## Verification
- `npm run typecheck`, `npm run lint`, `npm test` (**40 unit tests**: roles, validation, period/budget
  math, maintenance auth, file policy), `npm run build` — all green.
- Manual e2e against a real Neon project + R2 bucket: auth sign-up/session; project/category/transaction/
  diary/budget CRUD; optimistic-lock 409; idempotent replay; two-phase upload (PUT→finalize→link);
  attachment delete; budgets variance + revision history; timeline merge; dashboard totals; cleanup
  reap+delete; document upload + forced-download headers + rejected HTML; unauth download 401.

## Not yet implemented (backlog)
1. **Magic link**: UI is wired (`signIn.magicLink`), but the branch reports `magicLink.enabled: false`
   (`POST /api/auth/sign-in/magic-link` → 404). Enable it on the Neon Auth branch to activate.
2. **Neon Auth config**: add trusted origins (`https://build.harishspace.in`, preview), review sign-up controls.
3. **R2 CORS**: allow `localhost:3000` (+ production origin) for PUT/GET/HEAD.
4. **Release/backup tooling**: `npm run db:backup` / `db:restore` + `prisma:deploy` implemented (see
   `10-OPERATIONS.md`); still to do: schedule backups outside Vercel, provision a separate prod backup
   bucket/credentials, and a documented Neon Auth recovery step.
5. **Dev/prod isolation**: local dev currently targets the default (production) Neon branch — create a
   `dev` branch (needs Neon CLI auth; procedure in `10-OPERATIONS.md`).
6. **Optional hardening**: malware/AV scanning on finalize; magic-byte content sniffing to reject mismatched types (defence in depth).

## Environment variables
`DATABASE_URL`, `DIRECT_URL`, `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`, `NEXT_PUBLIC_APP_URL`
(`APP_URL`), `R2_ACCOUNT_ID`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
`R2_BUCKET`, `R2_REGION`, `MAINTENANCE_SECRET` (optional `CRON_SECRET`). See `.env.example`.
