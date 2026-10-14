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
| POST | /api/projects/:id/members | Add member (email + role; user must already have an account) | admin |
| PATCH | /api/projects/:id/members/:userId | Change member role | admin |
| DELETE | /api/projects/:id/members/:userId | Remove member | admin |

- New sign-ups receive **no automatic membership**. The initial admin is bootstrapped via seed/CLI
  for a known Neon Auth user id — there is no public "first sign-up wins" route.
- The **last admin** cannot be removed or demoted.

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

## Attachments / Uploads (two-phase, direct-to-R2) _(finalize: to implement)_
| Method | Path | Description | Min Role |
|---|---|---|---|
| POST | /api/uploads/presign | Validate session+membership+role+MIME/size; create `pending` attachment; return presigned PUT URL + server-generated `fileKey` | editor |
| POST | /api/uploads/:attachmentId/finalize | Verify object exists + size/metadata; mark `ready`; link to parent | editor |
| DELETE | /api/attachments/:id | Delete attachment (own upload, or admin); removes R2 object + row | editor (own) / admin |

- Flow: **presign → browser PUT direct to R2 → finalize → link to record**. Image bytes never pass
  through Vercel. MIME allowlist and size are enforced server-side; object keys are never trusted
  from the client. Reads return short-lived signed GET URLs after membership checks.

## Budgets
| Method | Path | Description | Min Role |
|---|---|---|---|
| GET | /api/projects/:id/budgets?period=YYYY-MM&granularity=month | List budgets + computed actual + variance | viewer |
| POST | /api/projects/:id/budgets | Create/upsert budget for category+period | admin |
| PATCH | /api/projects/:id/budgets/:budgetId | Revise planned amount (writes BudgetRevision) | admin |
| GET | /api/projects/:id/budgets/:budgetId/revisions | Revision history | viewer |

## Dashboard / Timeline
| Method | Path | Description | Min Role |
|---|---|---|---|
| GET | /api/projects/:id/timeline?from=&to= | Merged chronological feed of transactions + diary entries | viewer |
| GET | /api/projects/:id/dashboard?period=month&date=YYYY-MM | Summary: total spend, by-category breakdown, budget variance | viewer |

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
Implemented: Neon Auth proxy; projects/members/categories/transactions; two-phase R2 upload
(presign → PUT → finalize) with link-on-create; attachment delete; editor-any transaction edits;
soft-delete/restore; optimistic locking (`version`) and `Idempotency-Key` on transaction create.

Pending: diary endpoints, budgets/revisions, timeline/dashboard; scheduled orphan-cleanup; Neon Auth
trusted-origin configuration; production `prisma migrate deploy` release process.
