# Implementation Status

Last updated: 14 October 2026 · Stack: Next.js 16 · Prisma · Neon Postgres · Neon Auth · Cloudflare R2 (private) · Vercel.
This document reflects the **actual repository state**. For the target design see 00–08.

## Runtime / stack (as built)
- **Next.js 16.4** (App Router, Turbopack), TypeScript strict, React 19, Tailwind CSS, Recharts 3, Vitest 5.
- **Prisma** with pooled `DATABASE_URL` + direct `DIRECT_URL` (`directUrl`); schema managed via `prisma/migrations`.
- **Neon Auth** (Managed Better Auth) via `@neondatabase/auth`; session cookies; users mirrored locally.
- **Cloudflare R2** private bucket, presigned PUT/GET, two-phase upload.
- **Vercel** target; `build` runs `prisma generate && next build`; Node `22.x`; daily cleanup cron (`vercel.json`).

## Data model (implemented)
`User, Project, ProjectMember, Invitation, Category, Transaction, Funding, DiaryEntry, Attachment, Budget, BudgetRevision,
AuditLog, IdempotencyKey, ObjectDeletion, RateLimit, ConsentRecord, DeletionRequest`.

Key properties in place:
- `User.id` = Neon Auth user id (no stored password); `deletedAt` marks an anonymised (erased) account.
- `version` on Project/Transaction/Funding/DiaryEntry/Budget (optimistic locking).
- `Attachment`: `transactionId`/`diaryEntryId`/`fundingId` (exactly one when attached), `status` (pending|ready), `size`.
- DB CHECK constraints: attachment at-most-one-parent; pending has no parent; status enum; `DeletionRequest.status` enum; `Funding.source`/`Funding.mode` enums; `Category.type` (expanded).
- `IdempotencyKey` stores the response for replay.
- `ObjectDeletion` retry queue for deferred R2 deletions.
- `ConsentRecord` — append-only DPDP consent grants (policy version, itemised purposes, evidence).
- `DeletionRequest` — scheduled, cancellable account erasure processed by the cleanup job.

Migrations: `init`, `attachment_parent_check`, `idempotency_response`, `object_deletion_queue`,
`attachment_original_name`, `invitations`, `invitation_expiry`, `rate_limit`, `enum_checks`, `invite_links`,
`consent_and_deletion`, `project_location`, `funding`
(applied to the Neon `dev` branch; **apply to production before deploying** the funding code).

## API endpoints (implemented)
| Area | Endpoints |
|---|---|
| Auth | `ALL /api/auth/[...path]` (Neon Auth proxy) |
| Projects | `GET/POST /api/projects`; `GET/PATCH /api/projects/:id` |
| Members | `GET/POST /api/projects/:id/members`; `PATCH/DELETE /api/projects/:id/members/:userId`; `DELETE /api/projects/:id/invitations/:invitationId`; `GET/POST /api/projects/:id/invite-links`; `DELETE /api/projects/:id/invite-links/:linkId`; `POST /api/invite-links/:token/accept` |
| Categories | `GET/POST /api/projects/:id/categories`; `PATCH /api/projects/:id/categories/:catId` |
| Transactions | `GET/POST /api/projects/:id/transactions`; `PATCH/DELETE /api/projects/:id/transactions/:txId`; `POST …/restore` |
| Funding | `GET/POST /api/projects/:id/funding`; `PATCH/DELETE /api/projects/:id/funding/:fundingId`; `POST …/restore` |
| Diary | `GET/POST /api/projects/:id/diary`; `PATCH/DELETE /api/projects/:id/diary/:entryId` |
| Budgets | `GET/POST /api/projects/:id/budgets`; `PATCH /api/projects/:id/budgets/:budgetId`; `GET …/revisions` |
| Feed | `GET /api/projects/:id/timeline`; `GET /api/projects/:id/dashboard` |
| Uploads | `POST /api/uploads/presign`; `POST /api/uploads/:attachmentId/finalize`; `GET /api/attachments/:id/download`; `DELETE /api/attachments/:id` |
| Consent & account | `GET/POST /api/consent`; `GET/POST/DELETE /api/account/deletion` |
| Maintenance | `GET/POST /api/maintenance/cleanup` (secret-protected) |
| System | `GET /api/health` |

