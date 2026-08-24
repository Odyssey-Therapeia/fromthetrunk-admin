import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { and, eq, isNotNull, lt } from "drizzle-orm";

import type { HonoBindings } from "@/api/hono/types";
import { db } from "@/db";
import { upsertChannelMetric } from "@/db/queries/channel-metrics";
import {
  getChannelMetrics,
  getCommerceMetrics,
  getDiscoveryMovers,
  getEventCounts,
  getTopMovers,
} from "@/db/queries/control-centre";
import { expireReservations } from "@/db/queries/reservations";
import { sendReservationExpiryReminders } from "@/db/queries/reservation-reminders";
import { products } from "@/db/schema";
import { emitAnalyticsEvent } from "@/lib/analytics/emit";
import { composeDashboard } from "@/lib/control-centre/compose-dashboard";
import {
  GoogleMerchantError,
  isGoogleMerchantInventorySyncEnabled,
} from "@/lib/google-merchant/config";
import { reconcileMerchantInventory } from "@/lib/google-merchant/reconcile-inventory";
import { releaseProductReservations } from "@/lib/inventory/release-reservation";
import { getOrderNotificationRecipients } from "@/lib/email/recipients";
import { sendEmail } from "@/lib/email/send";
import { weeklyOpsDigestEmail } from "@/lib/email/templates";
import { verifyBearerSecret } from "@/lib/http/verify-secret";
import { createLogger } from "@/lib/log";
import { pullAllMetrics } from "@/lib/ports/channel-metrics";

const log = createLogger("cron:channel-metrics");

