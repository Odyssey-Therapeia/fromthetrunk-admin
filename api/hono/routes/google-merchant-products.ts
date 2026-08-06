/**
 * Google Merchant product routes.
 *
 * POST /api/v2/integrations/google-merchant/products/test-insert
 *   — Inserts ONE known product into Merchant Center via
 *     `productInputs:insert`. Not a catalogue sync: the product id and the
 *     confirmation phrase are both literals.
 *
 * Gates, in order (each one fails closed):
 *   1. `GOOGLE_MERCHANT_TEST_INSERT_ENABLED === "true"` — kill switch. Turn it
 *      off again once the controlled insertion has been made; the route 404s.
 *   2. Production runtime only (the Workload Identity Provider trusts only the
 *      production OIDC subject).
 *   3. Admin authentication via the shared `requireAdmin` helper.
 *   4. Exact product id + confirmation phrase, no extra properties.
 *
 * Gates 1 and 2 return an indistinguishable 404 so the endpoint is invisible —
 * and gives away nothing about the kill switch — while it is disabled.
 *
 * This route contains NO business logic: it validates, delegates to
 * `lib/google-merchant/insert-product.ts` and sanitises the response. It never
 * queries the database itself and never returns tokens, credential
 * configuration, database rows, raw Google payloads or stack traces.
 */

import { createRoute, OpenAPIHono } from "@hono/zod-openapi";

import { requireAdmin } from "@/api/hono/middleware/auth";
import {
  INSERT_PRODUCT_CONFIRMATION,
  TEST_INSERT_PRODUCT_ID,
  insertTestProductRequestSchema,
  insertTestProductResponseSchema,
} from "@/api/hono/schemas/google-merchant-product";
import type { HonoBindings } from "@/api/hono/types";
import {
  GoogleMerchantError,
  GoogleMerchantProductDataError,
  isGoogleMerchantTestInsertEnabled,
  isProductionRuntime,
} from "@/lib/google-merchant/config";
import { insertGoogleMerchantTestProduct } from "@/lib/google-merchant/insert-product";
import type { GoogleMerchantInsertResult } from "@/lib/google-merchant/insert-product";
import { errorResponse } from "@/lib/http/error-response";
import { createLogger } from "@/lib/log";

const log = createLogger("hono:google-merchant-products");

export type GoogleMerchantProductRouteDeps = {
  /** Injected in tests; defaults to the real insertion service. */
  insertTestProduct?: (productId: string) => Promise<GoogleMerchantInsertResult>;
};

/** Identical body for "disabled" and "not production" — no oracle. */
const notFound = () => errorResponse(404, "Not found.", "NOT_FOUND");

export const registerGoogleMerchantProductRoutes = (
  app: OpenAPIHono<HonoBindings>,
  deps: GoogleMerchantProductRouteDeps = {},
) => {
  const insertTestProduct =
    deps.insertTestProduct ?? insertGoogleMerchantTestProduct;

  app.openapi(
    createRoute({
      method: "post",
      path: "/test-insert",
      description:
        `Single controlled Merchant Center product insertion. Admin-only, ` +
        `production-only, disabled unless GOOGLE_MERCHANT_TEST_INSERT_ENABLED="true". ` +
        `Requires the JSON body {"productId":"${TEST_INSERT_PRODUCT_ID}",` +
        `"confirm":"${INSERT_PRODUCT_CONFIRMATION}"}. A 200 means Google accepted ` +
        `the product input, not that the offer is approved or serving.`,
      responses: {
        200: { description: "Google accepted the product input" },
        400: { description: "Missing or invalid product id / confirmation" },
        401: { description: "Unauthorized" },
        403: { description: "Forbidden" },
        404: { description: "Endpoint unavailable, or product not found" },
        409: { description: "The product is not in an insertable state" },
        422: { description: "The product data is incomplete or unusable" },
        429: { description: "Google rate-limited the request" },
        500: { description: "Insertion failed" },
        502: { description: "Google Merchant API rejected the request" },
      },
      summary: "Insert the controlled test product into Merchant Center",
      tags: ["Integrations"],
    }),
    async (c) => {
      // 1 + 2 — kill switch and production gate, before any auth work so the
      // endpoint behaves exactly like a route that does not exist.
      if (!isGoogleMerchantTestInsertEnabled() || !isProductionRuntime()) {
        return notFound();
      }

      // 3 — admin only.
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      // 4 — exact product id and confirmation phrase. Parsed by hand (rather
      // than through the OpenAPI request validator) so validation cannot run
      // ahead of the gates above and so the 400 body stays sanitised.
      const rawBody = await c.req.json().catch(() => null);
      const parsedBody = insertTestProductRequestSchema.safeParse(rawBody);

      if (!parsedBody.success) {
        return errorResponse(
          400,
          `Request body must be {"productId":"${TEST_INSERT_PRODUCT_ID}","confirm":"${INSERT_PRODUCT_CONFIRMATION}"}.`,
          "INVALID_REQUEST",
        );
      }

      try {
        const result = await insertTestProduct(parsedBody.data.productId);

        log.info("Merchant Center product input accepted", {
          adminId: adminOrResponse.id,
          productId: parsedBody.data.productId,
        });

        // Re-parsed through the strict response schema: only whitelisted fields
        // can leave this handler.
        const body = insertTestProductResponseSchema.parse({
          inserted: true,
          offerId: result.offerId,
          processedProductName: result.processedProductName,
          productId: result.productId,
          productInputName: result.productInputName,
        });

        return c.json(body, 200);
      } catch (error) {
        // Incomplete product data is the one failure that carries a payload —
        // OUR field names, so an admin knows what to fill in. No database
        // internals, no credential material, no stack trace.
        if (error instanceof GoogleMerchantProductDataError) {
          log.error("Merchant Center product data incomplete", {
            code: error.code,
            missingFields: error.missingFields,
          });

          return c.json(
            {
              code: error.code,
              message: error.message,
              missingFields: error.missingFields,
            },
            422,
          );
        }

        if (error instanceof GoogleMerchantError) {
          log.error("Merchant Center product insertion failed", {
            code: error.code,
            upstreamStatus: error.upstreamStatus,
          });

          return errorResponse(error.status, error.message, error.code);
        }

        // Unknown failure: log the code only — an arbitrary error's
        // message/stack could quote credential material or a database row.
        log.error("Merchant Center product insertion failed", {
          code: "PRODUCT_INSERT_FAILED",
        });

        return errorResponse(
          500,
          "The product insertion could not be completed.",
          "PRODUCT_INSERT_FAILED",
        );
      }
    },
  );
};