## UI pages (implemented)
`/login` (Neon Auth: email/password + Google + magic-link option; sign-up requires the DPDP consent
checkbox) · `/terms` · `/privacy` (public legal pages) · `/blog` + `/blog/:slug` (public guides: setup,
expenses, budgets, diary, team, use cases, data) · `/consent` (consent gate for new accounts and
after a policy-version change) · `/account` (consent status, optional-purpose preferences and the
account-deletion flow) · `/projects` (list/create) · `/projects/:id`
(Dashboard + chart + funding-vs-expenditure) · `/transactions` (filters, pagination, add/edit, admin soft-delete/restore) ·
`/funding` (money in: sources, filters, pagination, add/edit, admin soft-delete/restore) ·
`/timeline` (funding, expenses and diary together) · `/diary` (author/admin edit with add/remove photos, admin delete) · `/budgets` ·
`/more` (mobile menu) · `/members` (admin) · `/settings` (admin, project + categories).
Attachments render as image thumbnails (lightbox) or document download chips, with inline remove.
Nav: desktop sidebar; mobile bottom tabs (Dashboard/Transactions/Diary) + **More**.
PWA: `manifest.json` + service worker (`public/sw.js`, registered in production).

## Behaviour implemented
- **Auth**: Neon Auth sign-up/in via same-origin proxy; server `getSession`; user mirror upsert. Google and
  magic-link sign-ins return to `/auth/complete?next=…`, where the proxy exchanges the
  `neon_auth_session_verifier` for a session cookie; `next` is sanitised (`safeNextPath`, no open
  redirects). If a verifier reaches `/login` (exchange bounced) it retries once, then shows an error.
- **Invite links**: admins create single-use, 7-day join links per role (Members page: Copy / native
  Share / Revoke). Only a SHA-256 of the token is stored. `/invite/:token` is public and never consumes
  the link; joining is a POST after sign-in (Google, email/password, or magic link), and a signed-up
  user returning via `?join=1` is joined automatically. Used / revoked / expired links show a clear message.
- **Authorization**: `requireRole(projectId, userId, minRole)` on every route; project isolation via `projectId` scoping; last-admin safeguard; editor-any transaction edits (admin-only delete/restore); diary author/admin edits, admin delete. The project creator is its first admin. Admins can invite by email before the invitee has an account (pending `Invitation` claimed automatically on first sign-in).
- **Uploads**: presign → browser PUT direct to R2 → finalize (HeadObject verifies existence/size, magic bytes must match the declared type,
  re-checks the size cap) → link on create. **Images are compressed on both sides** to avoid R2 bloat: the
  browser downscales + re-encodes (jpeg/png/webp, and HEIC→JPEG via a WASM decoder) before upload, and
  finalize re-checks + re-compresses as a server backstop (`sharp`; HEIC via `heic-convert`). PDFs, GIFs
  and documents are stored as-is (PDF compression needs Ghostscript, which the serverless runtime lacks).
  Images render inline via signed GET; **all other types are
  download-only** through `GET /api/attachments/:id/download` (`octet-stream`, `attachment`, `nosniff`).
  Type allowlist (jpeg/png/webp/gif inline; pdf/txt/csv/xls/xlsx/heic/heif download-only), 10 MB per
  file, ≤10 per record. Delete removes the object (deferred retry on failure).
- **Correctness**: `Idempotency-Key` on transaction/diary create; `version` optimistic locking (409 on stale); audit log written in the same Prisma transaction.
- **Budgets**: planned vs derived actual (`SUM(amount)`), variance + status (green<80 / yellow 80–100 / red>100); revisions append-only.
- **Funding (money in)**: a `Funding` ledger parallel to transactions — fixed `source` (bank, client,
  customer, peer lending, self, grant, investor, other), optional party name, amount, received date,
  payment mode, reference and proofs. Editor create/edit, admin soft-delete/restore, idempotency,
  optimistic locking and audit, exactly like expenses. Loan repayments/interest are recorded as expenses
  under `finance` categories. The dashboard shows funding received, a balance (funding − spend), the
  share of funding used and a per-source breakdown; funding entries also appear in the timeline.
