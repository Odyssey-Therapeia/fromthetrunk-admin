import { z } from "@hono/zod-openapi";

import { BACKFILL_MANUAL_REASONS } from "@/lib/google-merchant/catalogue-backfill";

/**
 * Schemas for the controlled catalogue attribute backfill.
 *
 * Both endpoints take a literal confirmation phrase: preview because it is the
 * gate people will script against, apply because it mutates the catalogue.
 */
export const PREVIEW_BACKFILL_CONFIRMATION =
  "PREVIEW_MERCHANT_CATALOGUE_BACKFILL" as const;

export const APPLY_BACKFILL_CONFIRMATION =
  "APPLY_MERCHANT_CATALOGUE_BACKFILL" as const;

/** Strict: any unexpected key is rejected rather than ignored. */
export const previewBackfillRequestSchema = z.strictObject({
  confirm: z.literal(PREVIEW_BACKFILL_CONFIRMATION),
});

export const applyBackfillRequestSchema = z.strictObject({
  confirm: z.literal(APPLY_BACKFILL_CONFIRMATION),
});

/**
 * Response shapes. Strict objects, parsed before sending, so no database row,
 * attribute blob, credential or internal plan detail can leak.
 */
export const backfillChangeSchema = z.strictObject({
  productId: z.string(),
  slug: z.string(),
  name: z.string(),
  productType: z.string(),
  set: z.record(z.string(), z.string()),
});

export const backfillManualReviewSchema = z.strictObject({
  productId: z.string(),
  slug: z.string(),
  name: z.string(),
  missingFields: z.array(z.string()),
  reasons: z.array(z.enum(BACKFILL_MANUAL_REASONS)),
});

export const previewBackfillResponseSchema = z.strictObject({
  summary: z.strictObject({
    productsScanned: z.number().int(),
    productsWouldChange: z.number().int(),
    fieldWrites: z.number().int(),
    requiresManualReview: z.number().int(),
    skipped: z.number().int(),
  }),
  changes: z.array(backfillChangeSchema),
  manualReview: z.array(backfillManualReviewSchema),
});

export const applyBackfillResponseSchema = z.strictObject({
  applied: z.literal(true),
  productsChanged: z.number().int(),
  fieldsWritten: z.number().int(),
  readinessAfter: z.strictObject({
    ready: z.number().int(),
    blocked: z.number().int(),
  }),
});

export type PreviewBackfillResponse = z.infer<
  typeof previewBackfillResponseSchema
>;
export type ApplyBackfillResponse = z.infer<typeof applyBackfillResponseSchema>;
