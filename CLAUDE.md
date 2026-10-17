# Construction Ledger — agent guide

Shared multi-user ledger for a home-construction project: expenses (with bills/photos), a site diary,
budgets vs actuals, per-project roles. Production: `https://www.harishspace.in` (the planned `build.harishspace.in` has no DNS record).
Stack: Next.js 16 (App Router, Turbopack) · React 19 · TypeScript strict · Prisma 5 · Neon Postgres ·
Neon Auth (`@neondatabase/auth`) · Cloudflare R2 (private) · Tailwind 3 · Vitest 5 · Vercel. Node 22.

Design docs live in `docs/` (index: `docs/README.md`). **What is actually built** is in
`docs/09-IMPLEMENTATION-STATUS.md` — trust it over 00–07, which describe the target design.

## Commands
**npm only** (`packageManager` in package.json; CI runs `npm ci`). Don't commit pnpm/yarn/bun lockfiles.
```bash
npm run dev          # next dev (needs .env — see .env.example)
npm run lint         # eslint .
npm run typecheck    # tsc --noEmit
npm test             # vitest run (tests/**/*.test.ts, node env, no DB; Prisma mocked)
npm run build        # prisma generate && next build
npm run test:e2e     # Playwright, public read-only tier; boots `next start` :3100 — build first
npx prisma migrate dev --name <snake_case>   # new migration (uses DIRECT_URL)
npm run prisma:deploy                         # apply migrations (prod: back up first)
```
CI (`.github/workflows/ci.yml`) runs lint → typecheck → test → build → e2e (public) on every branch
with placeholder env — build must not need real secrets (Neon Auth is lazy-initialised for this
reason; keep it so). The authed e2e tier writes data and is opt-in (`E2E_ALLOW_WRITES=1`, dev branch
only). Use the `/testing` and `/e2e-testing` skills.

## Layout
- `src/app/api/**/route.ts` — REST handlers. `src/app/**/page.tsx` — pages (data pages are `force-dynamic`).
- `src/components/` — client views (`*View.tsx`); `src/components/ui/` — shared primitives.
- `src/lib/` — server logic: `api.ts` (errors/`handle`/`parseJson`/`json`/pagination), `auth/`
  (`requireUser`, user mirror + invitation claim), `requireRole.ts`, `roles.ts`, `audit.ts`,
  `idempotency.ts`, `ratelimit.ts`, `attachments.ts`, `r2.ts`, `files.ts` (MIME allowlist, size caps,
  magic-byte sniff), `period.ts`/`budget.ts` (IST periods, variance), `format.ts` (`formatINR`, IST dates),
  `validation/schemas.ts` (all zod schemas).
- `src/proxy.ts` — Next 16 "proxy" (formerly middleware): auth gate for `/projects/*`.
- `prisma/` — `schema.prisma`, `migrations/`, `seed.ts`. `scripts/` — encrypted backup/restore.
- `tests/` — Vitest unit tests. `e2e/public/` (read-only) and `e2e/authed/` (writes) — Playwright.

## Non-negotiable rules
- **Every API route**: wrap in `handle()`, call `requireUser()` then `requireRole(projectId, user.id, min)`
  — roles are read fresh from the DB, never trusted from the session. Scope every query by `projectId`
  and 404 when a child row's `projectId` doesn't match. Use the `/new-api-route` skill.
- **Mutations** run in `prisma.$transaction` and call `writeAudit(tx, …)` with the **same `tx`**.
- **Optimistic locking**: `updateMany({ where: { id, version } , data: { …, version: { increment: 1 } } })`
  and 409 `VERSION_CONFLICT` when `count === 0`. Applies to Project, Transaction, DiaryEntry, Budget.
- **Creates** of transactions/diary go through `withIdempotency` (`Idempotency-Key` header); the UI
  reuses one key across retries (`newIdempotencyKey()` in `api-client.ts`).
- **Money**: `Decimal(12,2)`; validate with the schema helpers (>0, ≤2 dp); serialise as **strings**
  (`amount.toString()`); `gstAmount ≤ amount`. Display with `formatINR`.
- **Time**: business boundaries are `Asia/Kolkata`, weeks start Monday — use `period.ts`/`format.ts`
  (`todayIST()` in `period.ts`), never `new Date().toISOString().slice(0,10)`.
- **Roles**: viewer < editor < admin (per project). Editors edit any transaction; only admins
  delete/restore. Diary: author or admin edits, admin deletes. Keep the last-admin guard.
- **Uploads**: presign → browser PUT to R2 → finalize (HeadObject + size + magic bytes) → link on create.
  Images are compressed **both sides**: the browser downscales/re-encodes (and converts HEIC→JPEG via
  WASM) before upload, and `finalize` re-checks + re-compresses as a server backstop (`sharp`, with a
  WASM HEIC decoder). PDFs/GIFs are left as-is (real PDF compression needs Ghostscript, which Vercel
  lacks). Non-images are download-only via `/api/attachments/:id/download`. R2 deletes that fail go to
  the `ObjectDeletion` queue — never drop them.
- **Schema**: never touch the `neon_auth` schema. Enum-like string columns have DB `CHECK` constraints;
  when adding an enum value, update the zod enum **and** write a migration that alters the CHECK.
  Use the `/prisma-migration` skill.
- **Errors** are `{ error, code }`; throw `ApiError` (or let zod → 422, P2002 → 409, P2025 → 404).
- **UI**: semantic tokens only (`bg-surface`, `text-ink-2`, `border-border`, `bg-primary`, `text-danger`…
  from `tailwind.config.ts` / `globals.css`) — no raw palette colours, dark mode must work. Use
  `src/components/ui/` primitives (Sheet, ConfirmDialog, Toast, Field/MoneyInput, Button…); no
  `window.confirm`/`prompt`. 44px touch targets. Hide write affordances from viewers. Use the
  `/ui-screen` skill.

## Workflow
- Base branch is `develop`; feature work lands via PRs from `claude/*` branches.
- Work is tracked as numbered batches against `docs/11-AUDIT.md` (A1–A3) and `docs/12-DESIGN-AUDIT.md`
  (B1–B7). After finishing a batch or feature, update `docs/09-IMPLEMENTATION-STATUS.md`
  (migrations list, endpoints, test count, backlog).
- Releases with migrations: back up → `prisma migrate deploy` → deploy. Use the `/release` skill.
- Local `.env` currently points at the **production** Neon branch — don't run destructive scripts,
  `migrate reset`, or seed against it.
- Browser checks: use the `agent-browser` CLI (see parent `../CLAUDE.md`).
- Neon agent skills are vendored (gitignored) in `.agents/skills/` (`neon`, `neon-auth`, `neon-postgres`).
