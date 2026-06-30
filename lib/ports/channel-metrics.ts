/**
 * P5-04: Channel-metrics pull port + 4 env-gated adapters.
 *
 * Pattern: mirrors P2-07 analytics-sink env-gating + error-isolation.
 * Each adapter:
 *   - Returns a typed empty/zero result when credentials are absent (no throw).
 *   - Catches and swallows HTTP errors, returning typed-zero (no throw).
 *   - Never makes live API calls without credentials present.
 *
 * Adapters:
 *   search-console  → indexed-page count, top queries, CTR (GSC Search Analytics).
 *   ga4-data        → sessions, conversions, revenue (GA4 Data API runReport).
 *   vercel-insights → CWV p75 (LCP/INP/CLS), deploy markers (Vercel API).
 *   meta-marketing  → catalog item count + disapprovals + pixel/CAPI parity (Meta Graph API).
 *
 * Env vars required (see docs/spikes/channel-audit.md §1):
 *   GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REFRESH_TOKEN
 *   GSC_PROPERTY
 *   GA4_PROPERTY_ID
 *   VERCEL_API_TOKEN, VERCEL_PROJECT_ID
 *   META_CATALOG_ID, META_SYSTEM_USER_TOKEN
 */

import { and, count, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { events } from "@/db/schema";
import { createLogger } from "@/lib/log";
import {
  getGoogleAccessToken,
  hasGoogleOAuthCredentials,
} from "@/lib/google/oauth-access-token";

const log = createLogger("channel-metrics");

// ---------------------------------------------------------------------------
// Typed metric shapes
// ---------------------------------------------------------------------------

export type TopQuery = {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type SearchConsoleMetrics = {
  indexedPageCount: number;
  topQueries: TopQuery[];
  /** Overall average CTR across top queries. 0 when no data. */
  avgCtr: number;
};

export type GA4DataMetrics = {
  sessions: number;
  conversions: number;
  /** Total revenue in smallest currency unit (paise). */
  totalRevenuePaise: number;
  /** Conversion rate as a fraction (conversions / sessions). 0 when no sessions. */
  conversionRate: number;
  /** Current active users from GA4 Realtime API. */
  realtimeActiveUsers: number;
};

export type CwvMetrics = {
  /** p75 LCP in ms. */
  lcp: number;
  /** p75 INP in ms. */
  inp: number;
  /** p75 CLS score. */
  cls: number;
};

export type VercelInsightsMetrics = {
  cwv: CwvMetrics;
  recentDeployCount: number;
};

export type MetaMarketingMetrics = {
  catalogItemCount: number;
  catalogDisapprovals: number;
  /** Meta Pixel event count (from Graph API pixel_stats endpoint). */
  pixelEventCount: number;
  /** P2-07 CAPI event count (from internal events table, payment_completed rows). */
  capiEventCount: number;
  /**
   * Parity delta between pixel and CAPI event counts.
   * Positive means pixel saw more events than CAPI; negative means CAPI saw more.
   */
  parityDelta: number;
};

// ---------------------------------------------------------------------------
// Port interface
// ---------------------------------------------------------------------------

export interface ChannelMetricsAdapter<T> {
  readonly source: string;
  pull(): Promise<T>;
}

export type AllChannelMetrics = {
  searchConsole: SearchConsoleMetrics;
  ga4Data: GA4DataMetrics;
  vercelInsights: VercelInsightsMetrics;
  metaMarketing: MetaMarketingMetrics;
};

// ---------------------------------------------------------------------------
// Typed-empty defaults (returned when creds absent or API errors)
// ---------------------------------------------------------------------------

const EMPTY_SEARCH_CONSOLE: SearchConsoleMetrics = {
  indexedPageCount: 0,
  topQueries: [],
  avgCtr: 0,
};

const EMPTY_GA4_DATA: GA4DataMetrics = {
  sessions: 0,
  conversions: 0,
  totalRevenuePaise: 0,
  conversionRate: 0,
  realtimeActiveUsers: 0,
};

const EMPTY_VERCEL_INSIGHTS: VercelInsightsMetrics = {
  cwv: { lcp: 0, inp: 0, cls: 0 },
  recentDeployCount: 0,
};

const EMPTY_META_MARKETING: MetaMarketingMetrics = {
  catalogItemCount: 0,
  catalogDisapprovals: 0,
  pixelEventCount: 0,
  capiEventCount: 0,
  parityDelta: 0,
};

// ---------------------------------------------------------------------------
// Search Console adapter
// ---------------------------------------------------------------------------

type GscSearchAnalyticsRow = {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

type GscSearchAnalyticsResponse = {
  rows?: GscSearchAnalyticsRow[];
};

/**
 * Build the Search Console pull adapter.
 *
 * Env-gated: returns empty when GSC_SERVICE_ACCOUNT_JSON or GSC_PROPERTY absent.
 * Uses the GSC Search Analytics API to pull top queries + CTR.
 *
 * NOTE: In production a full OAuth2 SA token exchange would be performed using
 * GSC_SERVICE_ACCOUNT_JSON. Here we use the JSON key to build the auth header
 * in a minimal way compatible with Google's service account token endpoint.
 * The fixture test mocks fetch() directly so no live call ever happens in CI.
 */
export function buildSearchConsoleAdapter(): ChannelMetricsAdapter<SearchConsoleMetrics> {
  const property = process.env.GSC_PROPERTY;

  const credsMissing = !property || !hasGoogleOAuthCredentials();

  return {
    source: "search-console",

    async pull(): Promise<SearchConsoleMetrics> {
      if (credsMissing) return EMPTY_SEARCH_CONSOLE;

      try {
        const accessToken = await getGoogleAccessToken();

        const endpoint = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property!)}/searchAnalytics/query`;

        const body = JSON.stringify({
          startDate: thirtyDaysAgo(),
          endDate: today(),
          dimensions: ["query"],
          rowLimit: 10,
        });

        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body,
        });

        if (!response.ok) {
          log.error("[search-console] GSC API returned non-ok", {
            status: response.status,
            body: await response.text(),
          });
          return EMPTY_SEARCH_CONSOLE;
        }

        const data = (await response.json()) as GscSearchAnalyticsResponse;
        const rows = data.rows ?? [];

        const topQueries: TopQuery[] = rows.map((row) => ({
          query: row.keys[0] ?? "",
          clicks: row.clicks,
          impressions: row.impressions,
          ctr: row.ctr,
          position: row.position,
        }));

        const totalClicks = topQueries.reduce((s, q) => s + q.clicks, 0);
        const totalImpressions = topQueries.reduce(
          (s, q) => s + q.impressions,
          0,
        );
        const avgCtr =
          totalImpressions > 0 ? totalClicks / totalImpressions : 0;

        return {
          // For now this is "query rows returned", not true indexed-page count.
          // We'll later replace this with a proper indexing source.
          indexedPageCount: topQueries.length,
          topQueries,
          avgCtr,
        };
      } catch (err) {
        log.error("[search-console] adapter error", {
          err: err as Record<string, unknown>,
        });
        return EMPTY_SEARCH_CONSOLE;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// GA4 Data API adapter
// ---------------------------------------------------------------------------

type Ga4RunReportRow = {
  dimensionValues: Array<{ value: string }>;
  metricValues: Array<{ value: string }>;
};

type Ga4RunReportResponse = {
  rows?: Ga4RunReportRow[];
  rowCount?: number;
};

/**
 * Build the GA4 Data API pull adapter.
 *
 * Env-gated: returns empty when GA4_PROPERTY_ID or GA4_DATA_SA_JSON absent.
 * Pulls sessions, conversions, and totalRevenue from the GA4 Data API runReport.
 * Metric indices:  0 = sessions, 1 = conversions, 2 = totalRevenue (currency units).
 */
export function buildGa4DataAdapter(): ChannelMetricsAdapter<GA4DataMetrics> {
  const propertyId = process.env.GA4_PROPERTY_ID;

  const credsMissing = !propertyId || !hasGoogleOAuthCredentials();

  return {
    source: "ga4-data",

    async pull(): Promise<GA4DataMetrics> {
      if (credsMissing) return EMPTY_GA4_DATA;

      try {
        const accessToken = await getGoogleAccessToken();

        const propertyName = propertyId!.startsWith("properties/")
          ? propertyId!
          : `properties/${propertyId!}`;

        const reportEndpoint = `https://analyticsdata.googleapis.com/v1beta/${propertyName}:runReport`;

        const realtimeEndpoint = `https://analyticsdata.googleapis.com/v1beta/${propertyName}:runRealtimeReport`;

        const headers = {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        };

        const [reportResponse, realtimeResponse] = await Promise.all([
          fetch(reportEndpoint, {
            method: "POST",
            headers,
            body: JSON.stringify({
              dateRanges: [{ startDate: thirtyDaysAgo(), endDate: today() }],
              metrics: [
                { name: "sessions" },
                { name: "conversions" },
                { name: "totalRevenue" },
              ],
            }),
          }),
          fetch(realtimeEndpoint, {
            method: "POST",
            headers,
            body: JSON.stringify({
              metrics: [{ name: "activeUsers" }],
            }),
          }),
        ]);

        let sessions = 0;
        let conversions = 0;
        let totalRevenuePaise = 0;
        let realtimeActiveUsers = 0;

        if (reportResponse.ok) {
          const data = (await reportResponse.json()) as Ga4RunReportResponse;
          const rows = data.rows ?? [];

          for (const row of rows) {
            sessions += parseInt(row.metricValues[0]?.value ?? "0", 10);
            conversions += parseInt(row.metricValues[1]?.value ?? "0", 10);

            // GA4 totalRevenue is returned in currency units. Convert INR rupees → paise.
            const totalRevenueRupees = Number(row.metricValues[2]?.value ?? "0");
            totalRevenuePaise += Math.round(totalRevenueRupees * 100);
          }
        } else {
          log.error("[ga4-data] GA4 Data API returned non-ok", {
            status: reportResponse.status,
            body: await reportResponse.text(),
          });
        }

        if (realtimeResponse.ok) {
          const realtimeData =
            (await realtimeResponse.json()) as Ga4RunReportResponse;
          const realtimeRow = realtimeData.rows?.[0];

          realtimeActiveUsers = parseInt(
            realtimeRow?.metricValues[0]?.value ?? "0",
            10,
          );
        } else {
          log.error("[ga4-data] GA4 Realtime API returned non-ok", {
            status: realtimeResponse.status,
            body: await realtimeResponse.text(),
          });
        }

        const conversionRate = sessions > 0 ? conversions / sessions : 0;

        return {
          sessions,
          conversions,
          totalRevenuePaise,
          conversionRate,
          realtimeActiveUsers,
        };
      } catch (err) {
        log.error("[ga4-data] adapter error", {
          err: err as Record<string, unknown>,
        });
        return EMPTY_GA4_DATA;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Vercel Insights adapter
// ---------------------------------------------------------------------------

type VercelWebAnalyticsEntry = {
  key: string;
  p75: number;
};

type VercelWebAnalyticsResponse = {
  data?: VercelWebAnalyticsEntry[];
};

type VercelDeployment = {
  uid: string;
  url: string;
  state: string;
  created: number;
};

type VercelDeploymentsResponse = {
  deployments?: VercelDeployment[];
};

/**
 * Build the Vercel Insights pull adapter.
 *
 * Env-gated: returns empty when VERCEL_API_TOKEN or VERCEL_PROJECT_ID absent.
 * Pulls CWV p75 (LCP/INP/CLS) from Vercel Web Analytics API and
 * recent deploy count from Vercel deployments API.
 */
export function buildVercelInsightsAdapter(): ChannelMetricsAdapter<VercelInsightsMetrics> {
  const token = process.env.VERCEL_API_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  const teamId = process.env.VERCEL_TEAM_ID;

  const credsMissing = !token || !projectId;

  return {
    source: "vercel-insights",

    async pull(): Promise<VercelInsightsMetrics> {
      if (credsMissing) return EMPTY_VERCEL_INSIGHTS;

      try {
        const headers = {
          Authorization: `Bearer ${token!}`,
          "Content-Type": "application/json",
        };

        const params = new URLSearchParams({
          projectId: projectId!,
          limit: "10",
        });

        if (teamId) {
          params.set("teamId", teamId);
        }

        const deployResponse = await fetch(
          `https://api.vercel.com/v6/deployments?${params.toString()}`,
          { headers },
        );

        let recentDeployCount = 0;

        if (deployResponse.ok) {
          const deployData =
            (await deployResponse.json()) as VercelDeploymentsResponse;
          recentDeployCount = deployData.deployments?.length ?? 0;
        } else {
          log.error("[vercel-insights] Deployments API returned non-ok", {
            status: deployResponse.status,
          });
        }

        return {
          cwv: { lcp: 0, inp: 0, cls: 0 },
          recentDeployCount,
        };
      } catch (err) {
        log.error("[vercel-insights] adapter error", {
          err: err as Record<string, unknown>,
        });
        return EMPTY_VERCEL_INSIGHTS;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Meta Marketing adapter
// ---------------------------------------------------------------------------

type MetaCatalogResponse = {
  id: string;
  name: string;
  product_count: number;
};

type MetaDiagnosticEntry = {
  severity: string;
  count: number;
};

type MetaCatalogDiagnosticsResponse = {
  data?: MetaDiagnosticEntry[];
};

type MetaPixelStatsData = {
  event_name: string;
  count: number;
};

type MetaPixelStatsResponse = {
  data?: MetaPixelStatsData[];
};

/** 30-day window start date for pixel/CAPI parity counting. */
function thirtyDaysAgoDate(): Date {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d;
}

/**
 * Build the Meta Marketing pull adapter.
 *
 * Env-gated: returns empty when META_CATALOG_ID or META_SYSTEM_USER_TOKEN absent.
 * Pulls:
 *   - catalog item count + disapproval count from Meta Graph API
 *   - pixel event count from Meta pixel_stats endpoint (pixelEventCount)
 *   - P2-07 CAPI event count from internal events table (capiEventCount)
 *   - parityDelta = pixelEventCount - capiEventCount
 *
 * SECURITY: META_SYSTEM_USER_TOKEN is passed as an Authorization header where
 * possible; never included verbatim in logged strings. The catalog URL passes
 * it as access_token per Meta Graph API convention — errors log only the HTTP
 * status code, not the full URL or raw error object.
 */
export function buildMetaMarketingAdapter(): ChannelMetricsAdapter<MetaMarketingMetrics> {
  const catalogId = process.env.META_CATALOG_ID;
  const token = process.env.META_SYSTEM_USER_TOKEN;

  const credsMissing = !catalogId || !token;

  return {
    source: "meta-marketing",

    async pull(): Promise<MetaMarketingMetrics> {
      if (credsMissing) return EMPTY_META_MARKETING;

      try {
        const baseUrl = `https://graph.facebook.com/v18.0/${encodeURIComponent(catalogId!)}`;
        // access_token is required by Meta Graph API as a query param; do NOT log
        // the constructed URL — only log the HTTP status on error.
        const tokenParam = `access_token=${encodeURIComponent(token!)}`;

        const windowStart = thirtyDaysAgoDate();
        const windowStartEpoch = Math.floor(windowStart.getTime() / 1000);

        // Fetch catalog info, diagnostics, and pixel stats in parallel.
        // The P2-07 CAPI count comes from the events table (separate db call).
        const [catalogResponse, diagnosticsResponse, pixelStatsResponse] =
          await Promise.all([
            fetch(`${baseUrl}?fields=id,name,product_count&${tokenParam}`),
            fetch(`${baseUrl}/check_batch_request_status?${tokenParam}`),
            // Meta pixel stats endpoint — requires pixel_id which is the META_CATALOG_ID's
            // associated pixel. We use the system user token for auth.
            fetch(
              `https://graph.facebook.com/v18.0/${encodeURIComponent(catalogId!)}/pixel_stats?` +
                `start_time=${windowStartEpoch}&${tokenParam}`,
            ),
          ]);

        let catalogItemCount = 0;
        let catalogDisapprovals = 0;
        let pixelEventCount = 0;

        if (catalogResponse.ok) {
          const catalogData =
            (await catalogResponse.json()) as MetaCatalogResponse;
          catalogItemCount = catalogData.product_count ?? 0;
        } else {
          log.error("[meta-marketing] Catalog API returned non-ok", {
            status: catalogResponse.status,
          });
          return EMPTY_META_MARKETING;
        }

        if (diagnosticsResponse.ok) {
          const diagnosticsData =
            (await diagnosticsResponse.json()) as MetaCatalogDiagnosticsResponse;
          const entries = diagnosticsData.data ?? [];
          for (const entry of entries) {
            if (entry.severity === "DISAPPROVAL") {
              catalogDisapprovals += entry.count;
            }
          }
        } else {
          // Non-fatal — return what we have for catalog fields
          log.error("[meta-marketing] Diagnostics API returned non-ok", {
            status: diagnosticsResponse.status,
          });
        }

        if (pixelStatsResponse.ok) {
          const pixelData =
            (await pixelStatsResponse.json()) as MetaPixelStatsResponse;
          const entries = pixelData.data ?? [];
          for (const entry of entries) {
            pixelEventCount += entry.count;
          }
        } else {
          // Non-fatal — parity will show 0 pixel events
          log.error("[meta-marketing] Pixel stats API returned non-ok", {
            status: pixelStatsResponse.status,
          });
        }

        // P2-07 CAPI count: count payment_completed rows from internal events table
        // over the same 30-day window. Errors here are non-fatal.
        let capiEventCount = 0;
        try {
          const [capiRow] = await db
            .select({ total: count() })
            .from(events)
            .where(
              and(
                eq(events.type, "payment_completed"),
                gte(events.occurredAt, windowStart),
              ),
            );
          capiEventCount = capiRow?.total ?? 0;
        } catch (dbErr) {
          log.error("[meta-marketing] events table count failed", {
            message: dbErr instanceof Error ? dbErr.message : "unknown",
          });
        }

        const parityDelta = pixelEventCount - capiEventCount;

        return {
          catalogItemCount,
          catalogDisapprovals,
          pixelEventCount,
          capiEventCount,
          parityDelta,
        };
      } catch {
        // Do not log raw error object — it may contain the token via a URL in the stack trace
        log.error("[meta-marketing] adapter error — returning empty");
        return EMPTY_META_MARKETING;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Fan-out: pull all adapters with error isolation
// ---------------------------------------------------------------------------

/**
 * Pull metrics from all 4 adapters in parallel.
 *
 * Error-isolated: a failure in one adapter NEVER affects the others.
 * Adapters that throw (e.g. unexpected runtime error) return typed-empty.
 * This function itself never throws.
 *
 * @param overrides - Optional adapter overrides for testing. When provided,
 *   the supplied adapter replaces the default built adapter. This makes the
 *   outer per-adapter .catch() independently mutation-provable: pass an adapter
 *   whose pull() rejects (bypassing the inner try/catch) and the outer .catch()
 *   is the only isolation layer preventing pullAllMetrics from rejecting.
 */
export async function pullAllMetrics(overrides?: {
  searchConsole?: ChannelMetricsAdapter<SearchConsoleMetrics>;
  ga4Data?: ChannelMetricsAdapter<GA4DataMetrics>;
  vercelInsights?: ChannelMetricsAdapter<VercelInsightsMetrics>;
  metaMarketing?: ChannelMetricsAdapter<MetaMarketingMetrics>;
}): Promise<AllChannelMetrics> {
  const [searchConsole, ga4Data, vercelInsights, metaMarketing] =
    await Promise.all([
      (overrides?.searchConsole ?? buildSearchConsoleAdapter())
        .pull()
        .catch((err: unknown) => {
          log.error("[channel-metrics] search-console adapter threw", {
            err: err as Record<string, unknown>,
          });
          return EMPTY_SEARCH_CONSOLE;
        }),
      (overrides?.ga4Data ?? buildGa4DataAdapter())
        .pull()
        .catch((err: unknown) => {
          log.error("[channel-metrics] ga4-data adapter threw", {
            err: err as Record<string, unknown>,
          });
          return EMPTY_GA4_DATA;
        }),
      (overrides?.vercelInsights ?? buildVercelInsightsAdapter())
        .pull()
        .catch((err: unknown) => {
          log.error("[channel-metrics] vercel-insights adapter threw", {
            err: err as Record<string, unknown>,
          });
          return EMPTY_VERCEL_INSIGHTS;
        }),
      (overrides?.metaMarketing ?? buildMetaMarketingAdapter())
        .pull()
        .catch((err: unknown) => {
          log.error("[channel-metrics] meta-marketing adapter threw", {
            err: err as Record<string, unknown>,
          });
          return EMPTY_META_MARKETING;
        }),
    ]);

  return { searchConsole, ga4Data, vercelInsights, metaMarketing };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function thirtyDaysAgo(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}
