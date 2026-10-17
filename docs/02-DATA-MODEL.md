# Data Model (Prisma Schema — target)

> Target schema for the Vercel + Neon + Neon Auth design. Where it differs from the current
> `prisma/schema.prisma`, the change is marked _(to implement)_.

```prisma
// prisma/schema.prisma

model User {
  id        String   @id // Neon Auth user id (mirrored locally for FK integrity)
  name      String
  email     String   @unique
  createdAt DateTime @default(now())
  deletedAt DateTime? // set when the account is anonymised after a DPDP erasure request
  // NOTE: no passwordHash — credentials are owned by Neon Auth. (to implement: drop the legacy column)

  memberships    ProjectMember[]
  transactions   Transaction[]
  diaryEntries   DiaryEntry[]
  auditLogs      AuditLog[]
  budgetsCreated Budget[]
  uploads        Attachment[]
  projectsOwned  Project[]        @relation("ProjectCreator")
  consents       ConsentRecord[]
  deletionRequests DeletionRequest[]
}

model Project {
  id           String   @id @default(cuid())
  name         String
  description  String?
  startDate    DateTime
  status       String   @default("active") // active | paused | completed
  locationName String?  // optional site place name
  latitude     Float?   // optional geotag (set/cleared together with longitude; DB CHECK)
  longitude    Float?
  version      Int      @default(0)        // optimistic locking (to implement)
  createdBy    String
  createdAt    DateTime @default(now())

  creator      User            @relation("ProjectCreator", fields: [createdBy], references: [id])
  members      ProjectMember[]
  categories   Category[]
  transactions Transaction[]
  diaryEntries DiaryEntry[]
  budgets      Budget[]
  attachments  Attachment[]
}

model ProjectMember {
  id        String   @id @default(cuid())
  projectId String
  userId    String
  role      String   // 'admin' | 'editor' | 'viewer'
  createdAt DateTime @default(now())

  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  user    User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([projectId, userId])
  @@index([userId])
}

/// Pending membership for an email that has not signed up yet. Claimed on first sign-in.
model Invitation {
  id        String   @id @default(cuid())
  projectId String
  email     String
  role      String // 'admin' | 'editor' | 'viewer'
  invitedBy String
  expiresAt DateTime
  createdAt DateTime @default(now())

  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  inviter User    @relation("InvitationInviter", fields: [invitedBy], references: [id])

  @@unique([projectId, email])
  @@index([email])
}

model Category {
  id        String  @id @default(cuid())
  projectId String
  name      String  // e.g. "Cement", "Labour", "GST", "Electricity"
  type      String  // 'material' | 'labour' | 'tax' | 'utility' | 'equipment' | 'transport' | 'professional' | 'subcontract' | 'overhead' | 'finance' | 'misc'
  isActive  Boolean @default(true)

  project      Project       @relation(fields: [projectId], references: [id], onDelete: Cascade)
  transactions Transaction[]
  budgets      Budget[]

  @@unique([projectId, name])
}

model Transaction {
  id          String    @id @default(cuid())
  projectId   String
  categoryId  String
  occurredAt  DateTime
  amount      Decimal   @db.Decimal(12, 2) // GST-inclusive total
  gstAmount   Decimal   @default(0) @db.Decimal(12, 2) // tax component already inside `amount`
  vendor      String?
  paymentMode String    // 'cash' | 'upi' | 'bank' | 'card' | 'credit'
  description String?
  version     Int       @default(0) // optimistic locking (to implement)
  createdBy   String
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  deletedAt   DateTime? // soft delete

  project       Project      @relation(fields: [projectId], references: [id], onDelete: Cascade)
  category      Category     @relation(fields: [categoryId], references: [id])
  createdByUser User         @relation(fields: [createdBy], references: [id])
  attachments   Attachment[]

  @@index([projectId, occurredAt])
  @@index([projectId, categoryId])
  @@index([createdBy])
}

model Funding {
  id          String    @id @default(cuid())
  projectId   String
  source      String    // 'bank' | 'client' | 'customer' | 'peer_lending' | 'self' | 'grant' | 'investor' | 'other'
  sourceName  String?   // free-text party: bank / client / customer / lender
  amount      Decimal   @db.Decimal(12, 2)
  receivedAt  DateTime
  mode        String    // 'cash' | 'upi' | 'bank' | 'card' | 'credit'
  reference   String?   // cheque no / UTR / loan account no
  description String?
  version     Int       @default(0) // optimistic locking
  createdBy   String
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  deletedAt   DateTime? // soft delete

  project       Project      @relation(fields: [projectId], references: [id], onDelete: Cascade)
  createdByUser User         @relation(fields: [createdBy], references: [id])
  attachments   Attachment[]

  @@index([projectId, receivedAt])
  @@index([projectId, source])
  @@index([createdBy])
}

model DiaryEntry {
  id        String   @id @default(cuid())
  projectId String
  entryDate DateTime
  title     String
  body      String   @db.Text
  version   Int      @default(0) // optimistic locking (to implement)
  createdBy String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  project       Project      @relation(fields: [projectId], references: [id], onDelete: Cascade)
  createdByUser User         @relation(fields: [createdBy], references: [id])
  attachments   Attachment[]

  @@index([projectId, entryDate])
  @@index([createdBy])
}

model Attachment {
  id            String   @id @default(cuid())
  projectId     String
  // Exactly one parent once attached; enforced by a CHECK constraint.
  transactionId String?
  diaryEntryId  String?
  fundingId     String?
  status        String   @default("pending") // 'pending' | 'ready'
  fileKey       String   // server-generated R2 object key; never trust a client key
  originalName  String?  // sanitized client filename (download header only)
  mimeType      String
  size          Int?     // bytes, verified at finalize
  checksum      String?  // optional content hash (not populated)
  uploadedBy    String
  uploadedAt    DateTime @default(now())

  project      Project      @relation(fields: [projectId], references: [id], onDelete: Cascade)
  transaction  Transaction? @relation(fields: [transactionId], references: [id], onDelete: Cascade)
  diaryEntry   DiaryEntry?  @relation(fields: [diaryEntryId], references: [id], onDelete: Cascade)
  funding      Funding?     @relation(fields: [fundingId], references: [id], onDelete: Cascade)
  uploader     User         @relation(fields: [uploadedBy], references: [id])

  @@index([projectId])
  @@index([transactionId])
  @@index([diaryEntryId])
  @@index([fundingId])
  @@index([status])
}

model Budget {
  id            String   @id @default(cuid())
  projectId     String
  categoryId    String
  periodType    String   // 'week' | 'month'
  periodStart   DateTime // Monday for week, 1st for month (Asia/Kolkata boundary)
  plannedAmount Decimal  @db.Decimal(12, 2)
  note          String?
  version       Int      @default(0) // optimistic locking (to implement)
  createdBy     String
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  project   Project          @relation(fields: [projectId], references: [id], onDelete: Cascade)
  category  Category         @relation(fields: [categoryId], references: [id])
  creator   User             @relation(fields: [createdBy], references: [id])
  revisions BudgetRevision[]

  @@unique([projectId, categoryId, periodType, periodStart])
  @@index([projectId, periodType, periodStart])
}

model BudgetRevision {
  id        String   @id @default(cuid())
  budgetId  String
  oldAmount Decimal  @db.Decimal(12, 2)
  newAmount Decimal  @db.Decimal(12, 2)
  reason    String?
  changedBy String   // plain column; no FK relation
  changedAt DateTime @default(now())

  budget Budget @relation(fields: [budgetId], references: [id], onDelete: Cascade)

  @@index([budgetId, changedAt])
}

model AuditLog {
  id        String   @id @default(cuid())
  entity    String   // 'transaction' | 'diary_entry' | 'budget' | 'project' | 'member' | 'category' | 'attachment'
  entityId  String
  action    String   // 'create' | 'update' | 'delete' | 'restore' | 'role_change' | 'finalize' | 'cancel'
  actorId   String
  before    Json?
  after     Json?
  createdAt DateTime @default(now())

  actor User @relation(fields: [actorId], references: [id])

  @@index([entity, entityId])
  @@index([actorId, createdAt])
}

model IdempotencyKey {
  id          String   @id @default(cuid())
  projectId   String
  userId      String
  key         String
  requestHash String
  response    Json?
  createdAt   DateTime @default(now())

  @@unique([projectId, userId, key])
  @@index([createdAt])
}

/// Retry queue for R2 object deletions that failed or were deferred.
model ObjectDeletion {
  id        String   @id @default(cuid())
  projectId String?
  fileKey   String
  attempts  Int      @default(0)
  lastError String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([createdAt])
}

/// Fixed-window rate-limit counters (one row per bucket per window).
model RateLimit {
  id          String   @id @default(cuid())
  bucket      String
  windowStart DateTime
  count       Int      @default(0)

  @@unique([bucket, windowStart])
  @@index([windowStart])
}

/// Append-only DPDP consent grant: one row per acceptance of a policy version.
model ConsentRecord {
  id            String    @id @default(cuid())
  userId        String
  policyVersion String
  purposes      Json      // string[] of granted purpose keys
  grantedAt     DateTime  @default(now())
  withdrawnAt   DateTime?
  userAgent     String?
  ip            String?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, grantedAt])
}

/// A Data Principal's erasure request; scheduled ahead, cancellable, processed by the cleanup job.
model DeletionRequest {
  id           String    @id @default(cuid())
  userId       String
  status       String    @default("pending") // 'pending' | 'cancelled' | 'completed' (DB CHECK)
  reason       String?
  requestedAt  DateTime  @default(now())
  scheduledFor DateTime
  completedAt  DateTime?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([status, scheduledFor])
  @@index([userId, status])
}
```

