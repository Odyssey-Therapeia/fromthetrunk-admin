/**
 * Google Merchant catalogue readiness routes (Phase 2A).
 *
 * GET /api/v2/integrations/google-merchant/catalogue-readiness
 * GET /api/v2/integrations/google-merchant/catalogue-readiness.csv
 *
 * READ-ONLY: two SELECTs, no writes, no Google call, no product mutation. That
 * is why there is no kill switch and no production gate here — unlike the
 * register and test-insert endpoints, this one cannot change anything. It is
 * still admin-only, because the catalogue and its gaps are not public.
 *
 * No business logic lives here: the route delegates to
 * `lib/google-merchant/audit-catalogue.ts` and sanitises the output.
 */

import { createRoute, OpenAPIHono } from "@hono/zod-openapi";

import { requireAdmin } from "@/api/hono/middleware/auth";
import { merchantCatalogueReadinessResponseSchema } from "@/api/hono/schemas/google-merchant-catalogue";
import type { HonoBindings } from "@/api/hono/types";
import { runMerchantCatalogueAudit } from "@/lib/google-merchant/audit-catalogue";
import type { MerchantCatalogueAuditResult } from "@/lib/google-merchant/audit-catalogue";
import { toMerchantAuditCsv } from "@/lib/google-merchant/catalogue-readiness";
import { GoogleMerchantError } from "@/lib/google-merchant/config";
import { errorResponse } from "@/lib/http/error-response";
import { createLogger } from "@/lib/log";

const log = createLogger("hono:google-merchant-catalogue");

export type GoogleMerchantCatalogueRouteDeps = {
  /** Injected in tests; defaults to the real read-only audit. */
  runAudit?: () => Promise<MerchantCatalogueAuditResult>;
};

/**
 * Strip the audit down to its publishable shape.
 *
 * `audits[].productInput` — the ProductInput Phase 2B will submit — is
 * deliberately dropped: it is internal, and the strict schema would reject it.
 */
const toResponseBody = (audit: MerchantCatalogueAuditResult) =>
  merchantCatalogueReadinessResponseSchema.parse({
    products: audit.audits.map((entry) => entry.report),
    summary: audit.summary,
  });

const failed = () =>
  errorResponse(
    500,
    "The catalogue readiness audit could not be completed.",
    "CATALOGUE_AUDIT_FAILED",
  );

export const registerGoogleMerchantCatalogueRoutes = (
  app: OpenAPIHono<HonoBindings>,
  deps: GoogleMerchantCatalogueRouteDeps = {},
) => {
  const runAudit = deps.runAudit ?? runMerchantCatalogueAudit;

  app.openapi(
    createRoute({
      method: "get",
      path: "/catalogue-readiness",
      description:
        "Read-only audit of every published product against the validated " +
        "Google Merchant ProductInput mapper. Performs no Google call and no " +
        "database write. Admin only.",
      responses: {
        200: { description: "Catalogue readiness report" },
        401: { description: "Unauthorized" },
        403: { description: "Forbidden" },
        500: { description: "Audit failed" },
      },
      summary: "Audit catalogue readiness for Google Merchant",
      tags: ["Integrations"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      try {
        const audit = await runAudit();

        log.info("Catalogue readiness audit completed", {
          adminId: adminOrResponse.id,
          blocked: audit.summary.blocked,
          publishedProducts: audit.summary.publishedProducts,
          ready: audit.summary.ready,
        });

        return c.json(toResponseBody(audit), 200);
      } catch (error) {
        log.error("Catalogue readiness audit failed", {
          code:
            error instanceof GoogleMerchantError
              ? error.code
              : "CATALOGUE_AUDIT_FAILED",
        });

        return failed();
      }
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/catalogue-readiness.csv",
      description:
        "The same read-only audit as /catalogue-readiness, as CSV. Admin only.",
      responses: {
        200: { description: "Catalogue readiness report (CSV)" },
        401: { description: "Unauthorized" },
        403: { description: "Forbidden" },
        500: { description: "Audit failed" },
      },
      summary: "Audit catalogue readiness for Google Merchant (CSV)",
      tags: ["Integrations"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      try {
        const audit = await runAudit();

        // Serialised from the SAME sanitised reports the JSON endpoint emits.
        const csv = toMerchantAuditCsv(toResponseBody(audit).products);

        return new Response(csv, {
          headers: {
            "Content-Disposition":
              'attachment; filename="ftt-merchant-catalogue-readiness.csv"',
            "Content-Type": "text/csv; charset=utf-8",
          },
          status: 200,
        });
      } catch (error) {
        log.error("Catalogue readiness audit failed", {
          code:
            error instanceof GoogleMerchantError
              ? error.code
              : "CATALOGUE_AUDIT_FAILED",
        });

        return failed();
      }
    },
  );
};
