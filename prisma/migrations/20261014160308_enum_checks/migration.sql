-- Enum-like value guards for string columns (defence in depth at the DB level).

ALTER TABLE "Project"
  ADD CONSTRAINT "project_status_check" CHECK ("status" IN ('active', 'paused', 'completed'));

ALTER TABLE "ProjectMember"
  ADD CONSTRAINT "project_member_role_check" CHECK ("role" IN ('admin', 'editor', 'viewer'));

ALTER TABLE "Invitation"
  ADD CONSTRAINT "invitation_role_check" CHECK ("role" IN ('admin', 'editor', 'viewer'));

ALTER TABLE "Transaction"
  ADD CONSTRAINT "transaction_payment_mode_check"
  CHECK ("paymentMode" IN ('cash', 'upi', 'bank', 'card', 'credit'));

ALTER TABLE "Category"
  ADD CONSTRAINT "category_type_check"
  CHECK ("type" IN ('material', 'labour', 'tax', 'utility', 'misc'));

ALTER TABLE "Budget"
  ADD CONSTRAINT "budget_period_type_check" CHECK ("periodType" IN ('week', 'month'));
