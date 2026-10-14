# Final Prompt for the Coding Agent (Copy-Paste This)

You are building a **Construction Ledger** web + mobile (PWA) application for tracking expenses,
diary entries, and budgets for a personal house-construction project in India.

> `08-INFRA-SETUP-CHECKLIST.md` is **authoritative** over any older infrastructure note in this repo.
> Read current official Neon Auth Next.js documentation and use supported APIs for the installed SDK.

## Tech Stack (use exactly this)
- Next.js (App Router), TypeScript, React 19, Tailwind CSS
- Prisma ORM + **Neon PostgreSQL** (pooled `DATABASE_URL`; `DIRECT_URL` for migrations)
- Auth: **Neon Auth** (Managed Better Auth) via `@neondatabase/auth`; httpOnly session cookies — no
  custom JWT, no `bcrypt`, no password storage
- Image storage: **Cloudflare R2** (private), S3-compatible, presigned PUT/GET
- Charts: Recharts
- PWA: manual `manifest.json` + custom service worker (no `next-pwa`)
- Deployment: **Vercel** (Hobby) + Neon + Cloudflare R2; `build.harishspace.in` via Cloudflare DNS

## Core Entities
Implement the schema in `02-DATA-MODEL.md`:
- `User` (id = Neon Auth user id; no password), `Project`, `ProjectMember` (admin|editor|viewer, per project)
- `Category` (per project: material/labour/tax/utility/misc)
- `Transaction` (soft-delete via `deletedAt`; `version` for optimistic locking; `amount` GST-inclusive)
- `DiaryEntry`, `Attachment` (exactly one parent: `transactionId` XOR `diaryEntryId`; `status` pending|ready)
- `Budget`, `BudgetRevision` (append-only), `AuditLog` (JSONB before/after), `IdempotencyKey`

## Business Rules (enforce server-side, never trust the client)
1. `requireRole(projectId, userId, minRole)` in every read/write; membership re-read from DB each request.
   - viewer: read-only.
   - editor: CRUD transactions (any) + create diary (edit own entries); cannot touch budgets/categories/members.
   - admin: everything; only admin soft-deletes/restores transactions and deletes diary entries.
2. No automatic membership on sign-up. Bootstrap the initial admin via seed/CLI for a known Neon Auth user id.
3. Last admin of a project cannot be removed or demoted.
4. Project isolation: project A members cannot access project B data or images.
5. Every create/update/delete writes an AuditLog row in the same Prisma transaction.
6. Budget "actual" is NEVER stored — always `SUM(transactions.amount)` by category + period (GST-inclusive).
7. Budget planned changes write a `BudgetRevision` (old, new, reason, changedBy).
8. Transaction `amount > 0`, `0 <= gstAmount <= amount`, `occurredAt` not in the future.
9. Money uses Decimal (integer paise), never float. Timezone `Asia/Kolkata`; weeks start Monday.
10. Uploads: presign → browser PUT direct to R2 → **finalize** (verify object + mark ready + link).
    Server generates object keys; MIME/size allowlist; reads use short-lived signed GET URLs.
11. Optimistic locking (`version`) and idempotency keys guard concurrent edits and retried creates.

## Pages / UX (mobile-first, Tailwind)
- `/login` — Neon Auth sign-in / sign-up (handle email-verification states)
- `/projects` — list my projects; create project
- `/projects/:id` — Dashboard: summary cards, Recharts planned-vs-actual, recent 5 transactions, recent 3 diary entries
- `/projects/:id/transactions` — filtered list + pagination + add/edit modal + camera capture upload
- `/projects/:id/diary` — timeline, photo gallery, lightbox, multi-image upload
- `/projects/:id/budgets` — Week/Month toggle, color-coded table, admin create/revise with reason
- `/projects/:id/members` — admin: add by email (existing account), change role, remove
- `/projects/:id/settings` — project name/dates, category management

## Navigation
- Mobile: bottom tab bar (Dashboard / Transactions / Diary / More); Desktop: left sidebar.

## API Routes
Implement exactly the routes in `03-API-SPEC.md` (Neon Auth proxy; REST under `/api`; pagination +
filters; consistent error shape `{ error, code }`).

## Deployment
- Provide Vercel deployment steps (see `06-DEPLOYMENT.md`), `.env.example`, and `README` — **not**
  Oracle/Railway/Tunnel provisioning. Provide a Dockerfile only for local convenience if desired.

## Quality Bar
- TypeScript strict mode, no `any`.
- Zod validation on every API input.
- Loading states, empty states, and toasts for all mutations.
- Responsive at 375px (mobile) and 1440px (desktop).
- Tests for `requireRole`, validation, project isolation, last-admin safeguard, and budget math.

## Deliverables
1. Next.js project structure with all files.
2. `prisma/schema.prisma` + `prisma/migrations/` + seed (bootstrap admin by Neon Auth user id; sample categories/budgets).
3. All API routes with validation + auth + audit logging (incl. `/api/maintenance/cleanup`).
4. All UI pages, responsive.
5. `.env.example`, `README`, Vercel setup notes, `vercel.json` cron.
6. PWA manifest + service worker.

Build order: Phase 1 (schema + Neon Auth wiring + transaction CRUD + audit log), Phase 2 (diary +
budgets + dashboard), Phase 3 (PWA + polish), plus a secret-protected maintenance/cleanup job.

> **Current status:** Phases 1–2 and the maintenance job are implemented (see `09-IMPLEMENTATION-STATUS.md`);
> remaining work is the Members/Settings UI, the PWA service worker, and production hardening.
> Ask before assuming anything not specified here.
