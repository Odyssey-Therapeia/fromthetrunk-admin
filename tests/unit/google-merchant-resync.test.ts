/**
 * Phase 2A.2 — controlled single-product resync.
 *
 * What these tests prove:
 *   - Readiness decides: a missing, non-READY or SOLD product is refused before
 *     any Google write.
 *   - The ProductInput submitted is the object the audit built — never rebuilt.
 *   - The offer must already exist in OUR data source, with the expected
 *     language and feed label; another data source, a duplicate, a language or
 *     feed-label mismatch each fail closed.
 *   - Exactly ONE Merchant write happens, through the shared upsert primitive.
 *   - The route is admin-only, production-only and gated by the existing sync
 *     kill switch; no database write and no token leakage.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks
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
import { resyncMerchantProduct } from "@/lib/google-merchant/sync-catalogue";
import { createRouteHarness } from "../helpers/route-harness";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ACCOUNT_ID = "5833526164";
const DATA_SOURCE_ID = "10696807524";
const DATA_SOURCE = `accounts/${ACCOUNT_ID}/dataSources/${DATA_SOURCE_ID}`;
const ACCESS_TOKEN = "ya29.ACCESS-TOKEN-SUPER-SECRET";
const BLOB = "https://store.public.blob.vercel-storage.com";

/** The production product Google rejected for "Image too big". */
const MAROON_ID = "0768b66c-4a38-4135-801d-87bbc95a096b";

const LIST_URL_PREFIX = `https://merchantapi.googleapis.com/products/v1/accounts/${ACCOUNT_ID}/products?`;
const INSERT_URL_PREFIX = `https://merchantapi.googleapis.com/products/v1/accounts/${ACCOUNT_ID}/productInputs:insert`;

const mkProductInput = (offerId: string): MerchantProductInput =>
  ({
    contentLanguage: "en",
    feedLabel: "IN",
    offerId,
    productAttributes: {
      additionalImageLinks: [`${BLOB}/maroon-1.jpg`, `${BLOB}/maroon-2.jpg`],
      availability: "IN_STOCK",
      imageLink: `${BLOB}/maroon-0.jpg`,
      title: "Maroon chettinad cotton",
    },
  }) as unknown as MerchantProductInput;

const mkAudit = (
  productId: string,
  merchantReadiness = "READY",
): MerchantProductAudit =>
  ({
    imageDiagnostics: {
      duplicateImages: 0,
      ignored: [],
      ignoredImages: 2,
      safeImages: 3,
      totalImages: 5,
    },
    productInput:
      merchantReadiness === "READY" ? mkProductInput(productId) : null,
    report: {
      images: { ignoredImages: 2, safeImages: 3, totalImages: 5 },
      merchantReadiness,
      missingFields: [],
      name: "Maroon chettinad cotton",
      productId,
      reasons: [],
      slug: "maroon-chettinad-cotton",
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
  productAttributes: { title: "Maroon chettinad cotton" },
  productStatus: { destinationStatuses: [], itemLevelIssues: [] },
  ...overrides,
});

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });

const insertResponse = (offerId: string) => ({
  contentLanguage: "en",
  feedLabel: "IN",
  name: `accounts/${ACCOUNT_ID}/productInputs/en~IN~${offerId}`,
  offerId,
  product: `accounts/${ACCOUNT_ID}/products/en~IN~${offerId}`,
});

const fetchMock = vi.fn();

const stubGoogle = (options: {
  products?: unknown[];
  onInsert?: () => Response;
}) => {
  fetchMock.mockImplementation((url: string) => {
    if (url.startsWith(LIST_URL_PREFIX)) {
      return Promise.resolve(
        jsonResponse(200, { products: options.products ?? [] }),
      );
    }

    if (url.startsWith(INSERT_URL_PREFIX)) {
      return Promise.resolve(
        options.onInsert
          ? options.onInsert()
          : jsonResponse(200, insertResponse(MAROON_ID)),
      );
    }

    return Promise.reject(new Error(`unexpected fetch: ${url}`));
  });
};

const insertCalls = () =>
  fetchMock.mock.calls.filter(([url]) =>
    String(url).startsWith(INSERT_URL_PREFIX),
  );

