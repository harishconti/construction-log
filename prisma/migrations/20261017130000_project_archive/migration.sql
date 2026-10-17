-- Project archive (soft): archived projects are hidden from the default list but kept intact so they
-- can be unarchived or deleted later.
ALTER TABLE "Project" ADD COLUMN "archivedAt" TIMESTAMP(3);

-- Drop the never-populated Attachment.checksum column (content hashes were documented as pending and
-- are not used anywhere).
ALTER TABLE "Attachment" DROP COLUMN "checksum";
