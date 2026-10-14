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
  // NOTE: no passwordHash — credentials are owned by Neon Auth. (to implement: drop the legacy column)

  memberships    ProjectMember[]
  transactions   Transaction[]
  diaryEntries   DiaryEntry[]
  auditLogs      AuditLog[]
  budgetsCreated Budget[]
  uploads        Attachment[]
  projectsOwned  Project[]        @relation("ProjectCreator")
}

model Project {
  id          String   @id @default(cuid())
  name        String
  description String?
  startDate   DateTime
  status      String   @default("active") // active | paused | completed
  version     Int      @default(0)        // optimistic locking (to implement)
  createdBy   String
  createdAt   DateTime @default(now())

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

model Category {
  id        String  @id @default(cuid())
  projectId String
  name      String  // e.g. "Cement", "Labour", "GST", "Electricity"
  type      String  // 'material' | 'labour' | 'tax' | 'utility' | 'misc'
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
  // Exactly one parent once attached; enforced by a CHECK constraint (to implement).
  transactionId String?
  diaryEntryId  String?
  status        String   @default("pending") // 'pending' | 'ready' (to implement)
  fileKey       String   // server-generated R2 object key; never trust a client key
  mimeType      String
  size          Int?     // bytes, verified at finalize (to implement)
  checksum      String?  // optional content hash (to implement)
  uploadedBy    String
  uploadedAt    DateTime @default(now())

  project      Project      @relation(fields: [projectId], references: [id], onDelete: Cascade)
  transaction  Transaction? @relation(fields: [transactionId], references: [id], onDelete: Cascade)
  diaryEntry   DiaryEntry?  @relation(fields: [diaryEntryId], references: [id], onDelete: Cascade)
  uploader     User         @relation(fields: [uploadedBy], references: [id])

  @@index([projectId])
  @@index([transactionId])
  @@index([diaryEntryId])
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
  action    String   // 'create' | 'update' | 'delete' | 'restore' | 'role_change' | 'finalize'
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
  responseId  String?
  createdAt   DateTime @default(now())

  @@unique([projectId, userId, key])
  @@index([createdAt])
}
```

## Key Design Decisions
- **Auth identity** — `User.id` is the verified Neon Auth user id; the row is a local mirror so
  `createdBy`/`uploadedBy` FKs stay intact. Neon Auth owns credentials.
- **Attachments are private and server-keyed** — the server generates `fileKey`; clients never supply
  object keys. Reads use short-lived signed GET URLs, never a stored public URL.
- **Exactly-one-parent** — an attached `Attachment` references either a `transaction` or a
  `diary_entry`, enforced by a DB `CHECK` (pending rows have neither). _(to implement)_
- **Two-phase upload** — `pending` row at presign, `ready` after the object is verified. A scheduled
  job reclaims orphaned `pending` rows and retries R2 deletions. _(to implement)_
- **Soft delete** on `Transaction` (`deletedAt`) — preserves history; admin can restore. Budget
  "actual" excludes soft-deleted rows; refunds/credits are modelled as negative or reversed rows
  (documented per project).
- **Budget revisions** are append-only — full audit of every planned-amount change.
- **Actual spend is never stored** — always computed via `SUM(transactions.amount)` (GST-inclusive)
  filtered by category + period, so it can never drift from the ledger.
- **Optimistic locking + idempotency** — `version` columns and an `IdempotencyKey` table guard
  against silent concurrent overwrites and duplicate create/finalize retries. _(to implement)_
- **Audit log uses JSONB** for before/after — flexible, queryable, immutable.

## Constraints & Correctness
- `amount > 0`; `0 <= gstAmount <= amount`; `occurredAt` not in the future (server-side).
- `periodStart` aligned to Monday (week) or the 1st (month) in `Asia/Kolkata`.
- Prisma relations must validate before migration; polymorphic relations are replaced by explicit
  nullable FKs so the schema compiles.
- Keep application migrations out of the provider-managed `neon_auth` schema.

## Implementation Status
Implemented (migrations under `prisma/migrations`): `User.id` = Neon Auth id with no `passwordHash`;
`version` columns on Project/Transaction/DiaryEntry/Budget; `Attachment` with `transactionId`/
`diaryEntryId`/`status`/`size`; the `attachment_parent_check` and `attachment_status_check` CHECK
constraints; `IdempotencyKey` with a stored `response`. Prisma uses pooled `DATABASE_URL` + direct
`DIRECT_URL`.

Pending: `checksum` column population; scheduled orphan-`pending` reclamation and R2 deletion retries;
diary/budget endpoints that consume these models.
