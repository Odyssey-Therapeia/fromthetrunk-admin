import { z } from "@hono/zod-openapi";

import {
  TEST_INSERT_PRODUCT_ID,
  TEST_INSERT_PRODUCT_SLUG,
} from "@/lib/google-merchant/product-input";

/**
 * Schemas for the single controlled Google Merchant product insertion.
 *
 * Both fields are literals: this endpoint exists to insert ONE known product
 * once. Anything else — another product id, a near-miss confirmation phrase, an
 * extra property — is rejected before the service is reached.
 */
export const INSERT_PRODUCT_CONFIRMATION =
  "INSERT_TANGERINE_NOIR_INTO_GOOGLE_MERCHANT" as const;

export { TEST_INSERT_PRODUCT_ID, TEST_INSERT_PRODUCT_SLUG };

/** Strict: any unexpected key is rejected rather than ignored. */
export const insertTestProductRequestSchema = z.strictObject({
  productId: z.literal(TEST_INSERT_PRODUCT_ID),
  confirm: z.literal(INSERT_PRODUCT_CONFIRMATION),
});

export type InsertTestProductRequest = z.infer<
  typeof insertTestProductRequestSchema
>;

/**
 * The ONLY fields the endpoint is allowed to emit on success.
 *
 * The handler parses its response body through this schema before sending it,
 * so no part of the Google payload, the product row, the image metadata or any
 * credential material can reach the client by accident.
 *
 * `inserted: true` means Google ACCEPTED THE INPUT. It does not assert that the
 * offer is approved, served or eligible for free listings.
 */
export const insertTestProductResponseSchema = z.strictObject({
  inserted: z.literal(true),
  productId: z.string(),
  offerId: z.string(),
  productInputName: z.string(),
  processedProductName: z.string(),
});

export type InsertTestProductResponse = z.infer<
  typeof insertTestProductResponseSchema
>;
