/**
 * Phase 2B.1 — catalogue sync service + admin routes.
 *
 * What these tests prove:
 *   - Preview and status are read-only: no database write, no Merchant write —
 *     every fetch is a products.list GET.
 *   - products.list is paginated via nextPageToken, and a malformed page fails
 *     closed rather than producing an incomplete picture.
 *   - Apply recomputes local + Google state, selects only INSERT actions, and
 *     submits them SEQUENTIALLY (never Promise.all), at most five per call.
 *   - A mid-batch failure stops immediately, reports how far it got, and a
 *     re-run resumes with the products that are still missing.
 *   - The write is pinned to the configured data source and reuses the audit's
 *     ProductInput.
 *   - Apply is admin-only, production-only and kill-switched; preview and
 *     status need neither, because they cannot write.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks — audit, auth, logger
// ---------------------------------------------------------------------------

const runAuditMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/google-merchant/audit-catalogue", () => ({
  runMerchantCatalogueAudit: runAuditMock,
}));

const getAccessTokenMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/google-merchant/auth", () => ({
  getGoogleMerchantAccessToken: getAccessTokenMock,
}));

const logMock = vi.hoisted(() => ({
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}));
vi.mock("@/lib/log", () => ({ createLogger: () => logMock }));

import { registerGoogleMerchantSyncRoutes } from "@/api/hono/routes/google-merchant-sync";
import type { MerchantProductAudit } from "@/lib/google-merchant/catalogue-readiness";
import { GoogleMerchantError } from "@/lib/google-merchant/config";
import type { MerchantProductInput } from "@/lib/google-merchant/product-input";
import {
  applyMerchantCatalogueSyncBatch,
  getMerchantCatalogueSyncStatus,
  previewMerchantCatalogueSync,
} from "@/lib/google-merchant/sync-catalogue";
import { createRouteHarness } from "../helpers/route-harness";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ACCOUNT_ID = "5833526164";
const DATA_SOURCE_ID = "10696807524";
const DATA_SOURCE = `accounts/${ACCOUNT_ID}/dataSources/${DATA_SOURCE_ID}`;
const ACCESS_TOKEN = "ya29.ACCESS-TOKEN-SUPER-SECRET";
const TANGERINE_ID = "6747c35c-682b-4387-a710-b165249470a2";

const LIST_URL_PREFIX = `https://merchantapi.googleapis.com/products/v1/accounts/${ACCOUNT_ID}/products?`;
const INSERT_URL =
  `https://merchantapi.googleapis.com/products/v1/accounts/${ACCOUNT_ID}` +
  `/productInputs:insert?dataSource=accounts%2F${ACCOUNT_ID}%2FdataSources%2F${DATA_SOURCE_ID}`;

const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const mkProductInput = (offerId: string): MerchantProductInput =>
  ({
    contentLanguage: "en",
    feedLabel: "IN",
    offerId,
    productAttributes: { availability: "IN_STOCK", title: `Product ${offerId}` },
  }) as unknown as MerchantProductInput;

const mkAudit = (
  productId: string,
  merchantReadiness = "READY",
): MerchantProductAudit =>
  ({
    productInput:
      merchantReadiness === "READY" ? mkProductInput(productId) : null,
    report: {
      merchantReadiness,
      missingFields: [],
      name: `Saree ${productId.slice(-2)}`,
      productId,
      reasons: [],
      slug: `saree-${productId.slice(-2)}`,
      status: "published",
      stockStatus: "available",
    },
  }) as MerchantProductAudit;

const googleProduct = (offerId: string, overrides: Record<string, unknown> = {}) => ({
  contentLanguage: "en",
  dataSource: DATA_SOURCE,
  feedLabel: "IN",
  name: `accounts/${ACCOUNT_ID}/products/en~IN~${offerId}`,
  offerId,
  productAttributes: {
    availability: "IN_STOCK",
    price: { amountMicros: "5299000000", currencyCode: "INR" },
    title: `Product ${offerId}`,
  },
  productStatus: {
    destinationStatuses: [
      {
        approvedCountries: ["IN"],
        disapprovedCountries: [],
        pendingCountries: [],
        reportingContext: "SHOPPING_ADS",
      },
    ],
    itemLevelIssues: [],
  },
  ...overrides,
});

const insertResponse = (offerId: string) => ({
  contentLanguage: "en",
  feedLabel: "IN",
  name: `accounts/${ACCOUNT_ID}/productInputs/en~IN~${offerId}`,
  offerId,
  product: `accounts/${ACCOUNT_ID}/products/en~IN~${offerId}`,
});

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });

const fetchMock = vi.fn();

/** Route every call by URL: products.list pages, then insert responses. */
const stubGoogle = (options: {
  pages?: Array<{ nextPageToken?: string; products: unknown[] }>;
  onInsert?: (offerId: string) => Response | Promise<Response>;
}) => {
  const pages = options.pages ?? [{ products: [] }];
  let pageIndex = 0;

  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    if (url.startsWith(LIST_URL_PREFIX)) {
      const page = pages[Math.min(pageIndex, pages.length - 1)];
      pageIndex += 1;
      return Promise.resolve(jsonResponse(200, page));
    }

    if (url.startsWith(INSERT_URL.split("?")[0])) {
      const body = JSON.parse(String(init?.body)) as { offerId: string };
      return Promise.resolve(
        options.onInsert
          ? options.onInsert(body.offerId)
          : jsonResponse(200, insertResponse(body.offerId)),
      );
    }

    return Promise.reject(new Error(`unexpected fetch: ${url}`));
  });
};

