/**
 * Media metadata backfill routes (Phase 2A.2).
 *
 * GET  /api/v2/integrations/google-merchant/image-metadata/preview
 *   — Admin-only, READ-ONLY. One SELECT; no HTTP probing, no write, no
 *     Merchant call, so it needs no kill switch and no production gate.
 *
 * POST /api/v2/integrations/google-merchant/image-metadata/apply
 *   — Admin-only, production-only, 404 unless
 *     GOOGLE_MERCHANT_IMAGE_METADATA_BACKFILL_ENABLED === "true". Probes a
 *     bounded page of media and writes ONLY machine-derived metadata. Never
 *     calls the Merchant API.
 *
 * No business logic here: the routes validate, delegate to
 * `lib/google-merchant/image-metadata-backfill.ts` and sanitise the output.
 */

import { createRoute, OpenAPIHono } from "@hono/zod-openapi";

import { requireAdmin } from "@/api/hono/middleware/auth";
import {
  IMAGE_METADATA_APPLY_CONFIRMATION,
  imageMetadataApplyRequestSchema,
  imageMetadataApplyResponseSchema,
  imageMetadataPreviewResponseSchema,
} from "@/api/hono/schemas/google-merchant-image-metadata";
import type { HonoBindings } from "@/api/hono/types";
import {
  MAX_METADATA_BATCH_SIZE,
  applyMerchantImageMetadataBackfill,
  previewMerchantImageMetadata,
} from "@/lib/google-merchant/image-metadata-backfill";
import type {
  MediaMetadataApplyResult,
  MediaMetadataPreview,
} from "@/lib/google-merchant/image-metadata-backfill";
import {
  GoogleMerchantError,
  isGoogleMerchantImageMetadataBackfillEnabled,
  isProductionRuntime,
} from "@/lib/google-merchant/config";
import { errorResponse } from "@/lib/http/error-response";
import { createLogger } from "@/lib/log";

const log = createLogger("hono:google-merchant-image-metadata");

export type GoogleMerchantImageMetadataRouteDeps = {
  previewMetadata?: () => Promise<MediaMetadataPreview>;
  applyMetadata?: (options: {
    limit: number;
    afterMediaId: null | string;
  }) => Promise<MediaMetadataApplyResult>;
};

/** Identical body for "disabled" and "not production" — no oracle. */
const notFound = () => errorResponse(404, "Not found.", "NOT_FOUND");

const failed = (message: string) =>
  errorResponse(500, message, "IMAGE_METADATA_FAILED");

export const registerGoogleMerchantImageMetadataRoutes = (
  app: OpenAPIHono<HonoBindings>,
  deps: GoogleMerchantImageMetadataRouteDeps = {},
) => {
  const previewMetadata = deps.previewMetadata ?? previewMerchantImageMetadata;
  const applyMetadata = deps.applyMetadata ?? applyMerchantImageMetadataBackfill;

  app.openapi(
    createRoute({
      method: "get",
      path: "/image-metadata/preview",
      description:
        "Read-only summary of media metadata completeness for product images. " +
        "One SELECT; no remote probing, no write, no Google call. Admin only.",
      responses: {
        200: { description: "Media metadata summary with example rows" },
        401: { description: "Unauthorized" },
        403: { description: "Forbidden" },
        500: { description: "Preview failed" },
      },
      summary: "Preview media metadata completeness",
      tags: ["Integrations"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      try {
        const preview = await previewMetadata();

        return c.json(imageMetadataPreviewResponseSchema.parse(preview), 200);
      } catch (error) {
        log.error("Media metadata preview failed", {
          code:
            error instanceof GoogleMerchantError
              ? error.code
              : "IMAGE_METADATA_FAILED",
        });

        return failed("The media metadata preview could not be completed.");
      }
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/image-metadata/apply",
      description:
        `Probe a bounded page of product media and persist width, height, ` +
        `filesize and mimeType. Admin-only, production-only, disabled unless ` +
        `GOOGLE_MERCHANT_IMAGE_METADATA_BACKFILL_ENABLED="true". Body: ` +
        `{"confirm":"${IMAGE_METADATA_APPLY_CONFIRMATION}","limit":${MAX_METADATA_BATCH_SIZE},` +
        `"afterMediaId":null}. Resume with the returned nextAfterMediaId.`,
      responses: {
        200: { description: "Page processed (with per-item failures, if any)" },
        400: { description: "Missing or invalid confirmation / limit" },
        401: { description: "Unauthorized" },
        403: { description: "Forbidden" },
        404: { description: "Endpoint unavailable" },
        500: { description: "Backfill failed" },
      },
      summary: "Apply one page of the media metadata backfill",
      tags: ["Integrations"],
    }),
    async (c) => {
      // Kill switch and production gate, before any auth work so the endpoint
      // behaves exactly like a route that does not exist.
      if (
        !isGoogleMerchantImageMetadataBackfillEnabled() ||
        !isProductionRuntime()
      ) {
        return notFound();
      }

      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const rawBody = await c.req.json().catch(() => null);
      const parsed = imageMetadataApplyRequestSchema.safeParse(rawBody);

      if (!parsed.success) {
        return errorResponse(
          400,
          `Request body must be {"confirm":"${IMAGE_METADATA_APPLY_CONFIRMATION}","limit":<1-${MAX_METADATA_BATCH_SIZE}>,"afterMediaId":<id|null>}.`,
          "INVALID_REQUEST",
        );
      }

      try {
        const result = await applyMetadata({
          afterMediaId: parsed.data.afterMediaId ?? null,
          limit: parsed.data.limit,
        });

        log.info("Media metadata backfill page applied", {
          adminId: adminOrResponse.id,
          failed: result.failed,
          updated: result.updated,
        });

        return c.json(imageMetadataApplyResponseSchema.parse(result), 200);
      } catch (error) {
        if (error instanceof GoogleMerchantError) {
          log.error("Media metadata backfill failed", { code: error.code });
          return errorResponse(error.status, error.message, error.code);
        }

        log.error("Media metadata backfill failed", {
          code: "IMAGE_METADATA_FAILED",
        });

        return failed("The media metadata backfill could not be completed.");
      }
    },
  );
};
