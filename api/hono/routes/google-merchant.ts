/**
 * Google Merchant integration routes.
 *
 * POST /api/v2/integrations/google-merchant/register
 *   — Performs the mandatory ONE-TIME Merchant API `developerRegistration:registerGcp`
 *     call for the `ftt-merchant-integration` GCP project.
 *
 * Gates, in order (each one fails closed):
 *   1. `GOOGLE_MERCHANT_REGISTRATION_ENABLED === "true"` — kill switch. Unset it
 *      again once the registration has succeeded; the route then 404s.
 *   2. Production runtime only (the Workload Identity Provider trusts only the
 *      production OIDC subject).
 *   3. Admin authentication via the shared `requireAdmin` helper.
 *   4. Exact confirmation phrase in the JSON body.
 *
 * Gates 1 and 2 return an indistinguishable 404 so the endpoint is invisible —
 * and gives away nothing about the kill switch — while it is disabled.
 *
 * This route contains NO business logic: it validates, delegates to
 * `lib/google-merchant/register-gcp.ts` and sanitises the response. It never
 * touches the database and never returns tokens, credential configuration or
 * stack traces.
 */

import { createRoute, OpenAPIHono } from "@hono/zod-openapi";

import { requireAdmin } from "@/api/hono/middleware/auth";
import {
  REGISTER_GCP_CONFIRMATION,
  registerGcpRequestSchema,
  registerGcpResponseSchema,
} from "@/api/hono/schemas/google-merchant";
import type { HonoBindings } from "@/api/hono/types";
import {
  GoogleMerchantError,
  isGoogleMerchantRegistrationEnabled,
  isProductionRuntime,
} from "@/lib/google-merchant/config";
import { registerGoogleMerchantGcpProject } from "@/lib/google-merchant/register-gcp";
import type { GoogleMerchantRegistrationResult } from "@/lib/google-merchant/register-gcp";
import { errorResponse } from "@/lib/http/error-response";
import { createLogger } from "@/lib/log";

const log = createLogger("hono:google-merchant");

export type GoogleMerchantRouteDeps = {
  /** Injected in tests; defaults to the real registration service. */
  registerGcpProject?: () => Promise<GoogleMerchantRegistrationResult>;
};

/** Identical body for "disabled" and "not production" — no oracle. */
const notFound = () => errorResponse(404, "Not found.", "NOT_FOUND");

export const registerGoogleMerchantRoutes = (
  app: OpenAPIHono<HonoBindings>,
  deps: GoogleMerchantRouteDeps = {},
) => {
  const registerGcpProject =
    deps.registerGcpProject ?? registerGoogleMerchantGcpProject;

  app.openapi(
    createRoute({
      method: "post",
      path: "/register",
      description:
        `One-time Merchant API developer registration. Admin-only, production-only, ` +
        `disabled unless GOOGLE_MERCHANT_REGISTRATION_ENABLED="true". ` +
        `Requires the JSON body {"confirm":"${REGISTER_GCP_CONFIRMATION}"}.`,
      responses: {
        200: { description: "GCP project registered with Merchant Center" },
        400: { description: "Missing or invalid confirmation phrase" },
        401: { description: "Unauthorized" },
        403: { description: "Forbidden" },
        404: { description: "Registration endpoint is not available" },
        429: { description: "Google rate-limited the request" },
        500: { description: "Registration failed" },
        502: { description: "Google Merchant API rejected the request" },
      },
      summary: "Register the GCP project with Google Merchant Center",
      tags: ["Integrations"],
    }),
    async (c) => {
      // 1 + 2 — kill switch and production gate, before any auth work so the
      // endpoint behaves exactly like a route that does not exist.
      if (!isGoogleMerchantRegistrationEnabled() || !isProductionRuntime()) {
        return notFound();
      }

      // 3 — admin only.
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      // 4 — exact confirmation phrase. Parsed by hand (rather than through the
      // OpenAPI request validator) so validation cannot run ahead of the gates
      // above and so the 400 body stays sanitised.
      const rawBody = await c.req.json().catch(() => null);
      const parsedBody = registerGcpRequestSchema.safeParse(rawBody);

      if (!parsedBody.success) {
        return errorResponse(
          400,
          `Request body must be {"confirm":"${REGISTER_GCP_CONFIRMATION}"}.`,
          "INVALID_CONFIRMATION",
        );
      }

      try {
        const result = await registerGcpProject();

        log.info("Merchant Center developer registration completed", {
          adminId: adminOrResponse.id,
          alreadyRegistered: result.alreadyRegistered,
        });

        // Re-parsed through the strict response schema: only whitelisted fields
        // can leave this handler.
        const body = registerGcpResponseSchema.parse({
          registered: true,
          name: result.name,
          gcpIds: result.gcpIds,
          alreadyRegistered: result.alreadyRegistered,
        });

        return c.json(body, 200);
      } catch (error) {
        if (error instanceof GoogleMerchantError) {
          log.error("Merchant Center developer registration failed", {
            code: error.code,
            upstreamStatus: error.upstreamStatus,
          });

          return errorResponse(error.status, error.message, error.code);
        }

        // Unknown failure: log the namespace only — an arbitrary error's
        // message/stack could quote credential material.
        log.error("Merchant Center developer registration failed", {
          code: "REGISTRATION_FAILED",
        });

        return errorResponse(
          500,
          "The registration request could not be completed.",
          "REGISTRATION_FAILED",
        );
      }
    },
  );
};
