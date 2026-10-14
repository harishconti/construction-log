# Codebase Audit — Issues, Bugs & Improvements

Date: 14 October 2026 · Scope: whole repository at `b6695f7` (API routes, lib, UI, schema/migrations,
scripts, CI, docs).

Baseline health: `npm run typecheck`, `npm run lint` and `npm test` (40 tests) all pass. The issues below
are found by reading the code; none of them is caught by the current test suite.

Severity: **P0** fix before more real users join · **P1** a real bug or risk, fix soon · **P2** correctness
or robustness gap · **P3** improvement or cleanup.

---

## Summary

| # | Sev | Area | Finding |
|---|-----|------|---------|
| 1 | P0 | Security | Pending invitations can be claimed by anyone who signs up with an unverified email |
| 2 | P1 | Data integrity | Idempotency is not atomic: concurrent retries create duplicate transactions/diary entries |
| 3 | P1 | Data integrity | `linkAttachments` check-then-update race lets one attachment be relinked |
| 4 | P1 | Uploads | Finalize can relink attachments that are already linked, or hit a CHECK violation (500) |
| 5 | P1 | Storage leak | Deleting a diary entry (or project) orphans its R2 objects |
| 6 | P1 | Storage leak | Uploaded but never linked (`ready`, no parent) attachments are never cleaned up |
| 7 | P1 | Seed | Seeded budgets use UTC month start and are invisible in Budgets/Dashboard |
| 8 | P1 | Authorization | The last-admin guard is racy, so a project can end up with zero admins |
| 9 | P1 | Dates/UX | The "today" default is the UTC date, which is yesterday for IST users before 05:30 |
| 10 | P2 | API | Unique-constraint violations (P2002) return 500 instead of 409 |
| 11 | P2 | API | Invalid `from`/`to` query dates return 500 |
| 12 | P2 | API | Amount has no upper bound or 2-decimal rule: overflow → 500, silent rounding |
| 13 | P2 | Timeline | 500-row fetch cap makes pagination and totals wrong for larger projects |
| 14 | P2 | Reporting | Spend in deactivated categories shows as "Unknown" or disappears from rows |
| 15 | P2 | Uploads | `MAX_FILES_PER_RECORD` (10) is not enforced on the server |
| 16 | P2 | Budgets | Budget POST: create race → 500, bypasses version lock, always 201; PATCH ignores `note` |
| 17 | P2 | Idempotency | The UI makes a fresh key on every submit, so retries are never deduplicated |
| 18 | P2 | Performance | Every request upserts the user and queries invitations (a DB write per request) |
| 19 | P2 | Ops | `/api/health` returns 200 when the DB is down |
| 20 | P2 | Ops | `IdempotencyKey` rows are never purged |
| 21 | P2 | CI | CI runs only on `develop`; feature-branch pushes are unchecked |
| 22 | P3 | Security | No rate limiting, and no security headers (CSP/HSTS/frame-ancestors) |
| 23 | P3 | Misc | Smaller bugs, cleanups, dependency and doc drift (see below) |

---

## P0 — Security

### 1. Invitation hijack via unverified sign-up
`src/lib/auth/index.ts:41` (`claimInvitations`) grants membership to **any** user whose mirrored email
matches a pending `Invitation`. The UI goes straight to `/projects` after `signUp.email`
(`src/app/login/page.tsx`) and has no email-verification step, so verification appears to be off.

**Scenario:** an admin invites `contractor@example.com` as `editor` before that person has an account. An
attacker who knows or guesses the address signs up with it and gets editor access to the project's
financials as soon as they sign in.

**Fix:**
- Enable required email verification in Neon Auth, and claim invitations only when
  `session.user.emailVerified === true`.
- Alternatively, use tokenised invitations: email a single-use link and claim only through that link.
- Also normalise the email (lower-case it, which is already done) and expire invitations (add `expiresAt`).

Related: `normalise()` makes up `${id}@neon-auth.local` for users with no email. Because `User.email` is
`@unique`, an email change in Neon Auth that collides with an existing mirror row makes the `upsert` throw
P2002. That user then gets a 500 on every request.

---

## P1 — Bugs & data integrity

### 2. Idempotency is check-then-run, not atomic
`src/lib/idempotency.ts:28-38`: two concurrent requests with the same key both miss `findUnique`, and both
run `run()`, which creates two Transactions. Only the key insert is deduplicated afterwards. The comment
"return its stored response" hides the fact that the duplicate row was already committed.
**Fix:** insert the key row *first* (status `in_progress`) inside the same `$transaction` as the mutation,
or take `pg_advisory_xact_lock(hashtext(key))`, then store the response before commit. A request that
loses the race should wait for the stored response or return 409 `IN_PROGRESS`.

