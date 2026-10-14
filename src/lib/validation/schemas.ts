import { z } from 'zod';
import { ROLES } from '../roles';

export const paymentModeSchema = z.enum(['cash', 'upi', 'bank', 'card', 'credit']);
export const categoryTypeSchema = z.enum(['material', 'labour', 'tax', 'utility', 'misc']);
export const roleSchema = z.enum(ROLES);
export const projectStatusSchema = z.enum(['active', 'paused', 'completed']);
export const parentTypeSchema = z.enum(['transaction', 'diary_entry']);

const FUTURE_TOLERANCE_MS = 60_000;

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const registerSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email().max(255),
  password: z.string().min(8).max(200),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  password: z.string().min(1).max(200),
});

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
    amount: z.number().positive(),
    gstAmount: z.number().min(0).default(0),
    vendor: z.string().trim().max(200).optional().nullable(),
    paymentMode: paymentModeSchema,
    description: z.string().trim().max(2000).optional().nullable(),
    fileKeys: z.array(z.string().min(1)).max(10).optional(),
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
    amount: z.number().positive().optional(),
    gstAmount: z.number().min(0).optional(),
    vendor: z.string().trim().max(200).optional().nullable(),
    paymentMode: paymentModeSchema.optional(),
    description: z.string().trim().max(2000).optional().nullable(),
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
// Uploads
// ---------------------------------------------------------------------------

export const presignSchema = z.object({
  projectId: z.string().min(1),
  parentType: parentTypeSchema,
  mimeType: z.string().regex(/^image\/(jpeg|png|webp|heic|heif)$/, 'Unsupported image type'),
  size: z.number().int().positive().max(15 * 1024 * 1024).optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type AddMemberInput = z.infer<typeof addMemberSchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;
export type PresignInput = z.infer<typeof presignSchema>;
