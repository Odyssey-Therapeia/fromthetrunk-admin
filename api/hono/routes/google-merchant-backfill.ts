/**
 * Controlled catalogue attribute backfill routes (Phase 2A.1).
 *
 * POST /api/v2/integrations/google-merchant/catalogue-backfill/preview
 *   — Admin-only DRY RUN. Never writes, so it needs no kill switch and no
 *     production gate; it reports against whichever database the deployment is
 *     configured to use.
 *
 * POST /api/v2/integrations/google-merchant/catalogue-backfill/apply
 *   — Admin-only, production-only, and 404 unless
 *     GOOGLE_MERCHANT_CATALOGUE_BACKFILL_ENABLED === "true". Writes ONLY absent
 *     `products.attributes` keys; never a Merchant API call.
 *
 * No business logic lives here: both routes delegate to
 * `lib/google-merchant/apply-catalogue-backfill.ts` and sanitise the output.
 */

import { createRoute, OpenAPIHono } from "@hono/zod-openapi";

import { requireAdmin } from "@/api/hono/middleware/auth";
import {
  APPLY_BACKFILL_CONFIRMATION,
  PREVIEW_BACKFILL_CONFIRMATION,
  applyBackfillRequestSchema,
  applyBackfillResponseSchema,
  previewBackfillRequestSchema,
  previewBackfillResponseSchema,
} from "@/api/hono/schemas/google-merchant-backfill";
import type { HonoBindings } from "@/api/hono/types";
import {
  applyMerchantCatalogueBackfill,
  previewMerchantCatalogueBackfill,
} from "@/lib/google-merchant/apply-catalogue-backfill";
import type { MerchantBackfillApplyResult } from "@/lib/google-merchant/apply-catalogue-backfill";
import type { CatalogueBackfillPlan } from "@/lib/google-merchant/catalogue-backfill";
import {
  GoogleMerchantError,
  isGoogleMerchantCatalogueBackfillEnabled,
  isProductionRuntime,
} from "@/lib/google-merchant/config";
import { errorResponse } from "@/lib/http/error-response";
import { createLogger } from "@/lib/log";

const log = createLogger("hono:google-merchant-backfill");

export type GoogleMerchantBackfillRouteDeps = {
  /** Injected in tests; default to the real read-only / writing services. */
  previewBackfill?: () => Promise<CatalogueBackfillPlan>;
  applyBackfill?: () => Promise<MerchantBackfillApplyResult>;
};

/** Identical body for "disabled" and "not production" — no oracle. */
const notFound = () => errorResponse(404, "Not found.", "NOT_FOUND");

const invalidConfirmation = (phrase: string) =>
  errorResponse(
    400,
    `Request body must be {"confirm":"${phrase}"}.`,
    "INVALID_CONFIRMATION",
  );

export const registerGoogleMerchantBackfillRoutes = (
  app: OpenAPIHono<HonoBindings>,
  deps: GoogleMerchantBackfillRouteDeps = {},
) => {
  const previewBackfill =
    deps.previewBackfill ?? previewMerchantCatalogueBackfill;
  const applyBackfill = deps.applyBackfill ?? applyMerchantCatalogueBackfill;

  app.openapi(
    createRoute({
      method: "post",
      path: "/catalogue-backfill/preview",
      description:
        `Dry run of the catalogue attribute backfill. Reads only — no write, ` +
        `no Google call. Admin only. Body: {"confirm":"${PREVIEW_BACKFILL_CONFIRMATION}"}.`,
      responses: {
        200: { description: "Proposed changes and manual-review products" },
        400: { description: "Missing or invalid confirmation" },
        401: { description: "Unauthorized" },
        403: { description: "Forbidden" },
        500: { description: "Preview failed" },
      },
      summary: "Preview the Google Merchant catalogue attribute backfill",
      tags: ["Integrations"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const rawBody = await c.req.json().catch(() => null);
      if (!previewBackfillRequestSchema.safeParse(rawBody).success) {
        return invalidConfirmation(PREVIEW_BACKFILL_CONFIRMATION);
      }

      try {
        const plan = await previewBackfill();

        log.info("Catalogue backfill previewed", {
          adminId: adminOrResponse.id,
          productsWouldChange: plan.summary.productsWouldChange,
        });

        return c.json(previewBackfillResponseSchema.parse(plan), 200);
      } catch (error) {
        log.error("Catalogue backfill preview failed", {
          code:
            error instanceof GoogleMerchantError
              ? error.code
              : "CATALOGUE_BACKFILL_FAILED",
        });

        return errorResponse(
          500,
          "The catalogue backfill preview could not be completed.",
          "CATALOGUE_BACKFILL_FAILED",
        );
      }
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/catalogue-backfill/apply",
      description:
        `Apply the catalogue attribute backfill. Admin-only, production-only, ` +
        `disabled unless GOOGLE_MERCHANT_CATALOGUE_BACKFILL_ENABLED="true". ` +
        `Writes only absent product attributes; makes no Google call. ` +
        `Body: {"confirm":"${APPLY_BACKFILL_CONFIRMATION}"}.`,
      responses: {
        200: { description: "Backfill applied, with readiness recomputed" },
        400: { description: "Missing or invalid confirmation" },
        401: { description: "Unauthorized" },
        403: { description: "Forbidden" },
        404: { description: "Endpoint unavailable" },
        409: { description: "Catalogue state changed since the preview" },
        500: { description: "Backfill failed" },
        502: { description: "A write failed; the run stopped" },
      },
      summary: "Apply the Google Merchant catalogue attribute backfill",
      tags: ["Integrations"],
    }),
    async (c) => {
      // Kill switch and production gate, before any auth work so the endpoint
      // behaves exactly like a route that does not exist.
      if (
        !isGoogleMerchantCatalogueBackfillEnabled() ||
        !isProductionRuntime()
      ) {
        return notFound();
      }

      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const rawBody = await c.req.json().catch(() => null);
      if (!applyBackfillRequestSchema.safeParse(rawBody).success) {
        return invalidConfirmation(APPLY_BACKFILL_CONFIRMATION);
      }

      try {
        const result = await applyBackfill();

        log.info("Catalogue backfill applied", {
          adminId: adminOrResponse.id,
          fieldsWritten: result.fieldsWritten,
          productsChanged: result.productsChanged,
        });

        return c.json(applyBackfillResponseSchema.parse(result), 200);
      } catch (error) {
        if (error instanceof GoogleMerchantError) {
          log.error("Catalogue backfill failed", { code: error.code });
          return errorResponse(error.status, error.message, error.code);
        }

        log.error("Catalogue backfill failed", {
          code: "CATALOGUE_BACKFILL_FAILED",
        });

        return errorResponse(
          500,
          "The catalogue backfill could not be completed.",
          "CATALOGUE_BACKFILL_FAILED",
        );
      }
    },
  );
};
