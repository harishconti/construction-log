import { Prisma } from '@prisma/client';

export type AuditEntity =
  | 'transaction'
  | 'funding'
  | 'vendor'
  | 'stage'
  | 'diary_entry'
  | 'budget'
  | 'project'
  | 'member'
  | 'category'
  | 'attachment'
  | 'consent'
  | 'account';

export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'restore'
  | 'archive'
  | 'unarchive'
  | 'role_change'
  | 'finalize'
  | 'cancel';

export type AuditEntry = {
  entity: AuditEntity;
  entityId: string;
  action: AuditAction;
  actorId: string;
  before?: unknown;
  after?: unknown;
};

/**
 * Writes an immutable audit row. Must be called with the same Prisma
 * transaction client as the mutation it describes, so the two are atomic.
 */
export async function writeAudit(
  tx: Prisma.TransactionClient,
  entry: AuditEntry,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      entity: entry.entity,
      entityId: entry.entityId,
      action: entry.action,
      actorId: entry.actorId,
      before: toJson(entry.before),
      after: toJson(entry.after),
    },
  });
}

type JsonField = Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined;

function toJson(value: unknown): JsonField {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.JsonNull;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
