/**
 * P5-04: Channel-metrics pull adapters + refresh-channel-metrics cron.
 *
 * Tests:
 *   ADAPTERS: each adapter parses a realistic FIXTURE into the typed metric.
 *             Creds-absent → typed-empty/zero, no throw.
 *   ERROR ISOLATION: one adapter throwing must NOT break the cron or others.
 *   CRON: CRON_SECRET-gated (401 without, 200 with). Calls adapters + upserts.
 *
 * DETERMINISM NOTES:
 *   - fetch stub is established in beforeEach (not at module level) so it does
 *     not leak across worker-process shared global state between parallel files.
 *   - vi.unstubAllEnvs() is NOT called in afterEach — env vars are only set via
 *     vi.stubEnv() inside individual tests; Vitest isolates stubs per-test when
 *     using vi.stubEnv(), so cross-test env races are avoided.
 *   - The fetch global is restored via vi.unstubAllGlobals() in afterEach so
 *     the stub does not outlive this file's execution in the same worker.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

// Mock the DB at the lowest level — intercept the drizzle insert + select chains.
// insert chain:  db.insert(t).values(v).onConflictDoUpdate(o)
// select chain:  db.select({...}).from(t).where(c)
const dbInsertMock = vi.hoisted(() => vi.fn());
const dbValuesMock = vi.hoisted(() => vi.fn());
const onConflictDoUpdateMock = vi.hoisted(() => vi.fn());

// select chain
const dbSelectMock = vi.hoisted(() => vi.fn());
const selectFromMock = vi.hoisted(() => vi.fn());
const selectWhereMock = vi.hoisted(() => vi.fn());

vi.mock("@/db", () => ({
  db: {
    insert: dbInsertMock,
    select: dbSelectMock,
  },
}));

// Logger — suppress noise, capture errors
const logErrorMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/log", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: logErrorMock,
  }),
}));

// fetch is stubbed in beforeEach (not here at module level) to prevent
// global state leaks between parallel test files in the same worker.
const fetchMock = vi.hoisted(() => vi.fn());

// ---------------------------------------------------------------------------
// Imports (after mocks are registered)
// ---------------------------------------------------------------------------

import {
  buildSearchConsoleAdapter,
  buildGa4DataAdapter,
  buildVercelInsightsAdapter,
  buildMetaMarketingAdapter,
  pullAllMetrics,
} from "@/lib/ports/channel-metrics";
import { channelMetrics } from "@/db/schema";
import { registerCronRoutes } from "@/api/hono/routes/cron";
import { OpenAPIHono } from "@hono/zod-openapi";
import type { HonoBindings } from "@/api/hono/types";

// ---------------------------------------------------------------------------
// Fixtures — realistic API responses for each adapter
// ---------------------------------------------------------------------------

const GSC_SEARCH_ANALYTICS_FIXTURE = {
  responseAggregationType: "byPage",
  rows: [
    { keys: ["from the trunk saree"], clicks: 102, impressions: 3500, ctr: 0.029, position: 2.1 },
    { keys: ["preloved silk saree buy"], clicks: 67, impressions: 2100, ctr: 0.032, position: 1.9 },
    { keys: ["from the trunk"], clicks: 55, impressions: 1200, ctr: 0.046, position: 3.8 },
  ],
};

const GA4_RUNREPORT_FIXTURE = {
  rows: [
    {
      dimensionValues: [{ value: "Organic Search" }],
      metricValues: [{ value: "1240" }, { value: "23" }, { value: "1850000" }],
    },
    {
      dimensionValues: [{ value: "Direct" }],
      metricValues: [{ value: "430" }, { value: "12" }, { value: "620000" }],
    },
  ],
  rowCount: 2,
  metricHeaders: [
    { name: "sessions", type: "TYPE_INTEGER" },
    { name: "conversions", type: "TYPE_INTEGER" },
    { name: "totalRevenue", type: "TYPE_CURRENCY" },
  ],
};

const VERCEL_DEPLOYMENTS_FIXTURE = {
  deployments: [
    { uid: "dpl_abc", url: "fromthetrunk-abc.vercel.app", state: "READY", created: 1718000000000 },
    { uid: "dpl_def", url: "fromthetrunk-def.vercel.app", state: "READY", created: 1717900000000 },
  ],
};

const VERCEL_WEB_ANALYTICS_FIXTURE = {
  data: [
    { key: "lcp", p75: 2450 },
    { key: "inp", p75: 180 },
    { key: "cls", p75: 0.08 },
  ],
};

const META_CATALOG_FIXTURE = {
  id: "catalog-123",
  name: "FTT Preloved Sarees",
  product_count: 47,
};

const META_CATALOG_DIAGNOSTICS_FIXTURE = {
  data: [
    { severity: "DISAPPROVAL", count: 3, sample_items: ["item-1", "item-2"] },
    { severity: "WARNING", count: 12, sample_items: [] },
  ],
};

const META_PIXEL_STATS_FIXTURE = {
  data: [
    { event_name: "Purchase", count: 28 },
    { event_name: "InitiateCheckout", count: 64 },
  ],
};

// ---------------------------------------------------------------------------
// Helper: create test cron app
// ---------------------------------------------------------------------------

function createCronApp() {
  const app = new OpenAPIHono<HonoBindings>();
  app.use("*", async (c, next) => {
    c.set("authUser", null);
    await next();
  });
  registerCronRoutes(app);
  return app;
}

// ---------------------------------------------------------------------------
// Helper: wire up DB mock chains
// ---------------------------------------------------------------------------

function wireDbMocks() {
  // insert chain: db.insert(t).values(v).onConflictDoUpdate(o)
  onConflictDoUpdateMock.mockResolvedValue(undefined);
  dbValuesMock.mockReturnValue({ onConflictDoUpdate: onConflictDoUpdateMock });
  dbInsertMock.mockReturnValue({ values: dbValuesMock });

  // select chain: db.select({...}).from(t).where(c) → [{total: 5}]
  selectWhereMock.mockResolvedValue([{ total: 5 }]);
  selectFromMock.mockReturnValue({ where: selectWhereMock });
  dbSelectMock.mockReturnValue({ from: selectFromMock });
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Stub fetch globally INSIDE beforeEach so the stub is scoped to this test
  // and does not leak into other parallel test files sharing the same worker.
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  logErrorMock.mockReset();
  dbInsertMock.mockReset();
  dbValuesMock.mockReset();
  dbSelectMock.mockReset();
  wireDbMocks();
});

afterEach(() => {
  // Restore fetch so other files in this worker see the real global.
  vi.unstubAllGlobals();
  // Restore env stubs so the next test in this file starts with a clean slate.
  // This is safe here because the fetch stub (the prior-finding cross-file race
  // vector) is now managed via stubGlobal/unstubAllGlobals above, not through
  // process.env. Env stubs set by vi.stubEnv() are scoped to this file's test
  // worker context and restoring them here only affects subsequent tests within
  // this same describe chain — it does NOT reach other parallel files.
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// ADAPTER TESTS
// ---------------------------------------------------------------------------

describe("Search Console adapter", () => {
  it("parses GSC search-analytics FIXTURE into typed SearchConsoleMetrics", async () => {
    vi.stubEnv("GSC_SERVICE_ACCOUNT_JSON", JSON.stringify({ client_email: "svc@test.iam", private_key: "key" }));
    vi.stubEnv("GSC_PROPERTY", "sc-domain:fromthetrunk.shop");

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(GSC_SEARCH_ANALYTICS_FIXTURE), { status: 200 })
    );

    const adapter = buildSearchConsoleAdapter();
    const result = await adapter.pull();

    expect(result.topQueries.length).toBeGreaterThan(0);
    expect(result.topQueries[0]).toMatchObject({
      query: expect.any(String),
      clicks: expect.any(Number),
      impressions: expect.any(Number),
      ctr: expect.any(Number),
    });
    // CTR from fixture[0] is 0.029
    expect(result.topQueries[0]!.clicks).toBe(102);
    expect(result.topQueries[0]!.ctr).toBeCloseTo(0.029);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain("searchconsole.googleapis.com");
  });

  it("returns typed-empty (no throw) when GSC creds are absent", async () => {
    // No env vars set for this adapter
    const adapter = buildSearchConsoleAdapter();
    const result = await adapter.pull();

    expect(result.topQueries).toEqual([]);
    expect(result.indexedPageCount).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns typed-empty (no throw) when GSC fetch fails", async () => {
    vi.stubEnv("GSC_SERVICE_ACCOUNT_JSON", JSON.stringify({ client_email: "svc@test.iam", private_key: "key" }));
    vi.stubEnv("GSC_PROPERTY", "sc-domain:fromthetrunk.shop");

    fetchMock.mockResolvedValueOnce(new Response("Forbidden", { status: 403 }));

    const adapter = buildSearchConsoleAdapter();
    const result = await adapter.pull();

    expect(result.topQueries).toEqual([]);
    expect(result.indexedPageCount).toBe(0);
  });
});

describe("GA4 Data adapter", () => {
  it("parses GA4 runReport FIXTURE into typed GA4DataMetrics", async () => {
    vi.stubEnv("GA4_PROPERTY_ID", "properties/123456789");
    vi.stubEnv("GA4_DATA_SA_JSON", JSON.stringify({ client_email: "svc@test.iam", private_key: "key" }));

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(GA4_RUNREPORT_FIXTURE), { status: 200 })
    );

    const adapter = buildGa4DataAdapter();
    const result = await adapter.pull();

    // sessions = sum of all row metricValues[0]
    expect(result.sessions).toBe(1240 + 430);
    // conversions = sum of all row metricValues[1]
    expect(result.conversions).toBe(23 + 12);
    // totalRevenuePaise extracted from metricValues[2]
    expect(result.totalRevenuePaise).toBe(1850000 + 620000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain("analyticsdata.googleapis.com");
  });

  it("returns typed-empty (no throw) when GA4 Data creds are absent", async () => {
    const adapter = buildGa4DataAdapter();
    const result = await adapter.pull();

    expect(result.sessions).toBe(0);
    expect(result.conversions).toBe(0);
    expect(result.totalRevenuePaise).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns typed-empty (no throw) when GA4 Data API fetch fails", async () => {
    vi.stubEnv("GA4_PROPERTY_ID", "properties/123456789");
    vi.stubEnv("GA4_DATA_SA_JSON", JSON.stringify({ client_email: "svc@test.iam", private_key: "key" }));

    fetchMock.mockResolvedValueOnce(new Response("Unauthorized", { status: 401 }));

    const adapter = buildGa4DataAdapter();
    const result = await adapter.pull();

    expect(result.sessions).toBe(0);
  });
});

describe("Vercel Insights adapter", () => {
  it("parses Vercel API FIXTURE into typed VercelInsightsMetrics", async () => {
    vi.stubEnv("VERCEL_API_TOKEN", "vercel-token-abc");
    vi.stubEnv("VERCEL_PROJECT_ID", "prj_test123");

    // First call: web analytics (CWV), second call: deployments
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify(VERCEL_WEB_ANALYTICS_FIXTURE), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(VERCEL_DEPLOYMENTS_FIXTURE), { status: 200 }));

    const adapter = buildVercelInsightsAdapter();
    const result = await adapter.pull();

    expect(result.cwv.lcp).toBe(2450);
    expect(result.cwv.inp).toBe(180);
    expect(result.cwv.cls).toBeCloseTo(0.08);
    expect(result.recentDeployCount).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const urls = fetchMock.mock.calls.map((call) => call[0] as string);
    expect(urls.some((u) => u.includes("vercel.com"))).toBe(true);
  });

  it("returns typed-empty (no throw) when Vercel creds are absent", async () => {
    const adapter = buildVercelInsightsAdapter();
    const result = await adapter.pull();

    expect(result.cwv.lcp).toBe(0);
    expect(result.cwv.inp).toBe(0);
    expect(result.cwv.cls).toBe(0);
    expect(result.recentDeployCount).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns typed-empty (no throw) when Vercel API fetch fails", async () => {
    vi.stubEnv("VERCEL_API_TOKEN", "vercel-token-abc");
    vi.stubEnv("VERCEL_PROJECT_ID", "prj_test123");

    fetchMock.mockResolvedValue(new Response("Internal Server Error", { status: 500 }));

    const adapter = buildVercelInsightsAdapter();
    const result = await adapter.pull();

    expect(result.cwv.lcp).toBe(0);
  });
});

describe("Meta Marketing adapter", () => {
  it("parses Meta catalog FIXTURE into typed MetaMarketingMetrics", async () => {
    vi.stubEnv("META_CATALOG_ID", "catalog-123");
    vi.stubEnv("META_SYSTEM_USER_TOKEN", "meta-sys-token-abc");

    // 3 fetch calls: catalog info, diagnostics, pixel stats
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify(META_CATALOG_FIXTURE), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(META_CATALOG_DIAGNOSTICS_FIXTURE), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(META_PIXEL_STATS_FIXTURE), { status: 200 }));

    // DB select mock returns 5 CAPI rows (wired in beforeEach)

    const adapter = buildMetaMarketingAdapter();
    const result = await adapter.pull();

    expect(result.catalogItemCount).toBe(47);
    expect(result.catalogDisapprovals).toBe(3);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const urls = fetchMock.mock.calls.map((call) => call[0] as string);
    expect(urls.some((u) => u.includes("graph.facebook.com"))).toBe(true);
    expect(urls.some((u) => u.includes("catalog-123"))).toBe(true);
  });

  it("parses parity fields (pixelEventCount, capiEventCount, parityDelta) from FIXTURE", async () => {
    vi.stubEnv("META_CATALOG_ID", "catalog-parity");
    vi.stubEnv("META_SYSTEM_USER_TOKEN", "meta-sys-token-parity");

    // Pixel stats fixture: 28 Purchase + 64 InitiateCheckout = 92 pixel events
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify(META_CATALOG_FIXTURE), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(META_CATALOG_DIAGNOSTICS_FIXTURE), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(META_PIXEL_STATS_FIXTURE), { status: 200 }));

    // DB returns 5 CAPI rows (mocked in beforeEach via selectWhereMock)
    // pixelEventCount = 28 + 64 = 92; capiEventCount = 5; parityDelta = 87

    const adapter = buildMetaMarketingAdapter();
    const result = await adapter.pull();

    // Mutation proof: pixelEventCount is extracted from pixel_stats fixture data array
    expect(result.pixelEventCount).toBe(28 + 64); // 92
    // capiEventCount comes from the DB mock (5)
    expect(result.capiEventCount).toBe(5);
    // parityDelta = pixel - capi
    expect(result.parityDelta).toBe(92 - 5); // 87
  });

  it("MUTATION PROOF: wrong pixel field path returns wrong count (parity test)", async () => {
    // This test proves the parse is mutation-sensitive:
    // if we use wrong fixture data the count changes.
    vi.stubEnv("META_CATALOG_ID", "catalog-mutation");
    vi.stubEnv("META_SYSTEM_USER_TOKEN", "meta-sys-token-mutation");

    // Fixture with only 1 pixel event (count=1)
    const smallPixelFixture = { data: [{ event_name: "Purchase", count: 1 }] };

    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify(META_CATALOG_FIXTURE), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(META_CATALOG_DIAGNOSTICS_FIXTURE), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(smallPixelFixture), { status: 200 }));

    const adapter = buildMetaMarketingAdapter();
    const result = await adapter.pull();

    // With small fixture, pixelEventCount must be 1, not 92
    expect(result.pixelEventCount).toBe(1);
    // Mutation proof: if the path were wrong (e.g., reading `.total`), this would fail
    expect(result.pixelEventCount).not.toBe(92);
    // parityDelta = 1 - 5 = -4
    expect(result.parityDelta).toBe(1 - 5);
  });

  it("returns typed-empty (no throw) when Meta Marketing creds are absent", async () => {
    const adapter = buildMetaMarketingAdapter();
    const result = await adapter.pull();

    expect(result.catalogItemCount).toBe(0);
    expect(result.catalogDisapprovals).toBe(0);
    expect(result.pixelEventCount).toBe(0);
    expect(result.capiEventCount).toBe(0);
    expect(result.parityDelta).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns typed-empty (no throw) when Meta API fetch fails", async () => {
    vi.stubEnv("META_CATALOG_ID", "catalog-123");
    vi.stubEnv("META_SYSTEM_USER_TOKEN", "meta-sys-token-abc");

    fetchMock.mockResolvedValue(new Response("Forbidden", { status: 403 }));

    const adapter = buildMetaMarketingAdapter();
    const result = await adapter.pull();

    expect(result.catalogItemCount).toBe(0);
  });

  it("does not log the raw token in the error when the adapter throws", async () => {
    vi.stubEnv("META_CATALOG_ID", "catalog-err");
    vi.stubEnv("META_SYSTEM_USER_TOKEN", "SUPER_SECRET_TOKEN");

    // Make fetch throw (network failure) — should NOT log the token
    fetchMock.mockRejectedValue(new Error("network down"));

    const adapter = buildMetaMarketingAdapter();
    await adapter.pull();

    // All log.error calls must NOT contain the raw token value
    for (const call of logErrorMock.mock.calls) {
      const callStr = JSON.stringify(call);
      expect(callStr).not.toContain("SUPER_SECRET_TOKEN");
    }
  });
});

// ---------------------------------------------------------------------------
// ERROR ISOLATION (load-bearing mutation proof)
// ---------------------------------------------------------------------------

describe("pullAllMetrics — error isolation", () => {
  it("resolves with all results even if one adapter throws internally", async () => {
    // Only set Vercel creds so that adapter runs
    vi.stubEnv("VERCEL_API_TOKEN", "tok");
    vi.stubEnv("VERCEL_PROJECT_ID", "prj_ok");

    // fetchMock — first 2 calls for Vercel (CWV + deployments) succeed
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify(VERCEL_WEB_ANALYTICS_FIXTURE), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(VERCEL_DEPLOYMENTS_FIXTURE), { status: 200 }));

    const results = await pullAllMetrics();

    // All four keys are present
    expect(results).toHaveProperty("searchConsole");
    expect(results).toHaveProperty("ga4Data");
    expect(results).toHaveProperty("vercelInsights");
    expect(results).toHaveProperty("metaMarketing");

    // Vercel had creds + fixture → real data
    expect(results.vercelInsights.cwv.lcp).toBe(2450);

    // Others had no creds → typed-zero
    expect(results.searchConsole.topQueries).toEqual([]);
    expect(results.ga4Data.sessions).toBe(0);
    expect(results.metaMarketing.catalogItemCount).toBe(0);
  });

  it("MUTATION PROOF: if an adapter throws, the other adapters still return their values", async () => {
    // Set GA4 creds so it runs; make fetch throw for GA4 call
    vi.stubEnv("GA4_PROPERTY_ID", "properties/throw-me");
    vi.stubEnv("GA4_DATA_SA_JSON", JSON.stringify({ client_email: "svc@test.iam", private_key: "key" }));

    fetchMock.mockRejectedValue(new Error("Network exploded"));

    // pullAllMetrics must still return all 4 keys, GA4 returns typed-zero
    const results = await pullAllMetrics();

    expect(results).toHaveProperty("searchConsole");
    expect(results).toHaveProperty("ga4Data");
    expect(results).toHaveProperty("vercelInsights");
    expect(results).toHaveProperty("metaMarketing");

    // GA4 errored → typed-zero
    expect(results.ga4Data.sessions).toBe(0);
    // Others not set → typed-zero
    expect(results.searchConsole.indexedPageCount).toBe(0);
  });

  it("OUTER ISOLATION MUTATION PROOF: outer .catch() isolates an adapter whose pull() rejects above the inner try/catch", async () => {
    // Set Vercel creds so the real Vercel adapter returns fixture data.
    vi.stubEnv("VERCEL_API_TOKEN", "tok-outer");
    vi.stubEnv("VERCEL_PROJECT_ID", "prj_outer");

    // Vercel fetch: CWV + deployments both succeed with fixture data.
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify(VERCEL_WEB_ANALYTICS_FIXTURE), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(VERCEL_DEPLOYMENTS_FIXTURE), { status: 200 })
      );

    // Inject a GA4 adapter whose pull() REJECTS at the boundary level —
    // this rejection happens ABOVE the inner try/catch inside buildGa4DataAdapter(),
    // so the OUTER .catch() in pullAllMetrics is the only isolation layer.
    const throwingGa4Adapter = {
      source: "ga4-data",
      pull: vi.fn().mockRejectedValue(new Error("Adapter-level rejection — bypasses inner catch")),
    };

    // pullAllMetrics resolves: the outer .catch() absorbs the ga4 rejection.
    const results = await pullAllMetrics({ ga4Data: throwingGa4Adapter });

    // All four keys present
    expect(results).toHaveProperty("searchConsole");
    expect(results).toHaveProperty("ga4Data");
    expect(results).toHaveProperty("vercelInsights");
    expect(results).toHaveProperty("metaMarketing");

    // GA4's outer .catch() → typed-zero
    expect(results.ga4Data.sessions).toBe(0);
    expect(results.ga4Data.totalRevenuePaise).toBe(0);

    // Vercel had creds + real fixture → real non-zero values (proves others were NOT blocked)
    expect(results.vercelInsights.cwv.lcp).toBe(2450);
    expect(results.vercelInsights.recentDeployCount).toBe(2);

    // The throwing GA4 adapter's pull() was actually called (not skipped)
    expect(throwingGa4Adapter.pull).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// CRON ROUTE TESTS
// ---------------------------------------------------------------------------

describe("GET /refresh-channel-metrics cron route", () => {
  beforeEach(() => {
    // Default: all adapter fetch calls return empty-ish OK responses
    // (adapters fall back to empty when no creds set)
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
  });

  it("returns 401 when CRON_SECRET env is set but no Authorization header provided", async () => {
    vi.stubEnv("CRON_SECRET", "super-secret");

    const app = createCronApp();
    const response = await app.request("/refresh-channel-metrics", { method: "GET" });

    expect(response.status).toBe(401);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe("UNAUTHORIZED");
  });

  it("returns 401 when CRON_SECRET is set but Authorization header is wrong", async () => {
    vi.stubEnv("CRON_SECRET", "super-secret");

    const app = createCronApp();
    const response = await app.request("/refresh-channel-metrics", {
      method: "GET",
      headers: { authorization: "Bearer wrong-secret" },
    });

    expect(response.status).toBe(401);
  });

  it("returns 500 when CRON_SECRET env is not configured", async () => {
    // No CRON_SECRET stubbed for this test
    const app = createCronApp();
    const response = await app.request("/refresh-channel-metrics", {
      method: "GET",
      headers: { authorization: "Bearer anything" },
    });

    expect(response.status).toBe(500);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe("CRON_SECRET_MISSING");
  });

  it("returns 200 with per-adapter summary when CRON_SECRET matches", async () => {
    vi.stubEnv("CRON_SECRET", "super-secret");

    const app = createCronApp();
    const response = await app.request("/refresh-channel-metrics", {
      method: "GET",
      headers: { authorization: "Bearer super-secret" },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: boolean;
      adapters: Record<string, string>;
    };
    expect(body.ok).toBe(true);
    expect(body.adapters).toMatchObject({
      searchConsole: expect.any(String),
      ga4Data: expect.any(String),
      vercelInsights: expect.any(String),
      metaMarketing: expect.any(String),
    });
  });

  it("MUTATION PROOF: cron upserts target channelMetrics table with correct source/value per adapter", async () => {
    vi.stubEnv("CRON_SECRET", "super-secret");

    // Activate GA4 so it produces fixture-derived values (sessions=1670, revenue=2470000)
    vi.stubEnv("GA4_PROPERTY_ID", "properties/upsert-test");
    vi.stubEnv("GA4_DATA_SA_JSON", JSON.stringify({ client_email: "svc@test.iam", private_key: "key" }));

    // Activate GSC so it produces fixture-derived values (topQueries.length=3, avgCtr from fixture)
    vi.stubEnv("GSC_SERVICE_ACCOUNT_JSON", JSON.stringify({ client_email: "svc@test.iam", private_key: "key" }));
    vi.stubEnv("GSC_PROPERTY", "sc-domain:fromthetrunk.shop");

    // fetch calls arrive in Promise.all order: searchConsole first, then ga4Data.
    // (Vercel and Meta have no creds so they return typed-empty without fetching.)
    fetchMock
      // 1st fetch: GSC call (searchConsole is first in Promise.all)
      .mockResolvedValueOnce(
        new Response(JSON.stringify(GSC_SEARCH_ANALYTICS_FIXTURE), { status: 200 })
      )
      // 2nd fetch: GA4 call (ga4Data is second in Promise.all)
      .mockResolvedValueOnce(
        new Response(JSON.stringify(GA4_RUNREPORT_FIXTURE), { status: 200 })
      )
      // Remaining adapters (Vercel × 2, Meta × 3) — no creds set, won't fetch
      .mockResolvedValue(new Response("{}", { status: 200 }));

    const app = createCronApp();
    await app.request("/refresh-channel-metrics", {
      method: "GET",
      headers: { authorization: "Bearer super-secret" },
    });

    // (a) db.insert was called 4 times — once per adapter
    expect(dbInsertMock).toHaveBeenCalledTimes(4);

    // (b) Every insert targets the channelMetrics table object (not a raw string)
    for (const call of dbInsertMock.mock.calls) {
      expect(call[0]).toBe(channelMetrics);
    }

    // (c) The values() calls carry the correct source + adapter data.
    //     Find the ga4-data upsert and the search-console upsert.
    const allValues = dbValuesMock.mock.calls.map(
      (call) => call[0] as { source: string; metricKey: string; value: Record<string, unknown> }
    );

    const ga4Values = allValues.find((v) => v.source === "ga4-data");
    expect(ga4Values).toBeDefined();
    // GA4 fixture totals: sessions=1240+430=1670, revenue=1850000+620000=2470000
    expect(ga4Values!.value).toMatchObject({
      sessions: 1240 + 430,
      totalRevenuePaise: 1850000 + 620000,
    });
    expect(ga4Values!.metricKey).toBe("metrics");

    const gscValues = allValues.find((v) => v.source === "search-console");
    expect(gscValues).toBeDefined();
    // GSC fixture: 3 rows → indexedPageCount=3, first query clicks=102
    expect(gscValues!.value).toMatchObject({
      indexedPageCount: 3,
    });
    // topQueries must carry the parsed rows (not empty)
    const topQueries = gscValues!.value["topQueries"] as Array<{ clicks: number }>;
    expect(Array.isArray(topQueries)).toBe(true);
    expect(topQueries[0]!.clicks).toBe(102);
    expect(gscValues!.metricKey).toBe("metrics");
  });

  it("MUTATION PROOF: cron persists successful adapters even when one adapter fetch throws", async () => {
    vi.stubEnv("CRON_SECRET", "super-secret");
    // Activate GA4 so it fires fetch — but make that fetch throw
    vi.stubEnv("GA4_PROPERTY_ID", "properties/throw-test");
    vi.stubEnv("GA4_DATA_SA_JSON", JSON.stringify({ client_email: "svc@test.iam", private_key: "key" }));

    fetchMock.mockRejectedValue(new Error("Simulated network failure"));

    const app = createCronApp();
    const response = await app.request("/refresh-channel-metrics", {
      method: "GET",
      headers: { authorization: "Bearer super-secret" },
    });

    // Cron still returns 200 — not broken by GA4 failure
    expect(response.status).toBe(200);
    // db.insert was still called (other adapters persisted)
    expect(dbInsertMock).toHaveBeenCalled();
    const body = (await response.json()) as { ok: boolean; adapters: Record<string, string> };
    expect(body.ok).toBe(true);
  });
});