const loggedText = () =>
  [logMock.debug, logMock.error, logMock.info, logMock.warn]
    .flatMap((fn) => fn.mock.calls)
    .map((args) => JSON.stringify(args))
    .join("|");

const expectRefusal = async (promise: Promise<unknown>, code: string) => {
  const error = await promise.catch((caught: unknown) => caught);

  expect(error).toBeInstanceOf(GoogleMerchantError);
  expect((error as GoogleMerchantError).code).toBe(code);
  expect((error as GoogleMerchantError).message).not.toContain(ACCESS_TOKEN);
  expect(insertCalls()).toHaveLength(0);

  return error as GoogleMerchantError;
};

beforeEach(() => {
  vi.stubEnv("GOOGLE_MERCHANT_ACCOUNT_ID", ACCOUNT_ID);
  vi.stubEnv("GOOGLE_MERCHANT_DATA_SOURCE_ID", DATA_SOURCE_ID);
  vi.stubEnv("GOOGLE_MERCHANT_DATA_SOURCE_NAME", DATA_SOURCE);
  vi.stubEnv("GOOGLE_MERCHANT_DEVELOPER_EMAIL", "ops@example.com");

  getAccessTokenMock.mockResolvedValue(ACCESS_TOKEN);
  runAuditMock.mockResolvedValue({
    audits: [mkAudit(MAROON_ID)],
    summary: {},
    totalPublishedProducts: 1,
    truncated: false,
  });
  stubGoogle({ products: [googleProduct(MAROON_ID)] });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

describe("resyncMerchantProduct — success", () => {
  it("resubmits the offer and reports the safe image summary", async () => {
    const result = await resyncMerchantProduct(MAROON_ID);

    expect(result).toEqual({
      merchantImages: { additionalCount: 2, primary: `${BLOB}/maroon-0.jpg` },
      offerId: MAROON_ID,
      processedProductName: `accounts/${ACCOUNT_ID}/products/en~IN~${MAROON_ID}`,
      productId: MAROON_ID,
      productInputName: `accounts/${ACCOUNT_ID}/productInputs/en~IN~${MAROON_ID}`,
      resynced: true,
    });
  });

  it("performs exactly ONE Merchant write", async () => {
    await resyncMerchantProduct(MAROON_ID);

    expect(insertCalls()).toHaveLength(1);
  });

  it("submits the audit's ProductInput verbatim, pinned to the data source", async () => {
    await resyncMerchantProduct(MAROON_ID);

    const [url, init] = insertCalls()[0] as [string, RequestInit];

    expect(url).toContain(
      `dataSource=accounts%2F${ACCOUNT_ID}%2FdataSources%2F${DATA_SOURCE_ID}`,
    );
    expect(JSON.parse(String(init.body))).toEqual(mkProductInput(MAROON_ID));
  });

  it("submits only Merchant-safe images", async () => {
    await resyncMerchantProduct(MAROON_ID);

    const body = JSON.parse(
      String((insertCalls()[0][1] as RequestInit).body),
    ) as { productAttributes: { additionalImageLinks: string[]; imageLink: string } };

    // The audit dropped 2 of 5; only the survivors are submitted.
    expect(body.productAttributes.imageLink).toBe(`${BLOB}/maroon-0.jpg`);
    expect(body.productAttributes.additionalImageLinks).toHaveLength(2);
  });

  it("never logs the access token", async () => {
    await resyncMerchantProduct(MAROON_ID);

    expect(loggedText()).not.toContain(ACCESS_TOKEN);
  });
});

describe("resyncMerchantProduct — refusals", () => {
  it("refuses an invalid UUID before any work", async () => {
    await expectRefusal(resyncMerchantProduct("not-a-uuid"), "PRODUCT_NOT_FOUND");
    expect(runAuditMock).not.toHaveBeenCalled();
  });

  it("refuses a product that is not in the published catalogue", async () => {
    await expectRefusal(
      resyncMerchantProduct("11111111-2222-4333-8444-555555555555"),
      "PRODUCT_NOT_FOUND",
    );
  });

  const blockedStates = [
    "SOLD",
    "RESERVED",
    "NO_MERCHANT_SAFE_IMAGE",
    "MISSING_REQUIRED_ATTRIBUTES",
    "NOT_PUBLISHED",
  ];

  for (const state of blockedStates) {
    it(`refuses a ${state} product`, async () => {
      runAuditMock.mockResolvedValue({
        audits: [mkAudit(MAROON_ID, state)],
        summary: {},
        totalPublishedProducts: 1,
        truncated: false,
      });

      const error = await expectRefusal(
        resyncMerchantProduct(MAROON_ID),
        "PRODUCT_NOT_PURCHASABLE",
      );
      expect(error.message).toContain(state);
    });
  }

  it("refuses when the offer is absent from our data source", async () => {
    stubGoogle({ products: [] });

    await expectRefusal(resyncMerchantProduct(MAROON_ID), "PRODUCT_NOT_FOUND");
  });

  it("ignores an offer that lives in another data source", async () => {
    stubGoogle({
      products: [
        googleProduct(MAROON_ID, {
          dataSource: `accounts/${ACCOUNT_ID}/dataSources/999`,
        }),
      ],
    });

    await expectRefusal(resyncMerchantProduct(MAROON_ID), "PRODUCT_NOT_FOUND");
  });

  it("refuses a duplicated managed offer", async () => {
    stubGoogle({
      products: [googleProduct(MAROON_ID), googleProduct(MAROON_ID)],
    });

    const error = await expectRefusal(
      resyncMerchantProduct(MAROON_ID),
      "GOOGLE_REQUEST_FAILED",
    );
    expect(error.status).toBe(409);
  });

  it("refuses an unexpected content language", async () => {
    stubGoogle({
      products: [googleProduct(MAROON_ID, { contentLanguage: "hi" })],
    });

    await expectRefusal(resyncMerchantProduct(MAROON_ID), "GOOGLE_REQUEST_FAILED");
  });

  it("refuses an unexpected feed label", async () => {
    stubGoogle({ products: [googleProduct(MAROON_ID, { feedLabel: "US" })] });

    await expectRefusal(resyncMerchantProduct(MAROON_ID), "GOOGLE_REQUEST_FAILED");
  });
});

describe("resyncMerchantProduct — Google failures", () => {
  const failures: Array<{ code: string; status: number }> = [
    { code: "GOOGLE_REQUEST_FAILED", status: 400 },
    { code: "GOOGLE_UNAUTHENTICATED", status: 401 },
    { code: "GOOGLE_PERMISSION_DENIED", status: 403 },
    { code: "GOOGLE_REQUEST_FAILED", status: 409 },
    { code: "GOOGLE_RATE_LIMITED", status: 429 },
    { code: "GOOGLE_UNAVAILABLE", status: 500 },
    { code: "GOOGLE_UNAVAILABLE", status: 503 },
  ];

  for (const { code, status } of failures) {
    it(`maps a Google ${status} to ${code}`, async () => {
      stubGoogle({
        onInsert: () =>
          jsonResponse(status, {
            error: { code: status, message: `denied ${ACCESS_TOKEN}` },
          }),
        products: [googleProduct(MAROON_ID)],
      });

      const error = await resyncMerchantProduct(MAROON_ID).catch(
        (caught: unknown) => caught,
      );

      expect((error as GoogleMerchantError).code).toBe(code);
      expect((error as GoogleMerchantError).message).not.toContain(ACCESS_TOKEN);
      expect(loggedText()).not.toContain(ACCESS_TOKEN);
    });
  }

  it("rejects a malformed insert response", async () => {
    stubGoogle({
      onInsert: () => jsonResponse(200, { name: "accounts/999/productInputs/x" }),
      products: [googleProduct(MAROON_ID)],
    });

    const error = await resyncMerchantProduct(MAROON_ID).catch(
      (caught: unknown) => caught,
    );

    expect((error as GoogleMerchantError).code).toBe("GOOGLE_REQUEST_FAILED");
  });
});

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

type ErrorBody = { code: string; message: string };

const ADMIN = { email: "admin@example.com", id: "admin-1", role: "admin" };
const CUSTOMER = { email: "user@example.com", id: "user-1", role: "customer" };

const RESYNC_BODY = {
  confirm: "RESYNC_FTT_GOOGLE_MERCHANT_PRODUCT",
  productId: MAROON_ID,
};

const makeHarness = (
  authUser: { email: string; id: string; role: string } | null,
  deps: Parameters<typeof registerGoogleMerchantSyncRoutes>[1] = {},
) =>
  createRouteHarness({
    authUser,
    register: (app) => registerGoogleMerchantSyncRoutes(app, deps),
  });

const postResync = (
  harness: ReturnType<typeof createRouteHarness>,
  body: unknown = RESYNC_BODY,
) =>
  harness.request("/catalogue-sync/resync", {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

const enableProductionSync = () => {
  vi.stubEnv("GOOGLE_MERCHANT_CATALOGUE_SYNC_ENABLED", "true");
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("ADMIN_API_SECRET", undefined);
};

describe("POST /catalogue-sync/resync", () => {
  it("404s when the sync kill switch is off", async () => {
    enableProductionSync();
    vi.stubEnv("GOOGLE_MERCHANT_CATALOGUE_SYNC_ENABLED", "false");

    expect((await postResync(makeHarness(ADMIN))).status).toBe(404);
    expect(insertCalls()).toHaveLength(0);
  });

  it("404s outside production", async () => {
    enableProductionSync();
    vi.stubEnv("VERCEL_ENV", "preview");

    expect((await postResync(makeHarness(ADMIN))).status).toBe(404);
  });

  it("401s unauthenticated and 403s a non-admin", async () => {
    enableProductionSync();

    expect((await postResync(makeHarness(null))).status).toBe(401);
    expect((await postResync(makeHarness(CUSTOMER))).status).toBe(403);
    expect(insertCalls()).toHaveLength(0);
  });

  const badBodies: Array<{ body: unknown; label: string }> = [
    { body: { ...RESYNC_BODY, confirm: "RESYNC" }, label: "a wrong phrase" },
    { body: { productId: MAROON_ID }, label: "no confirmation" },
    { body: { ...RESYNC_BODY, productId: "not-a-uuid" }, label: "an invalid uuid" },
    { body: { confirm: RESYNC_BODY.confirm }, label: "no product id" },
    { body: { ...RESYNC_BODY, force: true }, label: "an extra property" },
  ];

  for (const { body, label } of badBodies) {
    it(`400s on ${label}`, async () => {
      enableProductionSync();

      const response = await postResync(makeHarness(ADMIN), body);

      expect(response.status).toBe(400);
      expect(((await response.json()) as ErrorBody).code).toBe(
        "INVALID_REQUEST",
      );
      expect(insertCalls()).toHaveLength(0);
    });
  }

  it("returns exactly the agreed safe fields", async () => {
    enableProductionSync();

    const response = await postResync(makeHarness(ADMIN));
    const raw = await response.text();
    const body = JSON.parse(raw) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(Object.keys(body).sort()).toEqual([
      "merchantImages",
      "offerId",
      "processedProductName",
      "productId",
      "productInputName",
      "resynced",
    ]);
    expect(raw).not.toContain(ACCESS_TOKEN);
    expect(raw).not.toContain("external_account");
  });

  it("surfaces a refusal with its sanitised status", async () => {
    enableProductionSync();

    const harness = makeHarness(ADMIN, {
      resyncProduct: () =>
        Promise.reject(
          new GoogleMerchantError(
            "PRODUCT_NOT_PURCHASABLE",
            "The product is not ready for Merchant submission (SOLD).",
            409,
          ),
        ),
    });

    const response = await postResync(harness);

    expect(response.status).toBe(409);
    expect((await response.json()) as ErrorBody).toMatchObject({
      code: "PRODUCT_NOT_PURCHASABLE",
    });
  });

  it("never leaks a token or stack trace on an unexpected failure", async () => {
    enableProductionSync();

    const harness = makeHarness(ADMIN, {
      resyncProduct: () =>
        Promise.reject(new Error(`boom token=${ACCESS_TOKEN} postgres://u:p@h/db`)),
    });

    const response = await postResync(harness);
    const raw = await response.text();

    expect(response.status).toBe(500);
    expect(raw).not.toContain(ACCESS_TOKEN);
    expect(raw).not.toContain("postgres://");
    expect(raw).not.toContain("at Object");
  });
});
