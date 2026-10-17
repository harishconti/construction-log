import { z } from 'zod';
import { isAllowedMime, sizeLimitFor } from '../files';
import { ROLES } from '../roles';
import { FUNDING_SOURCES } from '../funding';
import { CALENDAR_DATE, istDateToInstant } from '../period';
import { CONSENT_PURPOSE_KEYS, POLICY_VERSION, missingRequiredPurposes } from '../legal';

export const paymentModeSchema = z.enum(['cash', 'upi', 'bank', 'card', 'credit']);
export const categoryTypeSchema = z.enum([
  'material',
  'labour',
  'tax',
  'utility',
  'equipment',
  'transport',
  'professional',
  'subcontract',
  'overhead',
  'finance',
  'misc',
]);
export const fundingSourceSchema = z.enum(FUNDING_SOURCES);
export const roleSchema = z.enum(ROLES);
export const projectStatusSchema = z.enum(['active', 'paused', 'completed']);
export const parentTypeSchema = z.enum(['transaction', 'diary_entry', 'funding']);

const FUTURE_TOLERANCE_MS = 60_000;

/**
 * A date input. Bare `YYYY-MM-DD` values are IST calendar dates (00:00 Asia/Kolkata); full ISO
 * timestamps pass through unchanged. `z.coerce.date()` would read `YYYY-MM-DD` as UTC midnight
 * (05:30 IST, so "today" is still in the future just after midnight IST) and would roll impossible
 * dates like 2026-02-30 over into March.
 */
const dateInput = z.union([z.string(), z.number(), z.date()]).transform((v, ctx) => {
  const d = typeof v === 'string' && CALENDAR_DATE.test(v) ? istDateToInstant(v) : new Date(v);
  if (Number.isNaN(d.getTime())) {
    ctx.addIssue({ code: z.ZodIssueCode.invalid_date, message: 'Invalid date' });
    return z.NEVER;
  }
  return d;
});

// Money guardrails: fits Decimal(12,2) and at most two decimal places.
const MAX_MONEY = 9_999_999_999.99;
const twoDecimals = (v: number) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6;
const moneyPositive = z.number().gt(0).max(MAX_MONEY).refine(twoDecimals, 'At most 2 decimal places');
const moneyNonNegative = z.number().min(0).max(MAX_MONEY).refine(twoDecimals, 'At most 2 decimal places');

// ---------------------------------------------------------------------------
// Projects & members
// ---------------------------------------------------------------------------

/** Optional site location. Latitude/longitude are a pair; `locationName` may stand alone. */
const locationFields = {
  locationName: z.string().trim().max(200).optional().nullable(),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
};

function checkCoordinatePair(
  val: { latitude?: number | null; longitude?: number | null },
  ctx: z.RefinementCtx,
) {
  const latSupplied = val.latitude !== undefined;
  const lngSupplied = val.longitude !== undefined;
  const latSet = val.latitude !== undefined && val.latitude !== null;
  const lngSet = val.longitude !== undefined && val.longitude !== null;
  if (latSupplied !== lngSupplied || latSet !== lngSet) {
    for (const path of ['latitude', 'longitude'] as const) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [path],
        message: 'Provide both latitude and longitude, or neither',
      });
    }
  }
}

export const createProjectSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).optional().nullable(),
    startDate: dateInput,
    status: projectStatusSchema.optional(),
    ...locationFields,
  })
  .superRefine(checkCoordinatePair);

export const updateProjectSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).optional().nullable(),
    startDate: dateInput.optional(),
    status: projectStatusSchema.optional(),
    ...locationFields,
    version: z.number().int().min(0).optional(),
  })
  .superRefine(checkCoordinatePair);

export const addMemberSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  role: roleSchema,
});

export const updateMemberRoleSchema = z.object({
  role: roleSchema,
});