- **Time**: `Asia/Kolkata` boundaries; weeks start Monday.
- **Consent & erasure (DPDP, 2023)**: the app shell (`/projects`, every project page) sends a signed-in
  user with no consent for the current `POLICY_VERSION` through `/consent`, which lists each purpose
  (required/optional) and only records consent on an explicit affirmation. Consent is append-only
  (`ConsentRecord`), so a version bump or an optional-purpose change re-consents and the history is kept.
  `/account` shows consent and lets a user request erasure; the request is scheduled `DELETION_GRACE_DAYS`
  (30) ahead and can be cancelled. The cleanup job then anonymises the account (`name`/`email`
  overwritten, `deletedAt` set), deletes the projects the user solely owned (queueing their R2 objects)
  and promotes the longest-standing member when a departing user was a shared project's last admin;
  audit rows and the other members' ledger rows are retained. Terms and Privacy are published at
  `/terms` and `/privacy`.
- **Site location**: a project can carry an optional place name and a geotag. Coordinates are captured
  from the browser (permission `geolocation=(self)`), stored as a pair, shown on the dashboard and the
  project list, and linked to OpenStreetMap; editable at any time from Settings.
- **Maintenance**: reaps `pending` uploads older than 24h, retries deferred R2 deletions (attempt cap + TTL), and processes due account-erasure requests.

## Verification
- `npm run typecheck`, `npm run lint`, `npm test` (**178 unit tests**: roles, validation, period/budget
  math, maintenance auth, file policy + image compression policy, funding source/category vocabulary,
  audit regressions, API error mapping/pagination, API client,
  INR/IST/coordinate formatting, DPDP consent schemas + erasure processing, project-location rules, and
  server guards — `requireRole`, rate limit, audit write, idempotency, attachment linking, user-mirror
  first-sign-in race — with Prisma mocked), `npm run build` — all green.
- **Playwright e2e** (`npm run test:e2e`, runs in CI): public tier on desktop + Pixel 7 — login UI
  (including the DPDP sign-up consent checkbox), axe WCAG A/AA in light and dark, auth redirects, every
  API route → 401 (consent + account deletion included), maintenance secret, health shape, security
  headers/CSP, PWA manifest/icons, service worker, Google/mail icons, the consent gate redirect for
  signed-out users, and the public Terms/Privacy/Blog pages (122 passing, 4 environment-skipped).
  Authed tier
  (`e2e/authed/`: project/expense/diary flows, version conflict, idempotency, GST rule, no sideways
  scroll on mobile, soft-delete exclusion from totals + restore, budget upsert/variance status/
  revisions, invitations, last-admin guard, no sideways scroll or wrapped toggles at 360px, FAB never covers the last row, and project location set/change/clear) is opt-in via `E2E_ALLOW_WRITES=1` and must target a non-production Neon branch.
- Manual e2e against a real Neon project + R2 bucket: auth sign-up/session; project/category/transaction/
  diary/budget CRUD; optimistic-lock 409; idempotent replay; two-phase upload (PUT→finalize→link);
  attachment delete; budgets variance + revision history; timeline merge; dashboard totals; cleanup
  reap+delete; document upload + forced-download headers + rejected HTML; unauth download 401.

## Audit remediation
Tracking fixes for `11-AUDIT.md` (backend) and `12-DESIGN-AUDIT.md` (design).

**Batch A1 — done** (correctness & security):
`#1` invitation expiry (14d; email-match claim risk accepted & documented) · `#2` atomic idempotency
(advisory lock, run-in-transaction) · `#3` conditional attachment linking · `#4` finalize is idempotent
and refuses relink/deleted parents · `#5` diary delete queues R2 objects · `#6` cleanup reaps orphaned
`ready` uploads · `#7` seed uses IST month start · `#8` last-admin guard is serializable · `#9`
`todayIST()` for form dates · `#10–12` Prisma P2002→409/P2025→404/P2034→409, date-param validation
(422), money bounds + 2-decimal rule.

