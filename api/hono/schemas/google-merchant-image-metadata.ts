import { z } from "@hono/zod-openapi";

import { MAX_METADATA_BATCH_SIZE } from "@/lib/google-merchant/image-metadata-backfill";

/**
 * Schemas for the media metadata backfill.
 *
 * Responses are parsed through strict objects before sending, so no media URL,
 * storage key, alt text or database row can leak — only counts, media ids and
 * sanitised failure codes.
 */
export const IMAGE_METADATA_APPLY_CONFIRMATION =
  "BACKFILL_FTT_MERCHANT_IMAGE_METADATA" as const;

export const imageMetadataApplyRequestSchema = z.strictObject({
  confirm: z.literal(IMAGE_METADATA_APPLY_CONFIRMATION),
  limit: z.number().int().min(1).max(MAX_METADATA_BATCH_SIZE),
  afterMediaId: z.string().nullable().optional(),
});

export const imageMetadataPreviewResponseSchema = z.strictObject({
  summary: z.strictObject({
    referencedMedia: z.number().int(),
    missingDimensions: z.number().int(),
    knownOversizedFiles: z.number().int(),
    unsupportedMimeTypes: z.number().int(),
    alreadyComplete: z.number().int(),
  }),
  examples: z.array(
    z.strictObject({
      mediaId: z.string(),
      filename: z.string(),
      missingDimensions: z.boolean(),
      filesize: z.number().int().nullable(),
      mimeType: z.string().nullable(),
    }),
  ),
});

export const imageMetadataApplyResponseSchema = z.strictObject({
  applied: z.literal(true),
  attempted: z.number().int(),
  updated: z.number().int(),
  failed: z.number().int(),
  failures: z.array(
    z.strictObject({
      mediaId: z.string(),
      code: z.string(),
      message: z.string(),
    }),
  ),
  nextAfterMediaId: z.string().nullable(),
  hasMore: z.boolean(),
});
