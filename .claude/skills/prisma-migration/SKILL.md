---
name: prisma-migration
description: Change the database schema in Construction Ledger (prisma/schema.prisma) and create a Prisma migration. Use when adding/altering models, columns, indexes, enum-like values, or CHECK constraints.
---

# Schema change + migration

Prisma 5 against Neon Postgres. `DATABASE_URL` is the **pooled** URL (runtime), `DIRECT_URL` the
**direct** URL (migrations). Migrations are forward-only.

## Safety first
- Local `.env` may point at the **production** Neon branch (see `docs/10-OPERATIONS.md` §1). Check
  which branch `DIRECT_URL` targets before running `migrate dev`. Never run `prisma migrate reset`
  or `db push` against production. Prefer a Neon `dev` branch.
- Never create, alter or migrate anything in the `neon_auth` schema — Neon Auth owns it.

## Steps
1. Edit `prisma/schema.prisma`. Conventions:
   - String ids (`@id @default(cuid())`), except `User.id` = Neon Auth user id.
   - Enum-like values are `String` columns guarded by a DB `CHECK` and a zod enum in
     `src/lib/validation/schemas.ts` (status, role, paymentMode, category type, …). Not Prisma enums.
   - Money: `Decimal @db.Decimal(12, 2)`. Mutable ledger rows get `version Int @default(0)`.
   - Every project-owned table has `projectId` + an index that starts with it.
2. Generate: `npx prisma migrate dev --name <snake_case_description>` (or `--create-only` to hand-edit).
3. Hand-edit the SQL when Prisma can't express it — CHECK constraints, partial indexes, data
   backfills. Pattern from `migrations/*_enum_checks`:
   ```sql
   ALTER TABLE "Transaction" DROP CONSTRAINT "transaction_payment_mode_check";
   ALTER TABLE "Transaction" ADD CONSTRAINT "transaction_payment_mode_check"
     CHECK ("paymentMode" IN ('cash', 'upi', 'bank', 'card', 'credit', '<new>'));
   ```
   Adding a NOT NULL column to a populated table: add nullable → backfill → set NOT NULL, in one migration.
4. Keep app code in step: zod enum, `roles.ts`/`files.ts` constants, serializers, seed (`prisma/seed.ts`).
5. `npx prisma generate && npm run typecheck && npm test`.
6. Update docs: `docs/02-DATA-MODEL.md` and the **Migrations** list in `docs/09-IMPLEMENTATION-STATUS.md`.
7. Production rollout is a release step — use the `release` skill (backup → `migrate deploy` → deploy).