export const createInviteLinkSchema = z.object({
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
// Vendors (suppliers / contractors)
// ---------------------------------------------------------------------------

export const createVendorSchema = z.object({
  name: z.string().trim().min(1).max(200),
  phone: z.string().trim().max(40).optional().nullable(),
  trade: z.string().trim().max(80).optional().nullable(),
  contractValue: moneyNonNegative.optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export const updateVendorSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  phone: z.string().trim().max(40).optional().nullable(),
  trade: z.string().trim().max(80).optional().nullable(),
  contractValue: moneyNonNegative.optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  isActive: z.boolean().optional(),
  version: z.number().int().min(0).optional(),
});

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

export const createTransactionSchema = z
  .object({
    categoryId: z.string().min(1),
    occurredAt: dateInput,
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
    occurredAt: dateInput.optional(),
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
// Funding (money in)
// ---------------------------------------------------------------------------

export const createFundingSchema = z
  .object({
    source: fundingSourceSchema,
    sourceName: z.string().trim().max(200).optional().nullable(),
    amount: moneyPositive,
    receivedAt: dateInput,
    mode: paymentModeSchema,
    reference: z.string().trim().max(200).optional().nullable(),
    description: z.string().trim().max(2000).optional().nullable(),
    attachmentIds: z.array(z.string().min(1)).max(10).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.receivedAt.getTime() > Date.now() + FUTURE_TOLERANCE_MS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['receivedAt'],
        message: 'Received date cannot be in the future',
      });
    }
  });

export const updateFundingSchema = z
  .object({
    source: fundingSourceSchema.optional(),
    sourceName: z.string().trim().max(200).optional().nullable(),
    amount: moneyPositive.optional(),
    receivedAt: dateInput.optional(),
    mode: paymentModeSchema.optional(),
    reference: z.string().trim().max(200).optional().nullable(),
    description: z.string().trim().max(2000).optional().nullable(),
    version: z.number().int().min(0).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.receivedAt && val.receivedAt.getTime() > Date.now() + FUTURE_TOLERANCE_MS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['receivedAt'],
        message: 'Received date cannot be in the future',
      });
    }
  });

// ---------------------------------------------------------------------------
// Diary entries
// ---------------------------------------------------------------------------

export const createDiarySchema = z.object({
  entryDate: dateInput,
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().max(20000),
  attachmentIds: z.array(z.string().min(1)).max(10).optional(),
});

export const updateDiarySchema = z.object({
  entryDate: dateInput.optional(),
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
  periodStart: dateInput,
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
    fundingId: z.string().min(1).optional(),
  })
  .refine((v) => [v.transactionId, v.diaryEntryId, v.fundingId].filter(Boolean).length <= 1, {
    message: 'An attachment can have at most one parent',
  });

// ---------------------------------------------------------------------------
// Consent & account erasure (DPDP)
// ---------------------------------------------------------------------------

export const consentPurposeSchema = z.enum(CONSENT_PURPOSE_KEYS);

/**
 * A grant of consent. `granted` is a literal `true` so an unchecked box can never be recorded as
 * agreement, and all required purposes must be present. The `policyVersion` must match the notice
 * currently published, so a stale form cannot record consent to a superseded version.
 */
export const recordConsentSchema = z
  .object({
    policyVersion: z.string().trim().min(1).max(40),
    purposes: z.array(consentPurposeSchema).max(CONSENT_PURPOSE_KEYS.length),
    granted: z.literal(true),
  })
  .superRefine((val, ctx) => {
    if (val.policyVersion !== POLICY_VERSION) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['policyVersion'],
        message: 'The terms have changed — please review the latest version',
      });
    }
    if (missingRequiredPurposes(val.purposes).length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['purposes'],
        message: 'All required consents must be accepted',
      });
    }
  });

/** A request to erase the account; `confirm` guards against an accidental POST. */
export const requestDeletionSchema = z.object({
  confirm: z.literal(true),
  reason: z.string().trim().max(500).optional().nullable(),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type AddMemberInput = z.infer<typeof addMemberSchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type CreateVendorInput = z.infer<typeof createVendorSchema>;
export type UpdateVendorInput = z.infer<typeof updateVendorSchema>;
export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;
export type CreateFundingInput = z.infer<typeof createFundingSchema>;
export type UpdateFundingInput = z.infer<typeof updateFundingSchema>;
export type CreateDiaryInput = z.infer<typeof createDiarySchema>;
export type UpdateDiaryInput = z.infer<typeof updateDiarySchema>;
export type CreateBudgetInput = z.infer<typeof createBudgetSchema>;
export type UpdateBudgetInput = z.infer<typeof updateBudgetSchema>;
export type PresignInput = z.infer<typeof presignSchema>;
export type FinalizeAttachmentInput = z.infer<typeof finalizeAttachmentSchema>;
export type RecordConsentInput = z.infer<typeof recordConsentSchema>;
export type RequestDeletionInput = z.infer<typeof requestDeletionSchema>;
