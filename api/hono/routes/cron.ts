import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { and, eq, isNotNull, lt } from "drizzle-orm";

import type { HonoBindings } from "@/api/hono/types";
import { db } from "@/db";
import { expireReservations } from "@/db/queries/reservations";
import { sendReservationExpiryReminders } from "@/db/queries/reservation-reminders";
import { upsertChannelMetric } from "@/db/queries/channel-metrics";
import { getChannelMetrics, getEventCounts } from "@/db/queries/control-centre";
import { products } from "@/db/schema";
import { verifyBearerSecret } from "@/lib/http/verify-secret";
import { emitAnalyticsEvent } from "@/lib/analytics/emit";
import { pullAllMetrics } from "@/lib/ports/channel-metrics";
import { composeDashboard } from "@/lib/control-centre/compose-dashboard";
import { sendEmail } from "@/lib/email/send";
import { getOrderNotificationRecipients } from "@/lib/email/recipients";
import { weeklyOpsDigestEmail } from "@/lib/email/templates";
import { createLogger } from "@/lib/log";

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
          500
        );
      }

      const authHeader = c.req.header("authorization") ?? null;
      if (!verifyBearerSecret(authHeader, cronSecret)) {
        return c.json(
          {
            code: "UNAUTHORIZED",
            message: "Invalid cron secret.",
          },
          401
        );
      }

      const expiredRows = await db
        .select({ id: products.id })
        .from(products)
        .where(
          and(
            eq(products.stockStatus, "reserved"),
            isNotNull(products.reservedUntil),
            lt(products.reservedUntil, new Date())
          )
        );

      if (expiredRows.length > 0) {
        await db
          .update(products)
          .set({
            reservedUntil: null,
            stockStatus: "available",
            // Dual-write: restore quantity_available to 1 when reservation expires
            quantityAvailable: 1,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(products.stockStatus, "reserved"),
              isNotNull(products.reservedUntil),
              lt(products.reservedUntil, new Date())
            )
          );
      }

      // Fire-and-forget: reservation_expired event per expired product.
      // emitAnalyticsEvent() never throws; errors are caught + logged inside.
      const expiredAt = new Date();
      for (const row of expiredRows) {
        void emitAnalyticsEvent({
          event_id: crypto.randomUUID(),
          type: "reservation_expired",
          payload: { productId: row.id },
          occurredAt: expiredAt,
        });
      }

      // Dual-write: also expire reservation table rows (always runs, flag-agnostic)
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
        200
      );
    }
  );

  // ── P5-04: Refresh channel metrics cache ──────────────────────────────────

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
          500
        );
      }

      const authHeader = c.req.header("authorization") ?? null;
      if (!verifyBearerSecret(authHeader, cronSecret)) {
        return c.json(
          {
            code: "UNAUTHORIZED",
            message: "Invalid cron secret.",
          },
          401
        );
      }

      // Pull all 4 adapters in parallel — error-isolated, never throws.
      const metrics = await pullAllMetrics();

      const fetchedAt = new Date();

      // Upsert each adapter's metrics into channel_metrics.
      // Each upsert is wrapped individually so a DB failure on one does NOT
      // block the others (mirrors the analytics-sink fire-and-forget isolation).
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

      const adapterNames = ["searchConsole", "ga4Data", "vercelInsights", "metaMarketing"] as const;

      for (let i = 0; i < upsertResults.length; i++) {
        const result = upsertResults[i];
        const name = adapterNames[i]!;
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
        200
      );
    }
  );

  // ── P5-07: Reservation-expiry reminder emails ─────────────────────────────

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
          500
        );
      }

      const authHeader = c.req.header("authorization") ?? null;
      if (!verifyBearerSecret(authHeader, cronSecret)) {
        return c.json(
          {
            code: "UNAUTHORIZED",
            message: "Invalid cron secret.",
          },
          401
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
        200
      );
    }
  );

  // ── P6-07: Weekly ops digest email ───────────────────────────────────────

  app.openapi(
    createRoute({
      method: "get",
      path: "/weekly-ops-digest",
      responses: {
        200: {
          description: "Weekly operations digest email sent (or skipped on send error)",
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
          500
        );
      }

      const authHeader = c.req.header("authorization") ?? null;
      if (!verifyBearerSecret(authHeader, cronSecret)) {
        return c.json(
          {
            code: "UNAUTHORIZED",
            message: "Invalid cron secret.",
          },
          401
        );
      }

      // Compose the REAL dashboard from live data (both functions never throw).
      const [channelMetrics, eventCounts] = await Promise.all([
        getChannelMetrics(),
        getEventCounts(),
      ]);

      const dashboard = composeDashboard({
        ga4: channelMetrics.ga4,
        searchConsole: channelMetrics.searchConsole,
        vercelInsights: channelMetrics.vercelInsights,
        metaMarketing: channelMetrics.metaMarketing,
        eventCounts,
      });

      const { subject, html } = weeklyOpsDigestEmail(dashboard);
      const recipients = getOrderNotificationRecipients();

      // Fire-and-forget: a failing send does NOT crash the cron.
      // Returns 200 regardless — the send failure is logged but not propagated.
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
        200
      );
    }
  );
};