**Batch A2 — done** (robustness, perf, ops): `#13` timeline keyset pagination (no fetch cap) · `#14`
inactive categories shown in budgets/dashboard when they have spend or a budget, and selectable when
editing their transactions · `#15` 10-file-per-record cap enforced server-side (link + finalize) ·
`#16` budgets POST is atomic (201 create / 200 update) and PATCH can set `note` · `#17` UI reuses one
idempotency key across retries · `#18` `getCurrentUser` is request-cached, the user mirror only writes
on change, and `requireRole` uses one query for members · `#19` `/api/health` returns 503 when the DB is
down · `#20` cleanup batch-deletes R2 objects and purges stale idempotency keys · `#21` CI runs on all
branches.

**Design batch B1–B2 — done** (foundation & shell): semantic colour tokens + Tailwind mapping + dark
mode (`globals.css`, `tailwind.config.ts`), Archivo/IBM Plex Sans via `next/font`, global `:focus-visible`
ring, `src/lib/format.ts` (`formatINR`, IST `formatDate`/`formatDayLabel`), `viewport-fit=cover`;
`NavLink` with active state + `aria-current` and `lucide-react` icons, desktop sidebar, mobile bottom
bar with icons and safe-area padding, `max-w-[1200px]` content.

**Design batch B3–B4 — done** (primitives & Transactions): `src/components/ui/` gains `Button`,
`IconButton`, `Field` + inputs (`MoneyInput` with ₹/decimal/grouping, `Segmented`), `Sheet`
(bottom-sheet/drawer), `ConfirmDialog`, `Toast`, `Alert`, `Skeleton`, `StatusBadge`/`ProgressBar`,
`EmptyState` and a rebuilt `Lightbox` (focus, prev/next, caption). The Transactions screen is rebuilt on
them: sheet add/edit, mobile FAB, filter sheet + chips, day grouping with daily totals, overflow action
menu, confirm dialogs and toasts. `window.confirm`/`prompt` are being phased out.

**Batch A3 (partial) — done** (hardening & cleanups): security headers in `next.config.mjs`
(CSP/HSTS/frame-ancestors/nosniff/referrer/permissions); `parsePeriodParam` validates month/day ranges;
project detail `_count` excludes soft-deleted; project create writes an audit row and seeds default
categories; removed dead `register`/`login` schemas and `next/image` remotePatterns; service-worker
cache bumped and per-user shell pages no longer precached; backup script paginates prune, and restore
uses a 0700 temp dir / 0600 file and **verifies the SHA-256**.

**Design batch B5–B6 — done** (dashboard/budgets rework & polish): Dashboard now has a hero
"budget used" card with a progress bar, contextual stat cards, a horizontal planned-vs-actual chart
(compact ₹ ticks) and per-category progress rows with `StatusBadge`. Budgets use `Segmented`
Week/Month, 44px period stepper, a readable period label, mobile cards + desktop table, `StatusBadge`/
`ProgressBar`, and a revise **Sheet** (amount + reason). Diary uses the Sheet/ConfirmDialog/Toast and
day labels. Members, Settings (inline rename, inactive group), Login (method order, tablist, Alert) and
Projects (status pills, "New project" sheet) are migrated onto the primitives; the **More** page is a
grouped list with icons and sign-out. PWA now ships 192/512 + maskable PNG icons and an
`apple-touch-icon`. `window.confirm`/`prompt` are gone from `src/`.

**Design batch B7 — done** (remaining UI from the design audit): **shell** — 72px icon rail at `md`,
248px sidebar at `lg`, sticky mobile top bar with a **project switcher**, bottom bar with an active
pill and 12px labels. **Expenses** — `md+` table (date, vendor, category, paid by, bill, amount, ⋯)
with a total footer (current page, labelled as such when paginated) and row-click edit; mobile rows lead
with a bill thumbnail or icon tile, use the vendor as title, show "incl. ₹x GST", and mark deleted rows
with a 12px badge + strike-through (no fading); debounced vendor search beside Filters; soft delete is
immediate with an **"Expense deleted · Undo"** toast (`Toast` gained `action`); Delete sits in the edit
sheet footer. **Uploads** — shared `UploadPicker`/`useUploads`: thumbnails, per-file XHR progress,
retry, up to 10 files × 10 MB for expenses and diary. **Diary** — day headers on a rail, 3-up photo
grid, Delete moved into the sheet footer. **Timeline** — migrated to tokens, day groups with
expense/diary type tiles, deep links to the item. **Dashboard** — chart hidden below `md`, recent items
link to the item (`#tx-<id>` / `#entry-<id>`) and show dates. **Project cards** show total spend and
last activity. **Members** loading skeleton. **AttachmentList** — tokens, 32px delete chip in a 44px
hit area, file-type icons. **Lightbox/Sheet/ConfirmDialog** share a focus trap; Lightbox adds swipe.
Also: `Field` labels are now linked to their controls (`for`/`id`, `aria-describedby`), Add buttons
and FABs are hidden from viewers, ⋯ menus render fixed (no clipping in `overflow-hidden` lists), and
the danger button / lightbox controls keep contrast in dark mode.

