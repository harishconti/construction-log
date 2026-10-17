# API Specification

All routes under `/api`. Auth via **Neon Auth** httpOnly session cookies set by the same-origin
proxy at `/api/auth/[...path]`. Role checks happen in every route handler via a shared
`requireRole(projectId, userId, minRole)` helper, which re-reads membership from the DB on every
request (roles are never cached in a token). Every route also enforces **project isolation**: a
member of project A cannot read or write project B.

## Auth (Neon Auth — proxy, not custom)
| Method | Path | Description | Access |
|---|---|---|---|
| * | `/api/auth/[...path]` | Proxy to Neon Auth (`auth.handler()`): sign-up, sign-in, sign-out, session, etc. | Public |

- The browser uses `createAuthClient()` from `@neondatabase/auth/next` (no arguments; same-origin proxy).
- Server code uses `auth.getSession()` from `@neondatabase/auth/next/server`.
- There are **no custom** `register`/`login`/`logout`/`me` routes, no password storage, and no
  custom JWT issuance.
- The verified Neon Auth user is mirrored into the app `User` table on first authenticated request.

## Projects & Members
| Method | Path | Description | Min Role |
|---|---|---|---|
| POST | /api/projects | Create project (creator becomes admin) | Any logged-in |
| GET | /api/projects | List my projects (`?includeArchived=true`) | Any logged-in |
| GET | /api/projects/:id | Project detail | viewer |
| PATCH | /api/projects/:id | Update project settings | admin |
| DELETE | /api/projects/:id | Delete the project and everything in it (R2 objects queued) | admin |
| POST | /api/projects/:id/archive | Archive (hide from the default list; kept intact) | admin |
| POST | /api/projects/:id/unarchive | Restore an archived project | admin |
| GET | /api/projects/:id/members | List members | viewer |
| GET | /api/projects/:id/members | List members **and pending invitations** | viewer |
| POST | /api/projects/:id/members | Add member by email + role; if no account exists yet, stores a pending invitation claimed on sign-up | admin |
| PATCH | /api/projects/:id/members/:userId | Change member role | admin |
| DELETE | /api/projects/:id/members/:userId | Remove member | admin |
| DELETE | /api/projects/:id/invitations/:invitationId | Cancel a pending invitation | admin |
| GET | /api/projects/:id/invite-links | Active (unused, unrevoked, unexpired) join links; tokens never returned | admin |
| POST | /api/projects/:id/invite-links | Create a single-use 7-day link `{ role }` → `{ link, path }` (token shown once) | admin |
| DELETE | /api/projects/:id/invite-links/:linkId | Revoke an unused link (idempotent) | admin |
| POST | /api/invite-links/:token/accept | Join with the link's role → `{ projectId, role, joined }`; already a member → no-op; `404` unknown, `410 INVITE_LINK_USED/REVOKED/EXPIRED` | any signed-in user |

- The project creator becomes its **admin**. New sign-ups receive **no automatic membership**; an admin
  adds them by email (existing account → membership now; new email → pending invitation that applies on
  first sign-in). The **last admin** cannot be removed or demoted.
- **Location** is optional: `locationName`, `latitude`, `longitude` on create and PATCH. Latitude and
  longitude travel as a pair (both set or both `null`; `422` otherwise) and are bounded to ±90 / ±180.

## Categories
| Method | Path | Description | Min Role |
|---|---|---|---|
| GET | /api/projects/:id/categories | List categories (`?includeInactive=true`) | viewer |
| POST | /api/projects/:id/categories | Create category | admin |
| PATCH | /api/projects/:id/categories/:catId | Update/rename/deactivate | admin |

> Default categories are seeded on project create (Material, Labour, Electricity, Transport, Equipment
> hire, Professional fees, Permits & approvals, Subcontractor, Site overheads, Interest & finance, Misc).
> There is **no GST category** — GST is the per-expense `gstAmount` field (a component of `amount`), so a
> tax category would double-count the same money. The `tax` type remains available for other taxes.

## Transactions
| Method | Path | Description | Min Role |
|---|---|---|---|
| GET | /api/projects/:id/transactions | List with filters (category, date range, vendor, paymentMode) + pagination | viewer |
| POST | /api/projects/:id/transactions | Create (with optional finalized `attachmentIds`) | editor |
| PATCH | /api/projects/:id/transactions/:txId | Update | editor (any transaction) |
| DELETE | /api/projects/:id/transactions/:txId | Soft delete | admin |
| POST | /api/projects/:id/transactions/:txId/restore | Restore soft-deleted | admin |