## Key Design Decisions
- **Auth identity** — `User.id` is the verified Neon Auth user id; the row is a local mirror so
  `createdBy`/`uploadedBy` FKs stay intact. Neon Auth owns credentials.
- **Attachments are private and server-keyed** — the server generates `fileKey`; clients never supply
  object keys. Only **raster images** are served inline (short-lived signed GET); every other type is
  download-only via an app-proxied endpoint (`GET /api/attachments/:id/download`). No public URL is stored.
- **Allowed types** — inline: jpeg/png/webp/gif; download-only: pdf/txt/csv/xls/xlsx/heic/heif. Active
  types (html, svg, js, archives) are rejected. Per-file cap 10 MB; ≤10 files per record.
- **Exactly-one-parent** — an attached `Attachment` references either a `transaction`, a `funding`
  entry or a `diary_entry`, enforced by a DB `CHECK` (pending rows have none).
- **Funding is the money-in side** — a separate `Funding` model (not a signed `Transaction`) keeps the
  expenditure ledger clean; each row has a fixed `source`, an optional free-text party, an amount, a
  received date, a payment `mode` and an optional R2 proof. The dashboard compares funding received with
  spend to show a balance and the share of funding used.
- **Two-phase upload** — `pending` row at presign, `ready` after the object is verified. A scheduled
  job reclaims orphaned `pending` rows and retries R2 deletions.