**Batch A3 — complete.** Rate limiting (fixed-window, Postgres-backed) on presign / transaction &
diary creates / invites; DB `CHECK` constraints for enum-like columns; magic-byte content sniffing at
finalize; and dependency upgrades — **React 19**, **Recharts 3**, **Vitest 5** (clears the dev-only
advisories). React 18 deprecation is resolved. Prisma remains 5.x (driver-adapter/Neon-serverless is a
future consideration).

**UI test pass (14 Oct 2026)** — full exploratory run against a local Postgres + stub Neon Auth upstream:
every screen × admin/editor/viewer × desktop/mobile × light/dark (axe, console errors, 5xx, overflow,
unlabelled controls) plus scripted flows (login errors, sign-up, invites/role change/removal, settings,
expense validation/search/filters/edit/delete/undo/restore, budgets set/revise/period stepping, diary
CRUD, timeline deep links, role permissions in UI and API). Fixed: first-sign-in P2002 race in the user
mirror and invitation claim (500 on a new user's first page load); duplicate "New project" button on the
empty projects page; unlabelled Start date (New project), member role selects and inline category
rename; progress bars without accessible names; unreadable chart tooltip/legend ("Planned" series
colour); budget Revise/Set targets under 44px; long names/URLs causing sideways scroll on mobile
(projects list, dashboard recent cards, diary); client-side GST > amount message instead of the raw
`gstAmount:` validation string. Not covered locally: R2 uploads, Google sign-in, magic link.

## Not yet implemented (backlog)
1. **Magic link**: enabled on production and `dev` (15 Oct 2026), verified by email on `dev`. Links expire
   after 5 minutes (Neon default). Still on Neon's shared SMTP — configure custom SMTP before wider use.
2. **Neon Auth config**: production is served at `https://www.harishspace.in` (trusted; the planned
   `build.harishspace.in` has no DNS record). Review sign-up controls (sign-up is open). Phone/SMS auth
   would need an app `send.otp` webhook + SMS provider (not planned).
3. **R2 CORS**: allow `localhost:3000` (+ production origin) for PUT/GET/HEAD.
4. **Release/backup tooling**: `npm run db:backup` / `db:restore` + `prisma:deploy` implemented (see
   `10-OPERATIONS.md`); still to do: schedule backups outside Vercel, provision a separate prod backup
   bucket/credentials, and a documented Neon Auth recovery step.
5. **Dev/prod isolation**: a Neon `dev` branch now exists (created 15 Oct 2026, with its own Neon
   Auth) and runs the authed e2e suite. Still to do: point local `.env` at it instead of production.
6. **Optional hardening**: malware/AV scanning on finalize; separate restricted runtime vs migration DB credentials. (Magic-byte sniffing shipped in A3.)
7. **Legal review**: the Terms/Privacy pages and the DPDP consent notice are written from the codebase
   and need a lawyer's review; set `NEXT_PUBLIC_LEGAL_CONTACT_EMAIL` to a monitored address and name a
   grievance officer before wider use.

## Environment variables
`DATABASE_URL`, `DIRECT_URL`, `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`, `NEXT_PUBLIC_APP_URL`
(`APP_URL`), `NEXT_PUBLIC_LEGAL_CONTACT_EMAIL` (optional; the DPDP contact on the legal pages),
`R2_ACCOUNT_ID`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
`R2_BUCKET`, `R2_REGION`, `MAINTENANCE_SECRET` (optional `CRON_SECRET`). See `.env.example`.