> **Permission note:** editors may create and edit **any** transaction in the project; only admins
> may soft-delete or restore. (Current code enforces "own only" — reconcile to "any" _(to implement)_.)

## Funding (money in)
| Method | Path | Description | Min Role |
|---|---|---|---|
| GET | /api/projects/:id/funding | List with filters (source, party name, date range) + pagination | viewer |
| POST | /api/projects/:id/funding | Create (with optional finalized `attachmentIds`) | editor |
| PATCH | /api/projects/:id/funding/:fundingId | Update | editor (any entry) |
| DELETE | /api/projects/:id/funding/:fundingId | Soft delete | admin |
| POST | /api/projects/:id/funding/:fundingId/restore | Restore soft-deleted | admin |

- `source` is a fixed vocabulary: `bank` | `client` | `customer` | `peer_lending` | `self` | `grant` |
  `investor` | `other`. `mode` reuses the transaction payment modes. `amount` must be positive;
  `receivedAt` may not be in the future.
- Loan repayments/interest are recorded as expenses under a `finance` category, not as funding.

## Diary Entries
| Method | Path | Description | Min Role |
|---|---|---|---|
| GET | /api/projects/:id/diary | List (paginated, date desc) | viewer |
| POST | /api/projects/:id/diary | Create entry (with finalized `attachmentIds`) | editor |
| PATCH | /api/projects/:id/diary/:entryId | Update | author or admin |
| DELETE | /api/projects/:id/diary/:entryId | Delete | admin |

## Attachments / Uploads (two-phase, direct-to-R2)
| Method | Path | Description | Min Role |
|---|---|---|---|
| POST | /api/uploads/presign | Validate session+membership+role+filename+type allowlist+size; create `pending` attachment; return presigned PUT URL + server-generated `fileKey` | editor |
| POST | /api/uploads/:attachmentId/finalize | Verify object exists + re-check size ≤ cap; mark `ready`; optionally link to parent | editor |
| GET | /api/attachments/:id/download | Stream a file as a forced download (auth + membership) | viewer |
| DELETE | /api/attachments/:id | Delete attachment (own upload, or admin); removes R2 object + row | editor (own) / admin |

- Flow: **presign → browser PUT direct to R2 → finalize → link to record**. Image bytes never pass
  through Vercel. MIME allowlist and size are enforced server-side; object keys are never trusted
  from the client. Finalize also verifies the file's **magic bytes** match its declared type (rejects
  with `CONTENT_MISMATCH`).
- **Rate limits** (fixed window, per user) apply to `POST /api/uploads/presign` (120/min),
  transaction creates (120/min), diary creates (60/min) and member invites (60/hour); exceeding returns
  `429 RATE_LIMITED`.
- **Dates**: a bare `YYYY-MM-DD` (`startDate`, `occurredAt`, `entryDate`, `periodStart`) is an IST
  calendar date, stored as 00:00 Asia/Kolkata; full ISO timestamps are taken as-is. Impossible dates
  (e.g. `2026-02-30`) → 422.
- **Slow database**: if a write's transaction expires (Prisma P2028, e.g. a cold Neon compute) the
  write is rolled back and the API returns `503 TRANSACTION_TIMEOUT`; retrying with the same
  `Idempotency-Key` is safe.
- **Allowed types**: inline-viewable raster images (`image/jpeg|png|webp|gif`); download-only
  (`application/pdf`, `text/plain`, `text/csv`, `application/vnd.ms-excel` (xls),
  `…spreadsheetml.sheet` (xlsx), `image/heic|heif`). Active types (`text/html`, `image/svg+xml`,
  JS, archives) are rejected with 422. Per-file cap **10 MB**; up to **10 files per record**.
- **Serving**: images get a short-lived signed GET and render inline. **Non-images get no signed URL** —
  they are served only by `GET /api/attachments/:id/download` as `application/octet-stream` with
  `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`, and `Cache-Control: private, no-store`.

## Budgets
| Method | Path | Description | Min Role |
|---|---|---|---|
| GET | /api/projects/:id/budgets?period=YYYY-MM&granularity=month | List budgets + computed actual + variance | viewer |
| POST | /api/projects/:id/budgets | Create/upsert budget for category+period (201 create, 200 update) | admin |
| PATCH | /api/projects/:id/budgets/:budgetId | Revise planned amount / note (writes BudgetRevision) | admin |
| GET | /api/projects/:id/budgets/:budgetId/revisions | Revision history | viewer |