### 3. `linkAttachments` race
`src/lib/attachments.ts`: validates `transactionId/diaryEntryId IS NULL`, then calls `updateMany` with only
`id IN (...)`. Two concurrent creates that reference the same attachment both pass, and the last writer
wins. Because the default isolation is READ COMMITTED, the surrounding transaction does not prevent this.
**Fix:** `updateMany({ where: { id: { in }, projectId, status: 'ready', transactionId: null, diaryEntryId: null } })`
and throw if `count !== attachmentIds.length`.

### 4. Finalize can relink or crash on attachments that are already linked
`src/app/api/uploads/[attachmentId]/finalize/route.ts`:
- An attachment that is already `ready` and linked to transaction A can be finalized again with
  `{ transactionId: B }`, which silently moves it.
- With `{ diaryEntryId: X }` on an attachment that already has a `transactionId`, both columns get set.
  `attachment_parent_check` then fails and the client gets a 500.
- The parent transaction is not checked for `deletedAt`.
- Lines 28-30 are a dead, empty `if` block.

**Fix:** reject finalize unless `status === 'pending'`, or treat a call on an already-ready attachment as an
idempotent no-op that returns the current DTO. When linking, use the same conditional update as in #3.

### 5. Hard-deleting a diary entry or a project leaks R2 objects
`DELETE /api/projects/:id/diary/:entryId` relies on `onDelete: Cascade` for attachment rows, but never
deletes or queues their `fileKey`s. Files that are no longer referenced stay in the bucket forever. A
future project delete would leak the same way.
**Fix:** inside the transaction, select the attachments' `fileKey`s first and `objectDeletion.createMany`
them, then let the cleanup cron delete them.

### 6. Unlinked `ready` attachments are never reaped
New-record flow (`TransactionsView`/`DiaryView`): presign → PUT → finalize → POST create. If the create
fails (validation, network, user closes the tab), the attachment stays `ready` with no parent. The
maintenance job only reaps `status: 'pending'` (`src/app/api/maintenance/cleanup/route.ts:22`).
**Fix:** also reap `status: 'ready' AND transactionId IS NULL AND diaryEntryId IS NULL AND uploadedAt < now-24h`.

### 7. Seeded budgets use the wrong period start
`prisma/seed.ts:7` uses `Date.UTC(y, m, 1)` (00:00 UTC). Every reader uses `startOfMonthIST()`
(18:30 UTC on the previous day) and matches `periodStart` **exactly**, so the seed's budgets never show up
in Budgets or on the Dashboard. **Fix:** import `startOfMonthIST` from `src/lib/period.ts`.

### 8. The last-admin guard is racy
- `PATCH members/:userId` runs `assertNotLastAdmin` in its **own** transaction, then updates in a second one.
- `DELETE` puts both in one transaction, but under READ COMMITTED the count can still be stale.

**Scenario:** two admins demote each other at the same moment. Each request sees two admins, and the
project ends up with none.
**Fix:** run the check and the write in one transaction with `isolationLevel: 'Serializable'`, or lock the
admin rows (`SELECT ... FOR UPDATE` via `$queryRaw`) before counting.

### 9. "Today" defaults to the UTC date
`TransactionsView.tsx` and `DiaryView.tsx` use `new Date().toISOString().slice(0, 10)` for the default date
and for the date input's `max`. Between 00:00 and 05:30 IST this is **yesterday**, and the `max`
attribute stops users from picking today. **Fix:** format the local date, for example
`new Date().toLocaleDateString('en-CA')` (gives `YYYY-MM-DD`), or use a small `todayIST()` helper.

Related: date-only values are sent as `new Date('YYYY-MM-DD')` (UTC midnight) for `from`, but the `to`
filter uses local `T23:59:59`. Pick one convention, preferably IST day boundaries computed on the server.

---

## P2 — Correctness & robustness

### 10. Unique violations return 500
`errorResponse` (`src/lib/api.ts`) does not map `PrismaClientKnownRequestError` P2002 to 409 or P2025 to
404. Examples:
- renaming a category to an existing name (`categories/[catId]` PATCH has no duplicate check)
- concurrent category or budget creates
- the user-mirror email collision in #1

**Fix:** handle P2002 and P2025 centrally in `errorResponse`.

### 11. Invalid dates in queries return 500
`new Date(from)` in `transactions/route.ts` and `timeline/route.ts` produces `Invalid Date` for bad
input. Prisma then throws and the client gets a 500. **Fix:** validate the query params with zod
(`z.coerce.date()`) and return 422.

