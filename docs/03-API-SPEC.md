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
| GET | /api/projects | List my projects | Any logged-in |
| GET | /api/projects/:id | Project detail | viewer |
| PATCH | /api/projects/:id | Update project settings | admin |
| GET | /api/projects/:id/members | List members | viewer |
| GET | /api/projects/:id/members | List members **and pending invitations** | viewer |
| POST | /api/projects/:id/members | Add member by email + role; if no account exists yet, stores a pending invitation claimed on sign-up | admin |
| PATCH | /api/projects/:id/members/:userId | Change member role | admin |
| DELETE | /api/projects/:id/members/:userId | Remove member | admin |
| DELETE | /api/projects/:id/invitations/:invitationId | Cancel a pending invitation | admin |

- The project creator becomes its **admin**. New sign-ups receive **no automatic membership**; an admin
  adds them by email (existing account → membership now; new email → pending invitation that applies on
  first sign-in). The **last admin** cannot be removed or demoted.

## Categories
| Method | Path | Description | Min Role |
|---|---|---|---|
| GET | /api/projects/:id/categories | List categories (`?includeInactive=true`) | viewer |
| POST | /api/projects/:id/categories | Create category | admin |
| PATCH | /api/projects/:id/categories/:catId | Update/rename/deactivate | admin |

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
  from the client.
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

## Maintenance
| Method | Path | Description | Access |
|---|---|---|---|
| GET/POST | /api/maintenance/cleanup | Reap stale `pending` uploads (>24h) and retry deferred R2 deletions | Shared secret |

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
Implemented: Neon Auth proxy; projects/members/categories; transactions (list/create/update/delete/
restore) with two-phase R2 upload linking, editor-any edits, optimistic locking and idempotency;
diary (list/create/update/delete) with multi-file linking; budgets (list with derived actual +
variance, create/upsert, revise with revision history); timeline; dashboard; maintenance cleanup;
attachment policy (type allowlist, size caps) with app-proxied downloads for non-images.

Pending: magic-link activation on the branch; Neon Auth trusted-origin configuration; R2 CORS;
production `prisma migrate deploy` release process.