## Dashboard / Timeline
| Method | Path | Description | Min Role |
|---|---|---|---|
| GET | /api/projects/:id/timeline?from=&to=&limit=&before= | Merged chronological feed of transactions + diary entries | viewer |
| GET | /api/projects/:id/dashboard?period=month&date=YYYY-MM | Summary: total spend, by-category breakdown, budget variance | viewer |

- **Timeline** uses keyset (cursor) pagination on `(date, id)`: pass `limit` and, to page, the opaque
  `before` cursor returned as `nextCursor`. Response is `{ items, nextCursor, hasMore }` (no total/cap).

## Consent & Account (DPDP)
| Method | Path | Description | Access |
|---|---|---|---|
| GET | /api/consent | Current consent + the published notice (`policyVersion`, itemised `purposes`) | Any signed-in |
| POST | /api/consent | Record a consent grant `{ policyVersion, purposes[], granted: true }`; append-only (withdraws the previous active row). 422 on a stale version or a missing required purpose | Any signed-in |
| GET | /api/account/deletion | The account's erasure request + `graceDays` | Any signed-in |
| POST | /api/account/deletion | Request erasure `{ confirm: true, reason? }`; scheduled `DELETION_GRACE_DAYS` ahead. Idempotent (201 create / 200 existing) | Any signed-in |
| DELETE | /api/account/deletion | Cancel a pending erasure request (idempotent) | Any signed-in |

- The app shell sends a signed-in user with no consent for the current `POLICY_VERSION` to `/consent`.
- Erasure runs from the maintenance job once the grace period elapses; it anonymises the account
  (name/email overwritten, `deletedAt` set), deletes the projects the user solely owned (queueing their
  R2 objects) and promotes the longest-standing member of a shared project whose last admin left.

## Maintenance
| Method | Path | Description | Access |
|---|---|---|---|
| GET/POST | /api/maintenance/cleanup | Reap stale `pending` uploads (>24h), retry deferred R2 deletions and process due account-erasure requests | Shared secret |

Protected by `MAINTENANCE_SECRET` (header `x-maintenance-secret` or `Authorization: Bearer`), or
`CRON_SECRET` for Vercel Cron. Denies with 401 when no secret is configured. Intended to run on a
schedule, not from the app UI.

## System
| Method | Path | Description | Access |
|---|---|---|---|
| GET | /api/health | Liveness/readiness (`{ status, db, time }`); 200 healthy, 503 when the DB is unreachable. Exposes no secrets | Public |

## Validation Rules (server-side, non-negotiable)
- `amount` > 0; `gstAmount` >= 0 and <= `amount`; `amount` is the GST-inclusive total.
- `occurredAt` cannot be in the future (tolerate small clock skew).
- `periodStart` must align: Monday for week, 1st for month (`Asia/Kolkata`).
- Only `admin` can create/modify budgets, categories, and members.
- **Editor**: CRUD transactions (any) + diary (create; edit only own entries). Cannot touch
  budgets/categories/members. Only admin deletes diary entries and soft-deletes/restores transactions.
- Every create/update/delete writes an AuditLog row in the same Prisma transaction.
- Write endpoints accept an `Idempotency-Key` header; replays return the original result. _(to implement)_
- Mutable resources carry a `version`; stale `version` in an update is rejected (409). _(to implement)_

## Error Shape
All errors return `{ error: string, code: string }` with an appropriate HTTP status
(400/401/403/404/409/422/500).

## Implementation Status
Implemented: Neon Auth proxy; projects/members/categories (with optional project location/geotag);
transactions (list/create/update/delete/restore) with two-phase R2 upload linking, editor-any edits,
optimistic locking and idempotency; diary (list/create/update/delete) with multi-file linking; budgets
(list with derived actual + variance, create/upsert, revise with revision history); timeline; dashboard;
consent + account-erasure endpoints (DPDP); maintenance cleanup (stale uploads, R2 deletion retries, due
erasure requests); attachment policy (type allowlist, size caps) with app-proxied downloads for
non-images. Public pages: Terms, Privacy and the blog/guides.

Pending: magic-link activation on the branch; Neon Auth trusted-origin configuration; R2 CORS;
production `prisma migrate deploy` release process.