### 12. Monetary input validation
`amount`, `gstAmount` and `plannedAmount` are `z.number()` with no maximum and no decimal-place rule.
Values ≥ 1e10 overflow `Decimal(12,2)`, which gives a 500. Values like `10.005` are rounded silently. Totals
are added up as JS floats (`Number(...)`).
**Fix:**
- Add `.max(9_999_999_999.99)` and `.multipleOf(0.01)`, or accept strings and parse them to `Prisma.Decimal`.
- Sum on the server with `Decimal`, or use the DB aggregates directly.

### 13. Timeline pagination is wrong above 500 rows
`timeline/route.ts` fetches at most 500 transactions plus 500 diary entries, merges them in memory, and
slices. Once a project grows past that, `total` and `pages` are capped and older items can't be reached.
Each page also loads up to 1,000 rows, full diary bodies included.
**Fix:** use keyset pagination (a `before` cursor on `(date, id)`): fetch `limit` rows from each source,
merge, and return the next cursor. Alternatively, use a `UNION ALL` SQL query with `LIMIT/OFFSET`.

### 14. Deactivated categories distort reports
- The Dashboard (`page.tsx` and `api/.../dashboard`) only loads `isActive` categories for names. Spend in a
  deactivated category is labelled **"Unknown"**.
- Budgets GET builds rows from active categories only, but `totals.actual` adds up *all* spend. The rows
  then don't sum to the total.

**Fix:** load names for every category that has spend or a budget in the period, whether active or not.

Related: transaction PATCH accepts an **inactive** `categoryId`, unlike POST. When editing a transaction
whose category is inactive, the `<select>` has no matching option. It shows the first category but
submits the old id.

### 15. The 10-files-per-record limit is not enforced on the server
`MAX_FILES_PER_RECORD` is declared in `src/lib/files.ts` but never used. The create schemas cap
`attachmentIds` at 10, but finalize-with-parent (the edit flow) has no limit. **Fix:** count the
existing attachments on the parent in finalize/link.

### 16. Budget endpoint inconsistencies
- POST does `findUnique` outside the transaction, then `create`. Concurrent "Set" clicks hit P2002 → 500.
  Use `upsert` or the P2002 mapping from #10.
- POST overwrites an existing budget without checking `version`, which bypasses optimistic locking. It
  also returns 201 for an update.
- PATCH accepts `reason` but can't update `note`. POST stores `note ?? 'upsert'` as the revision reason.
- `BudgetsView` uses `toISOString().slice(...)` for `period`, so near month or week boundaries in IST it
  asks for the wrong period. Pass the server's `periodStart` around instead.

### 17. Idempotency keys are generated per click
`crypto.randomUUID()` is called inside `submit()`. Pressing Save again after a network error sends a new
key, so the duplicate-protection in #2 never applies in practice. **Fix:** create the key when the form
mounts (`useRef`), reuse it across retries, and reset it after success.
`crypto.randomUUID` also needs a secure context (fine in production, but it fails over plain-HTTP LAN dev).

### 18. A DB write on every request
`getCurrentUser()` → `mirrorUser()` runs `user.upsert` plus `invitation.findMany` on **every** API call
and page render. The project layout and the page each call it, so each navigation does this twice.
`requireRole` adds two more queries.
**Fix:**
- Wrap `getCurrentUser` in React `cache()`.
- Only upsert when the name or email changed, or at most once per session.
- Claim invitations only on sign-in or the first mirror.
- Merge `requireRole` into a single `projectMember.findUnique` (a 404 vs 403 split can use a second query
  only on a miss).

### 19. The health check hides DB outages
`/api/health` always returns HTTP 200 with `db: false`. Uptime monitors keyed on the status code will
never alert. **Fix:** return 503 when `db` is false.

### 20. Unbounded tables
- `IdempotencyKey` (which has an index on `createdAt`, presumably for this) is never purged. Add
  "delete keys older than 7 days" to the cleanup cron.
- `ObjectDeletion` rows that fail permanently keep retrying forever after the TTL. Consider a
  dead-letter cap.
- The cleanup loop deletes up to 500 objects one at a time, which risks the serverless timeout. Use
  `DeleteObjectsCommand` (up to 1,000 keys per call).
- `createMany` of the deletions and `deleteMany` of the pending rows are not in one transaction.

### 21. CI coverage
`.github/workflows/ci.yml` triggers only on push/PR to `develop`. Pushes to feature branches (`claude/*`)
and PRs targeting other branches are not checked. Add `push: branches: ['**']`, or at least run on all
PRs. There are no route/integration tests. A Postgres service container plus a few API tests (auth
guard, role checks, idempotency, optimistic locking) would cover most of the bugs above.

---

## P3 — Hardening & improvements

