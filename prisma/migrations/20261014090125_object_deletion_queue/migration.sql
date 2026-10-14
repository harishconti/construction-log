-- CreateTable
CREATE TABLE "ObjectDeletion" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "fileKey" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ObjectDeletion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ObjectDeletion_createdAt_idx" ON "ObjectDeletion"("createdAt");
