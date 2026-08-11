import { z } from "@hono/zod-openapi";

import {
  MERCHANT_PRODUCT_STATUSES,
  SYNC_ACTIONS,
} from "@/lib/google-merchant/catalogue-sync";
import { MAX_SYNC_BATCH_SIZE } from "@/lib/google-merchant/sync-catalogue";

/**
 * Schemas for the controlled catalogue synchronisation endpoints.
 *
 * Every response is parsed through a strict object before it is sent, so no
 * ProductInput payload, description, image array, database row, access token or
 * raw Google resource can leak — only the identifiers a human needs to reason
 * about the plan.
 */
export const SYNC_APPLY_CONFIRMATION = "SYNC_FTT_GOOGLE_MERCHANT_BATCH" as const;

/** Strict: any unexpected key is rejected rather than ignored. */
export const applySyncRequestSchema = z.strictObject({
  confirm: z.literal(SYNC_APPLY_CONFIRMATION),
  limit: z.number().int().min(1).max(MAX_SYNC_BATCH_SIZE),
});

export const SYNC_RESYNC_CONFIRMATION =
  "RESYNC_FTT_GOOGLE_MERCHANT_PRODUCT" as const;

export const resyncRequestSchema = z.strictObject({
  confirm: z.literal(SYNC_RESYNC_CONFIRMATION),
  productId: z.string().uuid(),
});

export const resyncResponseSchema = z.strictObject({
  resynced: z.literal(true),
  productId: z.string(),
  offerId: z.string(),
  productInputName: z.string(),
  processedProductName: z.string(),
  merchantImages: z.strictObject({
    primary: z.string(),
    additionalCount: z.number().int(),
  }),
});

export const syncActionSchema = z.strictObject({
  productId: z.string(),
  offerId: z.string(),
  slug: z.string().nullable(),
  name: z.string().nullable(),
  action: z.enum(SYNC_ACTIONS),
  reason: z.string().nullable(),
});

export const syncPreviewResponseSchema = z.strictObject({
  summary: z.strictObject({
    localPublished: z.number().int(),
    localReady: z.number().int(),
    googleManaged: z.number().int(),
    alreadyPresent: z.number().int(),
    insert: z.number().int(),
    update: z.number().int(),
    deleteCandidates: z.number().int(),
    conflicts: z.number().int(),
  }),
  actions: z.array(syncActionSchema),
});

const syncedProductSchema = z.strictObject({
  productId: z.string(),
  offerId: z.string(),
  productInputName: z.string(),
  processedProductName: z.string(),
});

export const syncApplySuccessSchema = z.strictObject({
  applied: z.literal(true),
  requestedLimit: z.number().int(),
  attempted: z.number().int(),
  succeeded: z.number().int(),
  remainingInsertCandidates: z.number().int(),
  products: z.array(syncedProductSchema),
});

export const syncApplyFailureSchema = z.strictObject({
  applied: z.literal(false),
  requestedLimit: z.number().int(),
  attempted: z.number().int(),
  succeeded: z.number().int(),
  failedProductId: z.string(),
  error: z.strictObject({ code: z.string(), message: z.string() }),
  products: z.array(syncedProductSchema),
});

export const syncStatusEntrySchema = z.strictObject({
  offerId: z.string(),
  title: z.string().nullable(),
  availability: z.string().nullable(),
  price: z
    .strictObject({ amountMicros: z.string(), currencyCode: z.string() })
    .nullable(),
  status: z.enum(MERCHANT_PRODUCT_STATUSES),
  destinationStatuses: z.array(
    z.strictObject({
      reportingContext: z.string(),
      approvedCountries: z.array(z.string()),
      pendingCountries: z.array(z.string()),
      disapprovedCountries: z.array(z.string()),
    }),
  ),
  itemLevelIssues: z.array(
    z.strictObject({
      code: z.string(),
      severity: z.string(),
      attribute: z.string().nullable(),
      reportingContext: z.string().nullable(),
      description: z.string().nullable(),
      applicableCountries: z.array(z.string()),
    }),
  ),
});

export const syncStatusResponseSchema = z.strictObject({
  summary: z.strictObject({
    managedProducts: z.number().int(),
    byStatus: z.record(z.enum(MERCHANT_PRODUCT_STATUSES), z.number().int()),
  }),
  products: z.array(syncStatusEntrySchema),
});