### 22. Security hardening
- **No rate limiting** anywhere. `POST /api/uploads/presign` can create unlimited pending rows and signed
  URLs, and auth goes through the proxy. Add per-user limits (for example Upstash or a Postgres token
  bucket), at least on presign, member invites and create endpoints.
- **No security headers.** Add CSP, `Strict-Transport-Security`, `X-Frame-Options`/`frame-ancestors`,
  `Referrer-Policy` and `Permissions-Policy` via `headers()` in `next.config.mjs`.
- Uploads trust the client's `mimeType`. Content is never sniffed, so an "image/png" can be anything. The
  risk is limited: images are served from the R2 origin, and documents are forced to download. Consider
  checking magic bytes at finalize (already in the backlog).
- `db-restore.mjs` writes the **decrypted** dump to `os.tmpdir()` with default permissions. Use
  `fs.mkdtempSync` and `mode: 0o600`.
- Backups use `aes-256-cbc` with no MAC. The SHA-256 is stored in object metadata, but restore never checks
  it. Verify it after decrypting.
- `db-backup.mjs` prune uses a single `ListObjectsV2` with no pagination, so it stops at 1,000 objects.

### 23. Smaller bugs & cleanups
- `parsePeriodParam` accepts `2026-13` or `2026-02-31` and silently rolls them over. Validate the
  month/day ranges.
- `GET /api/projects/:id` `_count.transactions` includes soft-deleted rows.
- Project create writes no audit row (every other mutation does). It also seeds no default categories,
  so the first "Add transaction" shows "Create a category first".
- Transaction restore writes `after: { deletedAt: null }` but no `before`. Restore and delete don't
  check `version`.
- Transaction edit: if the PATCH succeeds and the file upload then fails, the form keeps the stale
  `version`. Saving again gives a 409.
- `TransactionsView` refetches categories on every filter change, and the vendor filter sends a request
  per keystroke. Debounce it and load categories once.
- `MembersView`: changing a role applies straight from the `<select>` with no confirmation, and admins
  can demote themselves (locking themselves out of the page they are on).
- `DiaryView` only loads the first page (20 entries). There is no pagination UI, although the API
  supports it.
- Dead code: `registerSchema`/`loginSchema` (auth is Neon-managed), `next.config.mjs` `images.remotePatterns`
  (images use `<img>`, not `next/image`), the `finalize` empty `if`, and the unused `currentUserId` prop
  in `TransactionsView`.
- The duplicated dashboard logic in `app/projects/[id]/page.tsx` and `api/projects/[id]/dashboard` should
  share one function (they have already drifted: `select` vs `include`).
- Strings stand in for enums (`role`, `status`, `paymentMode`, `periodType`, `type`) with no DB CHECK
  constraint. Consider Prisma `enum`s or CHECK constraints, as already done for `Attachment.status`.
- The service worker cache name `cl-shell-v1` is never bumped, and the shell pages (`/projects`) are
  server-rendered per user. The offline fallback could show another session's cached HTML on a shared
  device. Exclude authenticated pages from the shell cache or clear it on sign-out.
- `manifest.json` has only an SVG icon. Some platforms (iOS, older Android) need 192/512 PNG and
  `apple-touch-icon`.

### Dependencies
- `npm audit`: 6 advisories (2 critical), **all in dev tooling** (`vitest@2` → `vite`, `tinypool`,
  `esbuild`). None ship to production. Upgrade `vitest`/`@vitest/coverage-v8` to the current major.
- React 18.3 with Next 16 is supported, but React 19 is the tested default for Next 16 and is needed for
  some App Router features (`useActionState`, `use`, ref-as-prop). Plan the upgrade.
- Prisma 5.x: Prisma 6 adds better Decimal/driver-adapter support (and the Neon serverless adapter, which
  cuts cold-start connection cost). Worth evaluating.
- `@neondatabase/auth` is a `0.x-beta`. Pin it exactly (`0.6.0-beta.N`) so a minor bump can't change
  auth behaviour unnoticed.

### Docs drift
- `09-IMPLEMENTATION-STATUS.md`:
  - says Node `>=20.9.0`, but `package.json` requires `22.x`
  - the migration list is missing `attachment_original_name` and `invitations`
  - it claims "≤10 per record" is enforced (see #15)

---

## Suggested order of work
1. #1 (invitation verification), #2/#3/#4 (atomic idempotency and linking), #8 (last admin).
2. #5/#6/#20 (storage and table hygiene in the cleanup job), #7 (seed), #9 (IST "today").
3. #10/#11/#12 (central error mapping and input validation). Together these remove most of the reachable 500s.
4. #18 (per-request DB cost), #13 (timeline cursor pagination), #21 (CI on all branches + API tests).
5. P3 hardening and cleanups.
