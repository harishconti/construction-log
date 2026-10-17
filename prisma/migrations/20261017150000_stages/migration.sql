-- Project estimate + stages.
--  * Project.totalBudget: an optional overall estimate for the whole build.
--  * Stage: named phases of the build with an optional planned amount and dates.
--  * Transaction.stageId: optional tag of an expense to a stage.

-- AlterTable
ALTER TABLE "Project" ADD COLUMN "totalBudget" DECIMAL(12,2);

-- CreateTable
CREATE TABLE "Stage" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "plannedAmount" DECIMAL(12,2),
    "plannedStart" TIMESTAMP(3),
    "plannedEnd" TIMESTAMP(3),
    "order" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Stage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Stage_projectId_name_key" ON "Stage"("projectId", "name");

-- CreateIndex
CREATE INDEX "Stage_projectId_order_idx" ON "Stage"("projectId", "order");

-- AddForeignKey
ALTER TABLE "Stage" ADD CONSTRAINT "Stage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stage" ADD CONSTRAINT "Stage_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable + CreateIndex + AddForeignKey (transaction tag)
ALTER TABLE "Transaction" ADD COLUMN "stageId" TEXT;

CREATE INDEX "Transaction_projectId_stageId_idx" ON "Transaction"("projectId", "stageId");

ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "Stage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