const stubAudit = (audits: MerchantProductAudit[]) =>
  runAuditMock.mockResolvedValue({
    audits,
    summary: {
      blocked: audits.filter((a) => a.report.merchantReadiness !== "READY")
        .length,
      byReason: {},
      byReasonCode: {},
      publishedProducts: audits.length,
      ready: audits.filter((a) => a.report.merchantReadiness === "READY").length,
    },
    totalPublishedProducts: audits.length,
    truncated: false,
  });

const listCalls = () =>
  fetchMock.mock.calls.filter(([url]) => String(url).startsWith(LIST_URL_PREFIX));

const insertCalls = () =>
  fetchMock.mock.calls.filter(([url]) =>
    String(url).startsWith(INSERT_URL.split("?")[0]),
  );

const loggedText = () =>
  [logMock.debug, logMock.error, logMock.info, logMock.warn]
    .flatMap((fn) => fn.mock.calls)
    .map((args) => JSON.stringify(args))
    .join("|");

beforeEach(() => {
  vi.stubEnv("GOOGLE_MERCHANT_ACCOUNT_ID", ACCOUNT_ID);
  vi.stubEnv("GOOGLE_MERCHANT_DATA_SOURCE_ID", DATA_SOURCE_ID);
  vi.stubEnv("GOOGLE_MERCHANT_DATA_SOURCE_NAME", DATA_SOURCE);
  vi.stubEnv("GOOGLE_MERCHANT_DEVELOPER_EMAIL", "ops@example.com");

  getAccessTokenMock.mockResolvedValue(ACCESS_TOKEN);
  stubAudit([mkAudit(TANGERINE_ID), mkAudit(uuid(1)), mkAudit(uuid(2))]);
  stubGoogle({ pages: [{ products: [googleProduct(TANGERINE_ID)] }] });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

describe("previewMerchantCatalogueSync", () => {
  it("reconciles local READY products against our data source", async () => {
    const plan = await previewMerchantCatalogueSync();

    expect(plan.summary).toMatchObject({
      alreadyPresent: 1,
      conflicts: 0,
      googleManaged: 1,
      insert: 2,
      localPublished: 3,
      localReady: 3,
    });
  });

  it("performs only products.list GETs — no Merchant write", async () => {
    await previewMerchantCatalogueSync();

    expect(insertCalls()).toHaveLength(0);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(0);

    for (const [url, init] of fetchMock.mock.calls) {
      expect(String(url).startsWith(LIST_URL_PREFIX)).toBe(true);
      expect((init as RequestInit).method).toBe("GET");
      expect((init as RequestInit).body).toBeUndefined();
    }
  });

  it("requests pageSize=1000 with a bearer token", async () => {
    await previewMerchantCatalogueSync();

    const [url, init] = listCalls()[0] as [string, RequestInit];
    expect(url).toContain("pageSize=1000");
    expect(init.headers).toEqual({ Authorization: `Bearer ${ACCESS_TOKEN}` });
  });

  it("follows nextPageToken until the last page", async () => {
    stubAudit([mkAudit(uuid(1)), mkAudit(uuid(2)), mkAudit(uuid(3))]);
    stubGoogle({
      pages: [
        { nextPageToken: "page-2", products: [googleProduct(uuid(1))] },
        { nextPageToken: "page-3", products: [googleProduct(uuid(2))] },
        { products: [googleProduct(uuid(3))] },
      ],
    });

    const plan = await previewMerchantCatalogueSync();

    expect(listCalls()).toHaveLength(3);
    expect(String(listCalls()[1][0])).toContain("pageToken=page-2");
    expect(String(listCalls()[2][0])).toContain("pageToken=page-3");
    expect(plan.summary.googleManaged).toBe(3);
    expect(plan.summary.insert).toBe(0);
  });

  it("fails closed on a page whose product identity is unreadable", async () => {
    stubGoogle({ pages: [{ products: [{ offerId: "only-an-offer-id" }] }] });

    const error = await previewMerchantCatalogueSync().catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(GoogleMerchantError);
    expect((error as GoogleMerchantError).code).toBe("GOOGLE_REQUEST_FAILED");
  });

  it("fails closed when products.list errors", async () => {
    fetchMock.mockResolvedValue(jsonResponse(403, { error: { code: 403 } }));

    const error = await previewMerchantCatalogueSync().catch(
      (caught: unknown) => caught,
    );

    expect((error as GoogleMerchantError).code).toBe(
      "GOOGLE_PERMISSION_DENIED",
    );
  });

  it("never logs the access token", async () => {
    await previewMerchantCatalogueSync();

    expect(loggedText()).not.toContain(ACCESS_TOKEN);
  });
});

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

describe("applyMerchantCatalogueSyncBatch", () => {
  const tenReady = () =>
    stubAudit([
      mkAudit(TANGERINE_ID),
      ...Array.from({ length: 10 }, (_, index) => mkAudit(uuid(index + 1))),
    ]);

  it("inserts exactly five missing products", async () => {
    tenReady();

    const result = await applyMerchantCatalogueSyncBatch(5);

    expect(result).toMatchObject({
      applied: true,
      attempted: 5,
      remainingInsertCandidates: 5,
      requestedLimit: 5,
      succeeded: 5,
    });
    expect(insertCalls()).toHaveLength(5);
  });

  it("selects INSERT actions only, skipping the present Tangerine offer", async () => {
    tenReady();

    const result = await applyMerchantCatalogueSyncBatch(5);
    const offerIds = insertCalls().map(
      ([, init]) => JSON.parse(String((init as RequestInit).body)).offerId,
    );

    expect(offerIds).toEqual([uuid(1), uuid(2), uuid(3), uuid(4), uuid(5)]);
    expect(offerIds).not.toContain(TANGERINE_ID);
    expect(
      (result as { products: Array<{ productId: string }> }).products.map(
        (product) => product.productId,
      ),
    ).toEqual([uuid(1), uuid(2), uuid(3), uuid(4), uuid(5)]);
  });

  it("submits sequentially, not concurrently", async () => {
    tenReady();
    let inFlight = 0;
    let maxInFlight = 0;

    stubGoogle({
      onInsert: (offerId) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        return new Promise<Response>((resolve) => {
          setTimeout(() => {
            inFlight -= 1;
            resolve(jsonResponse(200, insertResponse(offerId)));
          }, 3);
        });
      },
      pages: [{ products: [googleProduct(TANGERINE_ID)] }],
    });

    await applyMerchantCatalogueSyncBatch(5);

    expect(maxInFlight).toBe(1);
  });

  it("pins the configured data source on every write", async () => {
    tenReady();

    await applyMerchantCatalogueSyncBatch(3);

    for (const [url, init] of insertCalls()) {
      expect(url).toBe(INSERT_URL);
      expect((init as RequestInit).method).toBe("POST");
      expect((init as RequestInit).headers).toEqual({
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      });
    }
  });

  it("submits the audit's ProductInput verbatim", async () => {
    tenReady();

    await applyMerchantCatalogueSyncBatch(1);

    const body = JSON.parse(String((insertCalls()[0][1] as RequestInit).body));
    expect(body).toEqual(mkProductInput(uuid(1)));
  });

  it("re-reads Google state before writing — never trusts an earlier preview", async () => {
    tenReady();

    await previewMerchantCatalogueSync();
    const listsAfterPreview = listCalls().length;
    await applyMerchantCatalogueSyncBatch(1);

    expect(listCalls().length).toBeGreaterThan(listsAfterPreview);
    expect(runAuditMock).toHaveBeenCalledTimes(2);
  });

  it("honours a limit below the ceiling", async () => {
    tenReady();

    const result = await applyMerchantCatalogueSyncBatch(2);

    expect(result.succeeded).toBe(2);
    expect(insertCalls()).toHaveLength(2);
  });

  it("inserts fewer than the limit when fewer are missing", async () => {
    const result = await applyMerchantCatalogueSyncBatch(5);

    expect(result).toMatchObject({ applied: true, attempted: 2, succeeded: 2 });
  });

  const badLimits = [0, -1, 6, 100, 2.5, Number.NaN];

  for (const limit of badLimits) {
    it(`refuses limit ${limit}`, async () => {
      const error = await applyMerchantCatalogueSyncBatch(limit).catch(
        (caught: unknown) => caught,
      );

      expect(error).toBeInstanceOf(GoogleMerchantError);
      expect((error as GoogleMerchantError).code).toBe("SYNC_LIMIT_INVALID");
      expect(insertCalls()).toHaveLength(0);
    });
  }

  it("stops at the first failure and reports how far it got", async () => {
    tenReady();
    stubGoogle({
      onInsert: (offerId) =>
        offerId === uuid(3)
          ? jsonResponse(429, { error: { code: 429 } })
          : jsonResponse(200, insertResponse(offerId)),
      pages: [{ products: [googleProduct(TANGERINE_ID)] }],
    });

    const result = await applyMerchantCatalogueSyncBatch(5);

    expect(result).toMatchObject({
      applied: false,
      attempted: 3,
      failedProductId: uuid(3),
      succeeded: 2,
    });
    expect((result as { error: { code: string } }).error.code).toBe(
      "GOOGLE_RATE_LIMITED",
    );
    // Stopped — products 4 and 5 were never attempted.
    expect(insertCalls()).toHaveLength(3);
  });

  const upstreamFailures: Array<{ code: string; status: number }> = [
    { code: "GOOGLE_REQUEST_FAILED", status: 400 },
    { code: "GOOGLE_UNAUTHENTICATED", status: 401 },
    { code: "GOOGLE_PERMISSION_DENIED", status: 403 },
    { code: "GOOGLE_REQUEST_FAILED", status: 409 },
    { code: "GOOGLE_RATE_LIMITED", status: 429 },
    { code: "GOOGLE_UNAVAILABLE", status: 500 },
    { code: "GOOGLE_UNAVAILABLE", status: 503 },
  ];

  for (const { code, status } of upstreamFailures) {
    it(`reports a Google ${status} as ${code}`, async () => {
      tenReady();
      stubGoogle({
        onInsert: () =>
          jsonResponse(status, {
            error: { code: status, message: `denied ${ACCESS_TOKEN}` },
          }),
        pages: [{ products: [googleProduct(TANGERINE_ID)] }],
      });

      const result = await applyMerchantCatalogueSyncBatch(5);

      expect(result.applied).toBe(false);
      const error = (result as { error: { code: string; message: string } })
        .error;
      expect(error.code).toBe(code);
      expect(error.message).not.toContain(ACCESS_TOKEN);
      expect(loggedText()).not.toContain(ACCESS_TOKEN);
    });
  }

  it("reports a malformed insert response as a failure", async () => {
    tenReady();
    stubGoogle({
      onInsert: () => jsonResponse(200, { name: "accounts/999/productInputs/x" }),
      pages: [{ products: [googleProduct(TANGERINE_ID)] }],
    });

    const result = await applyMerchantCatalogueSyncBatch(5);

    expect(result.applied).toBe(false);
    expect((result as { error: { code: string } }).error.code).toBe(
      "GOOGLE_REQUEST_FAILED",
    );
  });

  it("resumes with the remaining products after a partial batch", async () => {
    tenReady();
    stubGoogle({
      onInsert: (offerId) =>
        offerId === uuid(3)
          ? jsonResponse(500, { error: { code: 500 } })
          : jsonResponse(200, insertResponse(offerId)),
      pages: [{ products: [googleProduct(TANGERINE_ID)] }],
    });

    const first = await applyMerchantCatalogueSyncBatch(5);
    expect(first.succeeded).toBe(2);

    // Google now holds Tangerine plus the two that succeeded.
    fetchMock.mockClear();
    stubGoogle({
      pages: [
        {
          products: [
            googleProduct(TANGERINE_ID),
            googleProduct(uuid(1)),
            googleProduct(uuid(2)),
          ],
        },
      ],
    });

    const second = await applyMerchantCatalogueSyncBatch(5);
    const offerIds = insertCalls().map(
      ([, init]) => JSON.parse(String((init as RequestInit).body)).offerId,
    );

    expect(second.succeeded).toBe(5);
    expect(offerIds).toEqual([uuid(3), uuid(4), uuid(5), uuid(6), uuid(7)]);
  });

  it("never writes when a conflict blocks the only candidate", async () => {
    stubAudit([mkAudit(uuid(1))]);
    stubGoogle({
      pages: [{ products: [googleProduct(uuid(1), { feedLabel: "US" })] }],
    });

    const result = await applyMerchantCatalogueSyncBatch(5);

    expect(result).toMatchObject({ applied: true, attempted: 0, succeeded: 0 });
    expect(insertCalls()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

describe("getMerchantCatalogueSyncStatus", () => {
  it("returns only products from our data source", async () => {
    stubGoogle({
      pages: [
        {
          products: [
            googleProduct(TANGERINE_ID),
            googleProduct(uuid(9), {
              dataSource: `accounts/${ACCOUNT_ID}/dataSources/111`,
            }),
          ],
        },
      ],
    });

    const reports = await getMerchantCatalogueSyncStatus();

    expect(reports).toHaveLength(1);
    expect(reports[0].offerId).toBe(TANGERINE_ID);
    expect(reports[0].status).toBe("APPROVED");
  });

  it("classifies a pending product", async () => {
    stubGoogle({
      pages: [
        {
          products: [
            googleProduct(uuid(1), {
              productStatus: {
                destinationStatuses: [
                  {
                    approvedCountries: [],
                    disapprovedCountries: [],
                    pendingCountries: ["IN"],
                    reportingContext: "SHOPPING_ADS",
                  },
                ],
              },
            }),
          ],
        },
      ],
    });

    expect((await getMerchantCatalogueSyncStatus())[0].status).toBe("PENDING");
  });

  it("classifies a disapproved product and keeps its issues", async () => {
    stubGoogle({
      pages: [
        {
          products: [
            googleProduct(uuid(1), {
              productStatus: {
                destinationStatuses: [
                  {
                    approvedCountries: [],
                    disapprovedCountries: ["IN"],
                    pendingCountries: [],
                    reportingContext: "SHOPPING_ADS",
                  },
                ],
                itemLevelIssues: [
                  {
                    applicableCountries: ["IN"],
                    attribute: "image_link",
                    code: "image_link_broken",
                    description: "Image not crawlable",
                    reportingContext: "SHOPPING_ADS",
                    severity: "DISAPPROVED",
                  },
                ],
              },
            }),
          ],
        },
      ],
    });

    const [report] = await getMerchantCatalogueSyncStatus();

    expect(report.status).toBe("DISAPPROVED");
    expect(report.itemLevelIssues[0].code).toBe("image_link_broken");
  });

  it("performs no write", async () => {
    await getMerchantCatalogueSyncStatus();

    expect(insertCalls()).toHaveLength(0);
  });

  it("follows pagination", async () => {
    stubGoogle({
      pages: [
        { nextPageToken: "p2", products: [googleProduct(uuid(1))] },
        { products: [googleProduct(uuid(2))] },
      ],
    });

    expect(await getMerchantCatalogueSyncStatus()).toHaveLength(2);
    expect(listCalls()).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

type ErrorBody = { code: string; message: string };

const ADMIN = { email: "admin@example.com", id: "admin-1", role: "admin" };
const CUSTOMER = { email: "user@example.com", id: "user-1", role: "customer" };

const makeHarness = (
  authUser: { email: string; id: string; role: string } | null,
  deps: Parameters<typeof registerGoogleMerchantSyncRoutes>[1] = {},
) =>
  createRouteHarness({
    authUser,
    register: (app) => registerGoogleMerchantSyncRoutes(app, deps),
  });

const APPLY_BODY = { confirm: "SYNC_FTT_GOOGLE_MERCHANT_BATCH", limit: 5 };

const postApply = (
  harness: ReturnType<typeof createRouteHarness>,
  body: unknown = APPLY_BODY,
) =>
  harness.request("/catalogue-sync/apply", {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

const enableProductionSync = () => {
  vi.stubEnv("GOOGLE_MERCHANT_CATALOGUE_SYNC_ENABLED", "true");
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("ADMIN_API_SECRET", undefined);
};

describe("GET /catalogue-sync/preview", () => {
  it("401s for an unauthenticated request", async () => {
    const response = await makeHarness(null).request("/catalogue-sync/preview");

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("403s for a signed-in non-admin", async () => {
    vi.stubEnv("ADMIN_API_SECRET", undefined);

    expect(
      (await makeHarness(CUSTOMER).request("/catalogue-sync/preview")).status,
    ).toBe(403);
  });

  it("serves outside production with the sync kill switch off", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("GOOGLE_MERCHANT_CATALOGUE_SYNC_ENABLED", "false");

    expect(
      (await makeHarness(ADMIN).request("/catalogue-sync/preview")).status,
    ).toBe(200);
  });

  it("returns the summary and safe action rows only", async () => {
    const response = await makeHarness(ADMIN).request("/catalogue-sync/preview");
    const body = (await response.json()) as {
      actions: Array<Record<string, unknown>>;
      summary: Record<string, number>;
    };

    expect(response.status).toBe(200);
    expect(Object.keys(body).sort()).toEqual(["actions", "summary"]);
    expect(Object.keys(body.summary).sort()).toEqual([
      "alreadyPresent",
      "conflicts",
      "deleteCandidates",
      "googleManaged",
      "insert",
      "localPublished",
      "localReady",
      "update",
    ]);
    expect(Object.keys(body.actions[0]).sort()).toEqual([
      "action",
      "name",
      "offerId",
      "productId",
      "reason",
      "slug",
    ]);
  });

  it("never exposes a ProductInput payload or a token", async () => {
    const raw = await (
      await makeHarness(ADMIN).request("/catalogue-sync/preview")
    ).text();

    for (const leak of [
      "productInput",
      "productAttributes",
      "amountMicros",
      "imageLink",
      "description",
      ACCESS_TOKEN,
      "external_account",
    ]) {
      expect(raw).not.toContain(leak);
    }
  });

  it("returns a sanitised 500 when the preview fails", async () => {
    const harness = makeHarness(ADMIN, {
      previewSync: () =>
        Promise.reject(new Error(`token=${ACCESS_TOKEN} postgres://u:p@h/db`)),
    });

    const response = await harness.request("/catalogue-sync/preview");
    const raw = await response.text();

    expect(response.status).toBe(500);
    expect(raw).not.toContain(ACCESS_TOKEN);
    expect(raw).not.toContain("postgres://");
    expect(JSON.parse(raw)).toEqual({
      code: "CATALOGUE_SYNC_FAILED",
      message: "The catalogue sync preview could not be completed.",
    });
  });
});

describe("GET /catalogue-sync/status", () => {
  it("401s for an unauthenticated request", async () => {
    expect(
      (await makeHarness(null).request("/catalogue-sync/status")).status,
    ).toBe(401);
  });

  it("403s for a signed-in non-admin", async () => {
    vi.stubEnv("ADMIN_API_SECRET", undefined);

    expect(
      (await makeHarness(CUSTOMER).request("/catalogue-sync/status")).status,
    ).toBe(403);
  });

  it("returns exactly the safe status keys with a status breakdown", async () => {
    const response = await makeHarness(ADMIN).request("/catalogue-sync/status");
    const body = (await response.json()) as {
      products: Array<Record<string, unknown>>;
      summary: { byStatus: Record<string, number>; managedProducts: number };
    };

    expect(response.status).toBe(200);
    expect(Object.keys(body).sort()).toEqual(["products", "summary"]);
    expect(Object.keys(body.products[0]).sort()).toEqual([
      "availability",
      "destinationStatuses",
      "itemLevelIssues",
      "offerId",
      "price",
      "status",
      "title",
    ]);
    expect(body.summary).toEqual({
      byStatus: {
        APPROVED: 1,
        DISAPPROVED: 0,
        LIMITED: 0,
        PENDING: 0,
        UNKNOWN: 0,
      },
      managedProducts: 1,
    });
  });

  it("performs no Merchant write", async () => {
    await makeHarness(ADMIN).request("/catalogue-sync/status");

    expect(insertCalls()).toHaveLength(0);
  });
});

describe("POST /catalogue-sync/apply — gates", () => {
  it("404s when the kill switch is off", async () => {
    enableProductionSync();
    vi.stubEnv("GOOGLE_MERCHANT_CATALOGUE_SYNC_ENABLED", "false");

    const response = await postApply(makeHarness(ADMIN));

    expect(response.status).toBe(404);
    expect(insertCalls()).toHaveLength(0);
  });

  it("404s when the kill switch is unset", async () => {
    enableProductionSync();
    vi.stubEnv("GOOGLE_MERCHANT_CATALOGUE_SYNC_ENABLED", undefined);

    expect((await postApply(makeHarness(ADMIN))).status).toBe(404);
  });

  it("404s outside production", async () => {
    enableProductionSync();
    vi.stubEnv("VERCEL_ENV", "preview");

    const response = await postApply(makeHarness(ADMIN));

    expect(response.status).toBe(404);
    expect(insertCalls()).toHaveLength(0);
  });

  it("gates before authentication", async () => {
    enableProductionSync();
    vi.stubEnv("GOOGLE_MERCHANT_CATALOGUE_SYNC_ENABLED", "false");

    expect((await postApply(makeHarness(null))).status).toBe(404);
  });

  it("401s for an unauthenticated request", async () => {
    enableProductionSync();

    const response = await postApply(makeHarness(null));

    expect(response.status).toBe(401);
    expect(insertCalls()).toHaveLength(0);
  });

  it("403s for a signed-in non-admin", async () => {
    enableProductionSync();

    expect((await postApply(makeHarness(CUSTOMER))).status).toBe(403);
  });

  const badBodies: Array<{ body: unknown; label: string }> = [
    { body: { confirm: "SYNC", limit: 5 }, label: "a wrong phrase" },
    { body: { limit: 5 }, label: "no confirmation" },
    { body: { ...APPLY_BODY, limit: 0 }, label: "limit 0" },
    { body: { ...APPLY_BODY, limit: 6 }, label: "limit 6" },
    { body: { ...APPLY_BODY, limit: 50 }, label: "limit 50" },
    { body: { ...APPLY_BODY, limit: -1 }, label: "a negative limit" },
    { body: { ...APPLY_BODY, limit: 2.5 }, label: "a fractional limit" },
    { body: { ...APPLY_BODY, limit: "5" }, label: "a string limit" },
    { body: { confirm: APPLY_BODY.confirm }, label: "no limit" },
    { body: { ...APPLY_BODY, force: true }, label: "an extra property" },
  ];

  for (const { body, label } of badBodies) {
    it(`400s on ${label}`, async () => {
      enableProductionSync();

      const response = await postApply(makeHarness(ADMIN), body);

      expect(response.status).toBe(400);
      expect(((await response.json()) as ErrorBody).code).toBe(
        "INVALID_REQUEST",
      );
      expect(insertCalls()).toHaveLength(0);
    });
  }
});

describe("POST /catalogue-sync/apply — outcomes", () => {
  beforeEach(() => {
    enableProductionSync();
    stubAudit([
      mkAudit(TANGERINE_ID),
      ...Array.from({ length: 10 }, (_, index) => mkAudit(uuid(index + 1))),
    ]);
    stubGoogle({ pages: [{ products: [googleProduct(TANGERINE_ID)] }] });
  });

  it("returns the agreed success shape", async () => {
    const response = await postApply(makeHarness(ADMIN));
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(Object.keys(body).sort()).toEqual([
      "applied",
      "attempted",
      "products",
      "remainingInsertCandidates",
      "requestedLimit",
      "succeeded",
    ]);
    expect(body).toMatchObject({
      applied: true,
      attempted: 5,
      remainingInsertCandidates: 5,
      requestedLimit: 5,
      succeeded: 5,
    });
    expect(
      Object.keys(
        (body.products as Array<Record<string, unknown>>)[0],
      ).sort(),
    ).toEqual([
      "offerId",
      "processedProductName",
      "productId",
      "productInputName",
    ]);
  });

  it("returns the agreed failure shape with a 200", async () => {
    stubGoogle({
      onInsert: (offerId) =>
        offerId === uuid(2)
          ? jsonResponse(429, { error: { code: 429 } })
          : jsonResponse(200, insertResponse(offerId)),
      pages: [{ products: [googleProduct(TANGERINE_ID)] }],
    });

    const response = await postApply(makeHarness(ADMIN));
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      applied: false,
      attempted: 2,
      failedProductId: uuid(2),
      succeeded: 1,
    });
    expect(body.error).toEqual({
      code: "GOOGLE_RATE_LIMITED",
      message: "Google rate-limited the request. Retry later.",
    });
  });

  it("leaks no token, credential configuration or stack trace", async () => {
    const harness = makeHarness(ADMIN, {
      applySync: () =>
        Promise.reject(
          new Error(
            `boom token=${ACCESS_TOKEN} config={"type":"external_account"}`,
          ),
        ),
    });

    const response = await postApply(harness);
    const raw = await response.text();

    expect(response.status).toBe(500);
    expect(raw).not.toContain(ACCESS_TOKEN);
    expect(raw).not.toContain("external_account");
    expect(raw).not.toContain("at Object");
  });
});
