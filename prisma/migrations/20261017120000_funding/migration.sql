-- Funding: the money-in side of the ledger (bank loans, client/customer payments, peer lending,
-- self funding, grants, investors). Mirrors Transaction, plus:
--   * Attachment gains a third possible parent (`fundingId`); the at-most-one-parent CHECK is widened.
--   * Category types gain equipment/transport/professional/subcontract/overhead/finance.

-- CreateTable
CREATE TABLE "Funding" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceName" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "mode" TEXT NOT NULL,
    "reference" TEXT,
    "description" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Funding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Funding_projectId_receivedAt_idx" ON "Funding"("projectId", "receivedAt");

-- CreateIndex
CREATE INDEX "Funding_projectId_source_idx" ON "Funding"("projectId", "source");

-- CreateIndex
CREATE INDEX "Funding_createdBy_idx" ON "Funding"("createdBy");

-- AddForeignKey
ALTER TABLE "Funding" ADD CONSTRAINT "Funding_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Funding" ADD CONSTRAINT "Funding_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Enum-like guards (defence in depth at the DB level).
ALTER TABLE "Funding"
  ADD CONSTRAINT "funding_source_check"
  CHECK ("source" IN ('bank', 'client', 'customer', 'peer_lending', 'self', 'grant', 'investor', 'other'));

ALTER TABLE "Funding"
  ADD CONSTRAINT "funding_mode_check"
  CHECK ("mode" IN ('cash', 'upi', 'bank', 'card', 'credit'));

-- Attachment: a third parent for funding proofs (loan agreements, receipts, bank statements).
ALTER TABLE "Attachment" ADD COLUMN "fundingId" TEXT;

-- CreateIndex
CREATE INDEX "Attachment_fundingId_idx" ON "Attachment"("fundingId");

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_fundingId_fkey" FOREIGN KEY ("fundingId") REFERENCES "Funding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- An attachment may reference at most one parent (transaction XOR diary_entry XOR funding);
-- a `pending` attachment must not be linked to any parent.
ALTER TABLE "Attachment" DROP CONSTRAINT "attachment_parent_check";
ALTER TABLE "Attachment"
  ADD CONSTRAINT "attachment_parent_check"
  CHECK (
    (("transactionId" IS NULL)::int + ("diaryEntryId" IS NULL)::int + ("fundingId" IS NULL)::int) >= 2
    AND ("status" <> 'pending' OR ("transactionId" IS NULL AND "diaryEntryId" IS NULL AND "fundingId" IS NULL))
  );

-- Expanded expense categories.
ALTER TABLE "Category" DROP CONSTRAINT "category_type_check";
ALTER TABLE "Category"
  ADD CONSTRAINT "category_type_check"
  CHECK ("type" IN ('material', 'labour', 'tax', 'utility', 'equipment', 'transport', 'professional', 'subcontract', 'overhead', 'finance', 'misc'));