- **Pending invitations** — an admin can invite an email before that person has an account; the
  `Invitation` row is claimed automatically (creates a `ProjectMember`) on the invitee's first sign-in,
  provided it has not expired (`expiresAt`, default 14 days).
- **Soft delete** on `Transaction` (`deletedAt`) — preserves history; admin can restore. Budget
  "actual" excludes soft-deleted rows; refunds/credits are modelled as negative or reversed rows
  (documented per project).
- **Budget revisions** are append-only — full audit of every planned-amount change.
- **Actual spend is never stored** — always computed via `SUM(transactions.amount)` (GST-inclusive)
  filtered by category + period, so it can never drift from the ledger.
- **Optimistic locking + idempotency** — `version` columns and an `IdempotencyKey` table guard
  against silent concurrent overwrites and duplicate create/finalize retries. _(to implement)_
- **Audit log uses JSONB** for before/after — flexible, queryable, immutable.
- **Consent is append-only (DPDP)** — `ConsentRecord` stores the policy version, the itemised purposes
  consented to and the evidence of the affirmative action. Re-consenting withdraws the previous row and
  inserts a new one, so the full history survives a policy-version bump.
- **Erasure anonymises, it does not drop the row** — `DeletionRequest` schedules erasure (cancellable
  window). When it runs, the `User` row is anonymised (name/email overwritten, `deletedAt` set) and the
  projects the user solely owned are deleted (their R2 objects queued on `ObjectDeletion`). The row is
  kept because `AuditLog` and other members' ledger rows reference it; shared projects are handed to
  the longest-standing remaining member.
- **Site location is optional and paired** — `Project.locationName` may stand alone; `latitude` and
  `longitude` are either both set or both null (DB `project_coordinates_pair_check`).

## Constraints & Correctness
- `amount > 0`; `0 <= gstAmount <= amount`; `occurredAt` not in the future (server-side).
- `Funding`: `amount > 0`; `receivedAt` not in the future; `source`/`mode` in the fixed vocabularies.
- `periodStart` aligned to Monday (week) or the 1st (month) in `Asia/Kolkata`.
- Prisma relations must validate before migration; polymorphic relations are replaced by explicit
  nullable FKs so the schema compiles.
- Keep application migrations out of the provider-managed `neon_auth` schema.

## Implementation Status
Implemented (migrations under `prisma/migrations`: `init`, `attachment_parent_check`,
`idempotency_response`, `object_deletion_queue`, `attachment_original_name`, `invitations`,
`invitation_expiry`, `rate_limit`, `enum_checks`, `invite_links`, `consent_and_deletion`,
`project_location`, `funding`): `User.id` = Neon Auth id with no `passwordHash` (and `deletedAt` for erased
accounts); `version` columns on Project/Transaction/Funding/DiaryEntry/Budget; `Attachment` with
`transactionId`/`diaryEntryId`/`fundingId`/`status`/`size`/`originalName`; the `attachment_parent_check` and
`attachment_status_check` CHECK constraints; `IdempotencyKey` with a stored `response`; `ObjectDeletion`
retry queue; `Invitation` (pre-signup invites, expiring); `RateLimit` fixed-window counters;
`ConsentRecord` and `DeletionRequest` (DPDP consent + erasure); optional `Project` location/geotag with
the `project_coordinates_pair_check` constraint. Enum-like columns (`Project.status`,
`ProjectMember.role`, `Invitation.role`, `Transaction.paymentMode`, `Funding.source`, `Funding.mode`,
`Category.type`, `Budget.periodType`, `DeletionRequest.status`) also carry DB `CHECK` constraints. Prisma
uses pooled `DATABASE_URL` + direct `DIRECT_URL`.

Pending: `checksum` column population.
