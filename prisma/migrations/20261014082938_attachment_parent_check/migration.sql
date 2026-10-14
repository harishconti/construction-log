-- Attachment parent integrity:
--   * An attachment may reference at most one parent (transaction XOR diary_entry).
--   * A `pending` attachment must not be linked to any parent.
--   * A `ready` attachment may be unlinked transiently (before the record is created) or linked to exactly one parent.

ALTER TABLE "Attachment"
  ADD CONSTRAINT "attachment_status_check"
  CHECK ("status" IN ('pending', 'ready'));

ALTER TABLE "Attachment"
  ADD CONSTRAINT "attachment_parent_check"
  CHECK (
    ("transactionId" IS NULL OR "diaryEntryId" IS NULL)
    AND ("status" <> 'pending' OR ("transactionId" IS NULL AND "diaryEntryId" IS NULL))
  );
