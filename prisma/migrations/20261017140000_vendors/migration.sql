-- Vendors: a first-class supplier/contractor per project, referenced by transactions.
-- The existing free-text `Transaction.vendor` name is kept as a snapshot; transactions gain a
-- nullable `vendorId` link, and every distinct name already in the ledger is backfilled into a Vendor.

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "trade" TEXT,
    "contractValue" DECIMAL(12,2),
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_projectId_name_key" ON "Vendor"("projectId", "name");

-- CreateIndex
CREATE INDEX "Vendor_projectId_isActive_idx" ON "Vendor"("projectId", "isActive");

-- AddForeignKey
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable + CreateIndex + AddForeignKey (transaction link)
ALTER TABLE "Transaction" ADD COLUMN "vendorId" TEXT;

CREATE INDEX "Transaction_projectId_vendorId_idx" ON "Transaction"("projectId", "vendorId");

ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: one Vendor per distinct (project, vendor name) already recorded, then link the rows.
INSERT INTO "Vendor" ("id", "projectId", "name", "isActive", "version", "createdBy", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, t."projectId", t."vendor", true, 0, MIN(t."createdBy"), now(), now()
FROM "Transaction" t
WHERE t."vendor" IS NOT NULL AND btrim(t."vendor") <> ''
GROUP BY t."projectId", t."vendor";

UPDATE "Transaction" t
SET "vendorId" = v."id"
FROM "Vendor" v
WHERE v."projectId" = t."projectId" AND v."name" = t."vendor" AND t."vendorId" IS NULL;
