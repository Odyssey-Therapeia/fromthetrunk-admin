import { z } from "@hono/zod-openapi";

import {
  MERCHANT_AUDIT_REASON_CODES,
  MERCHANT_READINESS_STATES,
} from "@/lib/google-merchant/catalogue-readiness";

/**
 * Response schemas for the read-only catalogue-readiness audit.
 *
 * Strict objects: the handler parses every product report through this schema
 * before responding, so no database row, image record, credential or internally
 * built ProductInput can leak into the response by accident.
 */
export const merchantProductReadinessSchema = z.strictObject({
  productId: z.string(),
  slug: z.string(),
  name: z.string(),
  status: z.string(),
  stockStatus: z.enum(["available", "reserved", "sold"]),
  merchantReadiness: z.enum(MERCHANT_READINESS_STATES),
  missingFields: z.array(z.string()),
  reasons: z.array(z.enum(MERCHANT_AUDIT_REASON_CODES)),
});

export const merchantCatalogueReadinessSummarySchema = z.strictObject({
  publishedProducts: z.number().int(),
  ready: z.number().int(),
  blocked: z.number().int(),
  byReason: z.record(z.enum(MERCHANT_READINESS_STATES), z.number().int()),
  byReasonCode: z.record(z.enum(MERCHANT_AUDIT_REASON_CODES), z.number().int()),
});

export const merchantCatalogueReadinessResponseSchema = z.strictObject({
  summary: merchantCatalogueReadinessSummarySchema,
  products: z.array(merchantProductReadinessSchema),
});

export type MerchantCatalogueReadinessResponse = z.infer<
  typeof merchantCatalogueReadinessResponseSchema
>;