export const registerCronRoutes = (app: OpenAPIHono<HonoBindings>) => {
  app.openapi(
    createRoute({
      method: "get",
      path: "/release-reservations",
      responses: {
        200: {
          description: "Released expired reservations",
        },
      },
      tags: ["Cron"],
    }),
    async (c) => {
      const cronSecret = process.env.CRON_SECRET;
      if (!cronSecret) {
        return c.json(
          {
            code: "CRON_SECRET_MISSING",
            message: "CRON_SECRET is not configured.",
          },
          500,
        );
      }

      const authHeader = c.req.header("authorization") ?? null;
      if (!verifyBearerSecret(authHeader, cronSecret)) {
        return c.json(
          {
            code: "UNAUTHORIZED",
            message: "Invalid cron secret.",
          },
          401,
        );
      }

      const expiredRows = await db
        .select({ id: products.id })
        .from(products)
        .where(
          and(
            eq(products.stockStatus, "reserved"),
            isNotNull(products.reservedUntil),
            lt(products.reservedUntil, new Date()),
          ),
        );

      // Canonical release for exactly the rows the SELECT found expired.
      await releaseProductReservations({
        productIds: expiredRows.map((row) => row.id),
      });

      const expiredAt = new Date();
      for (const row of expiredRows) {
        void emitAnalyticsEvent({
          event_id: crypto.randomUUID(),
          type: "reservation_expired",
          payload: { productId: row.id },
          occurredAt: expiredAt,
        });
      }

      const now = new Date();
      const { deleted: reservationsDeleted } = await expireReservations(now);

      return c.json(
        {
          checked: expiredRows.length,
          ok: true,
          released: expiredRows.length,
          reservationsExpired: reservationsDeleted,
          timestamp: new Date().toISOString(),
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/refresh-channel-metrics",
      responses: {
        200: {
          description: "Channel metrics refreshed and cached",
        },
        401: {
          description: "Unauthorized — invalid or missing cron secret",
        },
        500: {
          description: "CRON_SECRET not configured",
        },
      },
      tags: ["Cron"],
    }),
    async (c) => {
      const cronSecret = process.env.CRON_SECRET;
      if (!cronSecret) {
        return c.json(
          {
            code: "CRON_SECRET_MISSING",
            message: "CRON_SECRET is not configured.",
          },
          500,
        );
      }

      const authHeader = c.req.header("authorization") ?? null;
      if (!verifyBearerSecret(authHeader, cronSecret)) {
        return c.json(
          {
            code: "UNAUTHORIZED",
            message: "Invalid cron secret.",
          },
          401,
        );
      }

      const metrics = await pullAllMetrics();

      const fetchedAt = new Date();

      const adapterStatus: Record<string, string> = {};

      const upsertResults = await Promise.allSettled([
        upsertChannelMetric({
          source: "search-console",
          metricKey: "metrics",
          value: metrics.searchConsole as unknown as Record<string, unknown>,
          fetchedAt,
        }),
        upsertChannelMetric({
          source: "ga4-data",
          metricKey: "metrics",
          value: metrics.ga4Data as unknown as Record<string, unknown>,
          fetchedAt,
        }),
        upsertChannelMetric({
          source: "vercel-insights",
          metricKey: "metrics",
          value: metrics.vercelInsights as unknown as Record<string, unknown>,
          fetchedAt,
        }),
        upsertChannelMetric({
          source: "meta-marketing",
          metricKey: "metrics",
          value: metrics.metaMarketing as unknown as Record<string, unknown>,
          fetchedAt,
        }),
      ]);

      const adapterNames = [
        "searchConsole",
        "ga4Data",
        "vercelInsights",
        "metaMarketing",
      ] as const;

      for (let index = 0; index < upsertResults.length; index += 1) {
        const result = upsertResults[index];
        const name = adapterNames[index]!;

        if (result.status === "fulfilled") {
          adapterStatus[name] = "ok";
        } else {
          adapterStatus[name] = "error";
          log.error("[channel-metrics cron] upsert failed", {
            adapter: name,
            err: result.reason as Record<string, unknown>,
          });
        }
      }

      return c.json(
        {
          ok: true,
          adapters: adapterStatus,
          timestamp: fetchedAt.toISOString(),
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/send-reservation-expiry-reminders",
      responses: {
        200: {
          description:
            "Sent reservation-expiry reminder emails to eligible abandoned checkouts",
        },
        401: {
          description: "Unauthorized — invalid or missing cron secret",
        },
        500: {
          description: "CRON_SECRET not configured",
        },
      },
      tags: ["Cron"],
    }),
    async (c) => {
      const cronSecret = process.env.CRON_SECRET;
      if (!cronSecret) {
        return c.json(
          {
            code: "CRON_SECRET_MISSING",
            message: "CRON_SECRET is not configured.",
          },
          500,
        );
      }

      const authHeader = c.req.header("authorization") ?? null;
      if (!verifyBearerSecret(authHeader, cronSecret)) {
        return c.json(
          {
            code: "UNAUTHORIZED",
            message: "Invalid cron secret.",
          },
          401,
        );
      }

      const result = await sendReservationExpiryReminders();

      return c.json(
        {
          ok: true,
          sent: result.sent,
          skippedSold: result.skippedSold,
          skippedNoEmail: result.skippedNoEmail,
          errors: result.errors,
          timestamp: new Date().toISOString(),
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/weekly-ops-digest",
      responses: {
        200: {
          description:
            "Weekly operations digest email sent (or skipped on send error)",
        },
        401: {
          description: "Unauthorized — invalid or missing cron secret",
        },
        500: {
          description: "CRON_SECRET not configured",
        },
      },
      tags: ["Cron"],
    }),
    async (c) => {
      const cronSecret = process.env.CRON_SECRET;
      if (!cronSecret) {
        return c.json(
          {
            code: "CRON_SECRET_MISSING",
            message: "CRON_SECRET is not configured.",
          },
          500,
        );
      }

      const authHeader = c.req.header("authorization") ?? null;
      if (!verifyBearerSecret(authHeader, cronSecret)) {
        return c.json(
          {
            code: "UNAUTHORIZED",
            message: "Invalid cron secret.",
          },
          401,
        );
      }

      const [
        channelMetrics,
        eventCounts,
        commerce,
        topMovers,
        discoveryMovers,
      ] = await Promise.all([
        getChannelMetrics(),
        getEventCounts(),
        getCommerceMetrics(),
        getTopMovers(),
        getDiscoveryMovers(),
      ]);

      const dashboard = composeDashboard({
        ga4: channelMetrics.ga4,
        searchConsole: channelMetrics.searchConsole,
        vercelInsights: channelMetrics.vercelInsights,
        metaMarketing: channelMetrics.metaMarketing,
        eventCounts,
        commerce,
        topMovers,
        discoveryMovers,
      });

      const { subject, html } = weeklyOpsDigestEmail(dashboard);
      const recipients = getOrderNotificationRecipients();

      let emailOk = false;
      try {
        emailOk = await sendEmail({ to: recipients, subject, html });
      } catch (err) {
        log.error("[weekly-ops-digest cron] sendEmail threw", {
          err: err as Record<string, unknown>,
        });
      }

      return c.json(
        {
          ok: true,
          emailSent: emailOk,
          recipients,
          timestamp: new Date().toISOString(),
        },
        200,
      );
    },
  );

  /**
   * Google Merchant inventory reconciliation.
   *
   * State-based and idempotent: every run re-derives the desired Merchant state
   * from CURRENT Neon data, so there is no queue and a missed run costs latency
   * rather than correctness. It reads local inventory and Google's product
   * list, and writes ONLY to Google — never to the database.
   *
   * Two independent gates: the shared CRON_SECRET bearer, and the dedicated
   * GOOGLE_MERCHANT_INVENTORY_SYNC_ENABLED switch. With the switch off the run
   * still reports what it WOULD do and performs zero Merchant writes, matching
   * how every other cron here answers 200 with a summary.
   *
   * Deliberately NOT gated by GOOGLE_MERCHANT_CATALOGUE_SYNC_ENABLED: that
   * switch guards the manual bootstrap endpoints and stays off in production.
   */
  app.openapi(
    createRoute({
      method: "get",
      path: "/reconcile-google-merchant-inventory",
      responses: {
        200: {
          description:
            "Merchant inventory reconciled (or skipped when the switch is off)",
        },
        401: {
          description: "Unauthorized — invalid or missing cron secret",
        },
        500: {
          description: "CRON_SECRET not configured",
        },
      },
      tags: ["Cron"],
    }),
    async (c) => {
      const cronSecret = process.env.CRON_SECRET;
      if (!cronSecret) {
        return c.json(
          {
            code: "CRON_SECRET_MISSING",
            message: "CRON_SECRET is not configured.",
          },
          500,
        );
      }

      const authHeader = c.req.header("authorization") ?? null;
      if (!verifyBearerSecret(authHeader, cronSecret)) {
        return c.json(
          {
            code: "UNAUTHORIZED",
            message: "Invalid cron secret.",
          },
          401,
        );
      }

      const enabled = isGoogleMerchantInventorySyncEnabled();

      try {
        const result = await reconcileMerchantInventory({ enabled });

        return c.json(
          {
            ok: true,
            ...result,
            timestamp: new Date().toISOString(),
          },
          200,
        );
      } catch (error) {
        // A Google outage must never make the cron look like a platform error,
        // and nothing local has changed — the next run simply retries.
        log.error("[merchant-inventory cron] reconciliation failed", {
          code:
            error instanceof GoogleMerchantError
              ? error.code
              : "RECONCILIATION_FAILED",
        });

        return c.json(
          {
            ok: false,
            code: "RECONCILIATION_FAILED",
            enabled,
            message: "The Merchant inventory reconciliation could not run.",
            timestamp: new Date().toISOString(),
          },
          200,
        );
      }
    },
  );
};
