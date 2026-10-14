import { z } from 'zod';
import { isAllowedMime, sizeLimitFor } from '../files';
import { ROLES } from '../roles';

export const paymentModeSchema = z.enum(['cash', 'upi', 'bank', 'card', 'credit']);
export const categoryTypeSchema = z.enum(['material', 'labour', 'tax', 'utility', 'misc']);
export const roleSchema = z.enum(ROLES);
export const projectStatusSchema = z.enum(['active', 'paused', 'completed']);
export const parentTypeSchema = z.enum(['transaction', 'diary_entry']);

const FUTURE_TOLERANCE_MS = 60_000;

// Money guardrails: fits Decimal(12,2) and at most two decimal places.
const MAX_MONEY = 9_999_999_999.99;
const twoDecimals = (v: number) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6;
const moneyPositive = z.number().gt(0).max(MAX_MONEY).refine(twoDecimals, 'At most 2 decimal places');
const moneyNonNegative = z.number().min(0).max(MAX_MONEY).refine(twoDecimals, 'At most 2 decimal places');

// ---------------------------------------------------------------------------
// Projects & members
// ---------------------------------------------------------------------------

export const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  startDate: z.coerce.date(),
  status: projectStatusSchema.optional(),
});

export const updateProjectSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  startDate: z.coerce.date().optional(),
  status: projectStatusSchema.optional(),
  version: z.number().int().min(0).optional(),
});

export const addMemberSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  role: roleSchema,
});

export const updateMemberRoleSchema = z.object({
  role: roleSchema,
});

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: categoryTypeSchema,
});

export const updateCategorySchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  type: categoryTypeSchema.optional(),
  isActive: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

export const createTransactionSchema = z
  .object({
    categoryId: z.string().min(1),
    occurredAt: z.coerce.date(),
    amount: moneyPositive,
    gstAmount: moneyNonNegative.default(0),
    vendor: z.string().trim().max(200).optional().nullable(),
    paymentMode: paymentModeSchema,
    description: z.string().trim().max(2000).optional().nullable(),
    attachmentIds: z.array(z.string().min(1)).max(10).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.gstAmount > val.amount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['gstAmount'],
        message: 'GST amount cannot exceed the total amount',
      });
    }
    if (val.occurredAt.getTime() > Date.now() + FUTURE_TOLERANCE_MS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['occurredAt'],
        message: 'Transaction date cannot be in the future',
      });
    }
  });

export const updateTransactionSchema = z
  .object({
    categoryId: z.string().min(1).optional(),
    occurredAt: z.coerce.date().optional(),
    amount: moneyPositive.optional(),
    gstAmount: moneyNonNegative.optional(),
    vendor: z.string().trim().max(200).optional().nullable(),
    paymentMode: paymentModeSchema.optional(),
    description: z.string().trim().max(2000).optional().nullable(),
    version: z.number().int().min(0).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.amount !== undefined && val.gstAmount !== undefined && val.gstAmount > val.amount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['gstAmount'],
        message: 'GST amount cannot exceed the total amount',
      });
    }
    if (val.occurredAt && val.occurredAt.getTime() > Date.now() + FUTURE_TOLERANCE_MS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['occurredAt'],
        message: 'Transaction date cannot be in the future',
      });
    }
  });

// ---------------------------------------------------------------------------
// Diary entries
// ---------------------------------------------------------------------------

export const createDiarySchema = z.object({
  entryDate: z.coerce.date(),
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().max(20000),
  attachmentIds: z.array(z.string().min(1)).max(10).optional(),
});

export const updateDiarySchema = z.object({
  entryDate: z.coerce.date().optional(),
  title: z.string().trim().min(1).max(200).optional(),
  body: z.string().trim().max(20000).optional(),
  version: z.number().int().min(0).optional(),
});

// ---------------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------------

export const createBudgetSchema = z.object({
  categoryId: z.string().min(1),
  periodType: z.enum(['week', 'month']),
  periodStart: z.coerce.date(),
  plannedAmount: moneyNonNegative,
  note: z.string().trim().max(500).optional().nullable(),
});

export const updateBudgetSchema = z.object({
  plannedAmount: moneyNonNegative,
  note: z.string().trim().max(500).optional().nullable(),
  reason: z.string().trim().max(500).optional().nullable(),
  version: z.number().int().min(0).optional(),
});

// ---------------------------------------------------------------------------
// Uploads
// ---------------------------------------------------------------------------

export const presignSchema = z
  .object({
    projectId: z.string().min(1),
    parentType: parentTypeSchema,
    filename: z.string().trim().min(1).max(255),
    mimeType: z.string().refine(isAllowedMime, 'Unsupported file type'),
    size: z.number().int().positive().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.size !== undefined && val.size > sizeLimitFor(val.mimeType)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['size'],
        message: `File exceeds the ${Math.round(sizeLimitFor(val.mimeType) / (1024 * 1024))} MB limit`,
      });
    }
  });

/** Optional: attach a finalized upload directly to an existing record. */
export const finalizeAttachmentSchema = z
  .object({
    transactionId: z.string().min(1).optional(),
    diaryEntryId: z.string().min(1).optional(),
  })
  .refine((v) => !(v.transactionId && v.diaryEntryId), {
    message: 'An attachment can have at most one parent',
  });

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type AddMemberInput = z.infer<typeof addMemberSchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;
export type CreateDiaryInput = z.infer<typeof createDiarySchema>;
export type UpdateDiaryInput = z.infer<typeof updateDiarySchema>;
export type CreateBudgetInput = z.infer<typeof createBudgetSchema>;
export type UpdateBudgetInput = z.infer<typeof updateBudgetSchema>;
export type PresignInput = z.infer<typeof presignSchema>;
export type FinalizeAttachmentInput = z.infer<typeof finalizeAttachmentSchema>;
