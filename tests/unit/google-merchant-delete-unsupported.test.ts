/**
 * Controlled deletion of ONE unsupported Merchant product type.
 *
 * The production case this exists for: `Black Sleeve Satin StretchFit Blouse`
 * reached the Merchant data source before the saree-only eligibility gate
 * existed, and can never legitimately be republished.
 *
 * What these tests prove:
 *   - The primitive issues exactly ONE Merchant API v1 DELETE, at the derived
 *     `accounts/{account}/productInputs/en~IN~{offerId}` resource, pinned to the
 *     configured data source, with bearer auth and no request body. Google's
 *     Empty response is accepted, and every upstream failure is sanitised.
 *   - The orchestration deletes ONLY when the current audit says
 *     UNSUPPORTED_PRODUCT_TYPE. READY, SOLD, RESERVED and image-blocked products
 *     are refused — this is deliberately NOT "delete any non-ready product", so
 *     a future sold saree can never be removed through it.
 *   - Ownership and identity are re-derived from CURRENT Google state: another
 *     data source, a duplicate, a wrong contentLanguage and a wrong feedLabel
 *     each fail closed with no DELETE.
 *   - An already-absent offer reports `deleted: false, alreadyAbsent: true` and
 *     issues NO request — a deletion is never fabricated.
 *   - The route is admin-only, production-only and gated by the existing sync
 *     kill switch, and requires its own confirmation phrase.
 *   - Regression: apply stays INSERT-only and never deletes; the planner keeps
 *     reporting DELETE_CANDIDATE without acting on it.
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
import { SYNC_DELETE_UNSUPPORTED_CONFIRMATION } from "@/api/hono/schemas/google-merchant-sync";
import type { MerchantProductAudit } from "@/lib/google-merchant/catalogue-readiness";
import {
  planCatalogueSync,
  selectInsertBatch,
} from "@/lib/google-merchant/catalogue-sync";
import { GoogleMerchantError } from "@/lib/google-merchant/config";
import {
  buildMerchantProductInputName,
  deleteGoogleMerchantProductInput,
} from "@/lib/google-merchant/delete-product-input";
import type { MerchantProductInput } from "@/lib/google-merchant/product-input";
import {
  applyMerchantCatalogueSyncBatch,
  deleteUnsupportedMerchantProduct,
} from "@/lib/google-merchant/sync-catalogue";
import { createRouteHarness } from "../helpers/route-harness";

// ---------------------------------------------------------------------------
// Fixtures — the real production cleanup case
// ---------------------------------------------------------------------------

const ACCOUNT_ID = "5833526164";
const DATA_SOURCE_ID = "10696807524";
const DATA_SOURCE = `accounts/${ACCOUNT_ID}/dataSources/${DATA_SOURCE_ID}`;
const OTHER_DATA_SOURCE = `accounts/${ACCOUNT_ID}/dataSources/99999999`;
const ACCESS_TOKEN = "ya29.ACCESS-TOKEN-SUPER-SECRET";

/**
 * `Black Sleeve Satin StretchFit Blouse` — the ONE offer we intend to remove.
 * Used as a fixture only: the endpoint works by rules, and no production code
 * anywhere mentions this id.
 */
const BLOUSE_ID = "1bf63a12-c29a-4b18-a9fc-2c9ee41fc22e";
const BLOUSE_NAME = "Black Sleeve Satin StretchFit Blouse";
const SAREE_ID = "6747c35c-682b-4387-a710-b165249470a2";

const EXPECTED_PRODUCT_INPUT_NAME = `accounts/${ACCOUNT_ID}/productInputs/en~IN~${BLOUSE_ID}`;

const LIST_URL_PREFIX = `https://merchantapi.googleapis.com/products/v1/accounts/${ACCOUNT_ID}/products?`;
const DELETE_URL_PREFIX = `https://merchantapi.googleapis.com/products/v1/accounts/${ACCOUNT_ID}/productInputs/`;
const EXPECTED_DELETE_URL =
  `https://merchantapi.googleapis.com/products/v1/${EXPECTED_PRODUCT_INPUT_NAME}` +
  `?dataSource=accounts%2F${ACCOUNT_ID}%2FdataSources%2F${DATA_SOURCE_ID}`;

const mkProductInput = (offerId: string): MerchantProductInput =>
  ({
    contentLanguage: "en",
    feedLabel: "IN",
    offerId,
    productAttributes: { availability: "IN_STOCK", title: "Saree" },
  }) as unknown as MerchantProductInput;

/**
 * An audit entry. An unsupported product carries NO ProductInput — that is the
 * invariant gate D asserts — so `productInput` is non-null only for READY.
 */
const mkAudit = (
  productId: string,
  merchantReadiness = "UNSUPPORTED_PRODUCT_TYPE",
  overrides: { productInput?: MerchantProductInput | null } = {},
): MerchantProductAudit =>
  ({
    imageDiagnostics: {
      duplicateImages: 0,
      ignored: [],
      ignoredImages: 0,
      safeImages: 1,
      totalImages: 1,
    },
    productInput:
      overrides.productInput !== undefined
        ? overrides.productInput
        : merchantReadiness === "READY"
          ? mkProductInput(productId)
          : null,
    report: {
      images: { ignoredImages: 0, safeImages: 1, totalImages: 1 },
      merchantReadiness,
      missingFields: [],
      name: productId === BLOUSE_ID ? BLOUSE_NAME : "Tangerine Noir",
      productId,
      reasons:
        merchantReadiness === "UNSUPPORTED_PRODUCT_TYPE"
          ? ["unsupported_product_type"]
          : [],
      slug: "black-sleeve-satin-stretchfit-blouse",
      status: "published",
      stockStatus: "available",
    },
  }) as MerchantProductAudit;

const googleProduct = (
  offerId: string,
  overrides: Record<string, unknown> = {},
) => ({
  contentLanguage: "en",
  dataSource: DATA_SOURCE,
  feedLabel: "IN",
  name: `accounts/${ACCOUNT_ID}/products/en~IN~${offerId}`,
  offerId,
  productAttributes: { title: BLOUSE_NAME },
  productStatus: { destinationStatuses: [], itemLevelIssues: [] },
  ...overrides,
});

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });

/** Google answers `productInputs.delete` with an empty body. */
const emptyResponse = (status = 200): Response =>
  new Response(null, { status });

const fetchMock = vi.fn();

const stubGoogle = (options: {
  products?: unknown[];
  onDelete?: () => Response;
}) => {
  fetchMock.mockImplementation((url: string) => {
    if (url.startsWith(LIST_URL_PREFIX)) {
      return Promise.resolve(
        jsonResponse(200, { products: options.products ?? [] }),
      );
    }

    if (url.startsWith(DELETE_URL_PREFIX)) {
      return Promise.resolve(
        options.onDelete ? options.onDelete() : emptyResponse(),
      );
    }

    return Promise.reject(new Error(`unexpected fetch: ${url}`));
  });
};

const deleteCalls = () =>
  fetchMock.mock.calls.filter(([url]) =>
    String(url).startsWith(DELETE_URL_PREFIX),
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
  // The point of every refusal: NOTHING was deleted.
  expect(deleteCalls()).toHaveLength(0);

  return error as GoogleMerchantError;
};

const stubAudit = (audits: MerchantProductAudit[]) =>
  runAuditMock.mockResolvedValue({
    audits,
    summary: {},
    totalPublishedProducts: audits.length,
    truncated: false,
  });

beforeEach(() => {
  vi.stubEnv("GOOGLE_MERCHANT_ACCOUNT_ID", ACCOUNT_ID);
  vi.stubEnv("GOOGLE_MERCHANT_DATA_SOURCE_ID", DATA_SOURCE_ID);
  vi.stubEnv("GOOGLE_MERCHANT_DATA_SOURCE_NAME", DATA_SOURCE);
  vi.stubEnv("GOOGLE_MERCHANT_DEVELOPER_EMAIL", "ops@example.com");

  getAccessTokenMock.mockResolvedValue(ACCESS_TOKEN);
  stubAudit([mkAudit(BLOUSE_ID)]);
  stubGoogle({ products: [googleProduct(BLOUSE_ID)] });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// The delete primitive
// ---------------------------------------------------------------------------

describe("buildMerchantProductInputName", () => {
  it("derives the contentLanguage~feedLabel~offerId resource name", () => {
    expect(buildMerchantProductInputName(ACCOUNT_ID, BLOUSE_ID)).toBe(
      EXPECTED_PRODUCT_INPUT_NAME,
    );
  });

  it("refuses an offer id that is not a product UUID", () => {
    for (const bad of [
      "not-a-uuid",
      "../../accounts/999/productInputs/x",
      "en~IN~1bf63a12-c29a-4b18-a9fc-2c9ee41fc22e",
      `${BLOUSE_ID}?dataSource=other`,
      "",
    ]) {
      expect(() => buildMerchantProductInputName(ACCOUNT_ID, bad)).toThrow(
        GoogleMerchantError,
      );
    }
  });
});

describe("deleteGoogleMerchantProductInput", () => {
  it("sends exactly ONE DELETE to the Merchant API v1 ProductInput", async () => {
    stubGoogle({});

    const result = await deleteGoogleMerchantProductInput(BLOUSE_ID);

    expect(deleteCalls()).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = deleteCalls()[0] as [string, RequestInit];

    expect(url).toBe(EXPECTED_DELETE_URL);
    expect(init.method).toBe("DELETE");
    expect(result).toEqual({
      deleted: true,
      offerId: BLOUSE_ID,
      productInputName: EXPECTED_PRODUCT_INPUT_NAME,
    });
  });

  it("targets the configured account and the pinned data source", async () => {
    stubGoogle({});

    await deleteGoogleMerchantProductInput(BLOUSE_ID);

    const [url] = deleteCalls()[0] as [string];

    expect(url).toContain(`/accounts/${ACCOUNT_ID}/productInputs/`);
    expect(url).toContain(`en~IN~${BLOUSE_ID}`);
    expect(url).toContain(
      `dataSource=accounts%2F${ACCOUNT_ID}%2FdataSources%2F${DATA_SOURCE_ID}`,
    );
    expect(url).not.toContain(OTHER_DATA_SOURCE);
  });

  it("authenticates with the shared bearer helper and sends no body", async () => {
    stubGoogle({});

    await deleteGoogleMerchantProductInput(BLOUSE_ID, {
      accessToken: ACCESS_TOKEN,
    });

    const [, init] = deleteCalls()[0] as [string, RequestInit];

    expect(init.headers).toEqual({ Authorization: `Bearer ${ACCESS_TOKEN}` });
    expect(init.body).toBeUndefined();
  });

  it("reuses a supplied access token rather than minting another", async () => {
    stubGoogle({});

    await deleteGoogleMerchantProductInput(BLOUSE_ID, {
      accessToken: ACCESS_TOKEN,
    });

    expect(getAccessTokenMock).not.toHaveBeenCalled();
  });

  it("mints a token when none is supplied", async () => {
    stubGoogle({});

    await deleteGoogleMerchantProductInput(BLOUSE_ID);

    expect(getAccessTokenMock).toHaveBeenCalledTimes(1);
  });

  it("accepts Google's Empty response, parsing nothing", async () => {
    for (const status of [200, 204]) {
      fetchMock.mockReset();
      stubGoogle({ onDelete: () => emptyResponse(status) });

      await expect(
        deleteGoogleMerchantProductInput(BLOUSE_ID),
      ).resolves.toMatchObject({ deleted: true });
    }
  });

  const upstreamFailures: Array<{ code: string; status: number }> = [
    { code: "GOOGLE_UNAUTHENTICATED", status: 401 },
    { code: "GOOGLE_PERMISSION_DENIED", status: 403 },
    { code: "GOOGLE_RATE_LIMITED", status: 429 },
    { code: "GOOGLE_UNAVAILABLE", status: 500 },
    { code: "GOOGLE_UNAVAILABLE", status: 503 },
    { code: "GOOGLE_REQUEST_FAILED", status: 400 },
    { code: "GOOGLE_REQUEST_FAILED", status: 404 },
  ];

  for (const { code, status } of upstreamFailures) {
    it(`sanitises an upstream ${status}`, async () => {
      stubGoogle({
        onDelete: () =>
          jsonResponse(status, {
            error: {
              details: [{ authorization: `Bearer ${ACCESS_TOKEN}` }],
              message: `secret upstream detail for ${DATA_SOURCE}`,
              status: "PERMISSION_DENIED",
            },
          }),
      });

      const error = await deleteGoogleMerchantProductInput(BLOUSE_ID).catch(
        (caught: unknown) => caught,
      );

      expect(error).toBeInstanceOf(GoogleMerchantError);
      expect((error as GoogleMerchantError).code).toBe(code);
      expect((error as GoogleMerchantError).message).not.toContain(
        "secret upstream detail",
      );
      expect((error as GoogleMerchantError).message).not.toContain(ACCESS_TOKEN);
    });
  }

  it("never leaks the token or a raw Google body into the logs", async () => {
    stubGoogle({
      onDelete: () =>
        jsonResponse(403, { error: { message: `raw ${ACCESS_TOKEN}` } }),
    });

    await deleteGoogleMerchantProductInput(BLOUSE_ID).catch(() => undefined);

    expect(loggedText()).not.toContain(ACCESS_TOKEN);
    expect(loggedText()).not.toContain("raw ya29");
  });

  it("sanitises a network failure without surfacing the request", async () => {
    fetchMock.mockRejectedValue(new Error(`socket died ${ACCESS_TOKEN}`));

    const error = await deleteGoogleMerchantProductInput(BLOUSE_ID).catch(
      (caught: unknown) => caught,
    );

    expect((error as GoogleMerchantError).code).toBe("GOOGLE_REQUEST_FAILED");
    expect((error as GoogleMerchantError).message).not.toContain(ACCESS_TOKEN);
  });
});

// ---------------------------------------------------------------------------
// Orchestration — happy path
// ---------------------------------------------------------------------------

describe("deleteUnsupportedMerchantProduct — the production cleanup case", () => {
  it("deletes the unsupported blouse exactly once", async () => {
    const result = await deleteUnsupportedMerchantProduct(BLOUSE_ID);

    expect(result).toEqual({
      deleted: true,
      offerId: BLOUSE_ID,
      productId: BLOUSE_ID,
      productInputName: EXPECTED_PRODUCT_INPUT_NAME,
    });
    expect(deleteCalls()).toHaveLength(1);
  });

  it("issues the delete at the exact expected URL", async () => {
    await deleteUnsupportedMerchantProduct(BLOUSE_ID);

    const [url, init] = deleteCalls()[0] as [string, RequestInit];

    expect(url).toBe(EXPECTED_DELETE_URL);
    expect(init.method).toBe("DELETE");
  });

  it("recomputes local and Google state before writing", async () => {
    await deleteUnsupportedMerchantProduct(BLOUSE_ID);

    expect(runAuditMock).toHaveBeenCalledTimes(1);
    expect(
      fetchMock.mock.calls.filter(([url]) =>
        String(url).startsWith(LIST_URL_PREFIX),
      ),
    ).toHaveLength(1);
  });

  it("mints one access token and reuses it for the read and the delete", async () => {
    await deleteUnsupportedMerchantProduct(BLOUSE_ID);

    expect(getAccessTokenMock).toHaveBeenCalledTimes(1);
    for (const [, init] of fetchMock.mock.calls) {
      expect((init as RequestInit).headers).toMatchObject({
        Authorization: `Bearer ${ACCESS_TOKEN}`,
      });
    }
  });

  it("leaves every other managed offer untouched", async () => {
    stubAudit([mkAudit(BLOUSE_ID), mkAudit(SAREE_ID, "READY")]);
    stubGoogle({
      products: [googleProduct(BLOUSE_ID), googleProduct(SAREE_ID)],
    });

    await deleteUnsupportedMerchantProduct(BLOUSE_ID);

    expect(deleteCalls()).toHaveLength(1);
    expect(String(deleteCalls()[0][0])).toContain(BLOUSE_ID);
    expect(String(deleteCalls()[0][0])).not.toContain(SAREE_ID);
  });

  it("never logs the access token", async () => {
    await deleteUnsupportedMerchantProduct(BLOUSE_ID);

    expect(loggedText()).not.toContain(ACCESS_TOKEN);
  });
});

// ---------------------------------------------------------------------------
// Orchestration — already absent
// ---------------------------------------------------------------------------

describe("deleteUnsupportedMerchantProduct — already absent", () => {
  it("issues no DELETE and does not claim one, when the offer is gone", async () => {
    stubGoogle({ products: [] });

    const result = await deleteUnsupportedMerchantProduct(BLOUSE_ID);

    expect(result).toEqual({
      alreadyAbsent: true,
      deleted: false,
      offerId: BLOUSE_ID,
      productId: BLOUSE_ID,
    });
    expect(deleteCalls()).toHaveLength(0);
  });

  it("treats an offer in another data source as absent, never deleting it", async () => {
    stubGoogle({
      products: [googleProduct(BLOUSE_ID, { dataSource: OTHER_DATA_SOURCE })],
    });

    const result = await deleteUnsupportedMerchantProduct(BLOUSE_ID);

    expect(result).toMatchObject({ alreadyAbsent: true, deleted: false });
    expect(deleteCalls()).toHaveLength(0);
  });

  it("is idempotent: delete, then Google reconciles, then a safe no-op", async () => {
    const first = await deleteUnsupportedMerchantProduct(BLOUSE_ID);
    expect(first).toMatchObject({ deleted: true });
    expect(deleteCalls()).toHaveLength(1);

    // Google has now removed the processed product from products.list.
    fetchMock.mockClear();
    stubGoogle({ products: [] });

    const second = await deleteUnsupportedMerchantProduct(BLOUSE_ID);

    expect(second).toMatchObject({ alreadyAbsent: true, deleted: false });
    expect(deleteCalls()).toHaveLength(0);
  });

  it("deletes again while Google is still lagging — processing is async", async () => {
    // Between the accepted delete and Google's reconciliation the offer still
    // appears in products.list. A second call inside that window is a real
    // delete, not a fabricated one; upstream it is idempotent.
    await deleteUnsupportedMerchantProduct(BLOUSE_ID);
    const second = await deleteUnsupportedMerchantProduct(BLOUSE_ID);

    expect(second).toMatchObject({ deleted: true });
    expect(deleteCalls()).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Orchestration — refusals
// ---------------------------------------------------------------------------

describe("deleteUnsupportedMerchantProduct — refusals", () => {
  it("refuses an invalid UUID before any work", async () => {
    await expectRefusal(
      deleteUnsupportedMerchantProduct("not-a-uuid"),
      "PRODUCT_NOT_FOUND",
    );
    expect(runAuditMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a product absent from the published catalogue", async () => {
    stubAudit([mkAudit(SAREE_ID, "READY")]);

    await expectRefusal(
      deleteUnsupportedMerchantProduct(BLOUSE_ID),
      "PRODUCT_NOT_FOUND",
    );
  });

  /**
   * The critical gate. Anything other than UNSUPPORTED_PRODUCT_TYPE is refused,
   * so this can never become a generic "delete any non-ready product" path —
   * a future SOLD saree must stay in Merchant, not be permanently removed.
   */
  const protectedStates = [
    "READY",
    "SOLD",
    "RESERVED",
    "NO_MERCHANT_SAFE_IMAGE",
    "MISSING_REQUIRED_ATTRIBUTES",
    "NO_VALID_IMAGE",
    "INVALID_PRICE",
    "INVALID_LANDING_PAGE",
    "NOT_PUBLISHED",
    "EXCLUDED_TEST_PRODUCT",
    "MAPPING_ERROR",
  ];

  for (const state of protectedStates) {
    it(`refuses a ${state} product`, async () => {
      stubAudit([mkAudit(BLOUSE_ID, state)]);

      const error = await expectRefusal(
        deleteUnsupportedMerchantProduct(BLOUSE_ID),
        "MERCHANT_DELETE_NOT_PERMITTED",
      );

      expect(error.message).toContain(state);
      expect(error.status).toBe(409);
    });
  }

  it("refuses when an unsupported product unexpectedly carries a ProductInput", async () => {
    stubAudit([
      mkAudit(BLOUSE_ID, "UNSUPPORTED_PRODUCT_TYPE", {
        productInput: mkProductInput(BLOUSE_ID),
      }),
    ]);

    const error = await expectRefusal(
      deleteUnsupportedMerchantProduct(BLOUSE_ID),
      "MERCHANT_DELETE_INVARIANT_VIOLATED",
    );

    expect(error.status).toBe(500);
  });

  it("refuses when the offer is duplicated in our data source", async () => {
    stubGoogle({
      products: [googleProduct(BLOUSE_ID), googleProduct(BLOUSE_ID)],
    });

    await expectRefusal(
      deleteUnsupportedMerchantProduct(BLOUSE_ID),
      "GOOGLE_REQUEST_FAILED",
    );
  });

  it("refuses an unexpected content language", async () => {
    stubGoogle({
      products: [googleProduct(BLOUSE_ID, { contentLanguage: "hi" })],
    });

    const error = await expectRefusal(
      deleteUnsupportedMerchantProduct(BLOUSE_ID),
      "GOOGLE_REQUEST_FAILED",
    );

    expect(error.message).toContain("content language");
  });

  it("refuses an unexpected feed label", async () => {
    stubGoogle({ products: [googleProduct(BLOUSE_ID, { feedLabel: "US" })] });

    const error = await expectRefusal(
      deleteUnsupportedMerchantProduct(BLOUSE_ID),
      "GOOGLE_REQUEST_FAILED",
    );

    expect(error.message).toContain("feed label");
  });

  it("ignores a same-offerId product owned by another source when ours conflicts", async () => {
    // Ownership is filtered BEFORE identity, so a foreign offer can neither
    // satisfy nor corrupt the uniqueness check.
    stubGoogle({
      products: [
        googleProduct(BLOUSE_ID, { dataSource: OTHER_DATA_SOURCE }),
        googleProduct(BLOUSE_ID, { dataSource: OTHER_DATA_SOURCE }),
      ],
    });

    const result = await deleteUnsupportedMerchantProduct(BLOUSE_ID);

    expect(result).toMatchObject({ alreadyAbsent: true, deleted: false });
    expect(deleteCalls()).toHaveLength(0);
  });

  it("surfaces a sanitised Google failure from the delete itself", async () => {
    stubGoogle({
      onDelete: () => jsonResponse(403, { error: { message: "nope" } }),
      products: [googleProduct(BLOUSE_ID)],
    });

    const error = await deleteUnsupportedMerchantProduct(BLOUSE_ID).catch(
      (caught: unknown) => caught,
    );

    expect((error as GoogleMerchantError).code).toBe(
      "GOOGLE_PERMISSION_DENIED",
    );
    expect((error as GoogleMerchantError).message).not.toContain("nope");
  });
});

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

type ErrorBody = { code: string; message: string };

const ADMIN = { email: "admin@example.com", id: "admin-1", role: "admin" };
const CUSTOMER = { email: "user@example.com", id: "user-1", role: "customer" };

const DELETE_BODY = {
  confirm: SYNC_DELETE_UNSUPPORTED_CONFIRMATION,
  productId: BLOUSE_ID,
};

const makeHarness = (
  authUser: { email: string; id: string; role: string } | null,
  deps: Parameters<typeof registerGoogleMerchantSyncRoutes>[1] = {},
) =>
  createRouteHarness({
    authUser,
    register: (app) => registerGoogleMerchantSyncRoutes(app, deps),
  });

const postDelete = (
  harness: ReturnType<typeof createRouteHarness>,
  body: unknown = DELETE_BODY,
) =>
  harness.request("/catalogue-sync/delete", {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

const enableProductionSync = () => {
  vi.stubEnv("GOOGLE_MERCHANT_CATALOGUE_SYNC_ENABLED", "true");
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("ADMIN_API_SECRET", undefined);
};

describe("POST /catalogue-sync/delete — gates", () => {
  it("confirms the phrase is the documented one", () => {
    expect(SYNC_DELETE_UNSUPPORTED_CONFIRMATION).toBe(
      "DELETE_FTT_UNSUPPORTED_GOOGLE_MERCHANT_PRODUCT",
    );
  });

  it("404s when the sync kill switch is off", async () => {
    enableProductionSync();
    vi.stubEnv("GOOGLE_MERCHANT_CATALOGUE_SYNC_ENABLED", "false");

    const deleteUnsupportedProduct = vi.fn();

    expect(
      (await postDelete(makeHarness(ADMIN, { deleteUnsupportedProduct })))
        .status,
    ).toBe(404);
    expect(deleteUnsupportedProduct).not.toHaveBeenCalled();
    expect(deleteCalls()).toHaveLength(0);
  });

  it("404s when the kill switch is unset entirely", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("GOOGLE_MERCHANT_CATALOGUE_SYNC_ENABLED", undefined);

    expect((await postDelete(makeHarness(ADMIN))).status).toBe(404);
  });

  it("404s outside production", async () => {
    enableProductionSync();
    vi.stubEnv("VERCEL_ENV", "preview");

    expect((await postDelete(makeHarness(ADMIN))).status).toBe(404);
    expect(deleteCalls()).toHaveLength(0);
  });

  it("returns the same opaque 404 body for both gates", async () => {
    enableProductionSync();
    vi.stubEnv("GOOGLE_MERCHANT_CATALOGUE_SYNC_ENABLED", "false");
    const disabled = await (await postDelete(makeHarness(ADMIN))).text();

    enableProductionSync();
    vi.stubEnv("VERCEL_ENV", "preview");
    const notProduction = await (await postDelete(makeHarness(ADMIN))).text();

    expect(disabled).toBe(notProduction);
  });

  it("401s unauthenticated and 403s a non-admin", async () => {
    enableProductionSync();
    const deleteUnsupportedProduct = vi.fn();

    expect(
      (await postDelete(makeHarness(null, { deleteUnsupportedProduct }))).status,
    ).toBe(401);
    expect(
      (await postDelete(makeHarness(CUSTOMER, { deleteUnsupportedProduct })))
        .status,
    ).toBe(403);
    expect(deleteUnsupportedProduct).not.toHaveBeenCalled();
  });

  const badBodies: Array<{ body: unknown; label: string }> = [
    { body: { ...DELETE_BODY, confirm: "DELETE" }, label: "a wrong phrase" },
    {
      body: { ...DELETE_BODY, confirm: "RESYNC_FTT_GOOGLE_MERCHANT_PRODUCT" },
      label: "another endpoint's phrase",
    },
    { body: { productId: BLOUSE_ID }, label: "no confirmation" },
    { body: { confirm: DELETE_BODY.confirm }, label: "no product id" },
    {
      body: { ...DELETE_BODY, productId: "not-a-uuid" },
      label: "an invalid uuid",
    },
    { body: { ...DELETE_BODY, force: true }, label: "an extra property" },
    { body: null, label: "an empty body" },
  ];

  for (const { body, label } of badBodies) {
    it(`400s for ${label}`, async () => {
      enableProductionSync();
      const deleteUnsupportedProduct = vi.fn();

      const response = await postDelete(
        makeHarness(ADMIN, { deleteUnsupportedProduct }),
        body,
      );

      expect(response.status).toBe(400);
      expect(((await response.json()) as ErrorBody).code).toBe(
        "INVALID_REQUEST",
      );
      expect(deleteUnsupportedProduct).not.toHaveBeenCalled();
    });
  }
});

describe("POST /catalogue-sync/delete — behaviour", () => {
  it("delegates once with the requested product id", async () => {
    enableProductionSync();
    const deleteUnsupportedProduct = vi.fn().mockResolvedValue({
      deleted: true,
      offerId: BLOUSE_ID,
      productId: BLOUSE_ID,
      productInputName: EXPECTED_PRODUCT_INPUT_NAME,
    });

    const response = await postDelete(
      makeHarness(ADMIN, { deleteUnsupportedProduct }),
    );

    expect(response.status).toBe(200);
    expect(deleteUnsupportedProduct).toHaveBeenCalledTimes(1);
    expect(deleteUnsupportedProduct).toHaveBeenCalledWith(BLOUSE_ID);
    expect(await response.json()).toEqual({
      deleted: true,
      offerId: BLOUSE_ID,
      productId: BLOUSE_ID,
      productInputName: EXPECTED_PRODUCT_INPUT_NAME,
    });
  });

  it("returns the already-absent outcome as a 200, not a fake success", async () => {
    enableProductionSync();
    const deleteUnsupportedProduct = vi.fn().mockResolvedValue({
      alreadyAbsent: true,
      deleted: false,
      offerId: BLOUSE_ID,
      productId: BLOUSE_ID,
    });

    const response = await postDelete(
      makeHarness(ADMIN, { deleteUnsupportedProduct }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      alreadyAbsent: true,
      deleted: false,
      offerId: BLOUSE_ID,
      productId: BLOUSE_ID,
    });
  });

  it("surfaces a refusal with its sanitised status and code", async () => {
    enableProductionSync();

    const response = await postDelete(
      makeHarness(ADMIN, {
        deleteUnsupportedProduct: () =>
          Promise.reject(
            new GoogleMerchantError(
              "MERCHANT_DELETE_NOT_PERMITTED",
              "Only a product whose Merchant readiness is UNSUPPORTED_PRODUCT_TYPE may be deleted (this product is SOLD).",
              409,
            ),
          ),
      }),
    );

    expect(response.status).toBe(409);
    expect((await response.json()) as ErrorBody).toMatchObject({
      code: "MERCHANT_DELETE_NOT_PERMITTED",
    });
  });

  it("never leaks a token, DSN or stack trace on an unexpected failure", async () => {
    enableProductionSync();

    const response = await postDelete(
      makeHarness(ADMIN, {
        deleteUnsupportedProduct: () =>
          Promise.reject(
            new Error(`boom token=${ACCESS_TOKEN} postgres://u:p@h/db`),
          ),
      }),
    );
    const raw = await response.text();

    expect(response.status).toBe(500);
    expect(raw).not.toContain(ACCESS_TOKEN);
    expect(raw).not.toContain("postgres://");
    expect(JSON.parse(raw)).toEqual({
      code: "CATALOGUE_SYNC_FAILED",
      message: "The product deletion could not be completed.",
    });
  });

  it("exposes only the agreed safe keys", async () => {
    enableProductionSync();

    const response = await postDelete(
      makeHarness(ADMIN, {
        deleteUnsupportedProduct: () =>
          Promise.resolve({
            deleted: true as const,
            offerId: BLOUSE_ID,
            productId: BLOUSE_ID,
            productInputName: EXPECTED_PRODUCT_INPUT_NAME,
          }),
      }),
    );

    const body = (await response.json()) as Record<string, unknown>;

    expect(Object.keys(body).sort()).toEqual([
      "deleted",
      "offerId",
      "productId",
      "productInputName",
    ]);
    expect(JSON.stringify(body)).not.toContain("dataSources");
  });

  it("runs the full stack end to end for the production cleanup case", async () => {
    enableProductionSync();

    const response = await postDelete(makeHarness(ADMIN));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      deleted: true,
      offerId: BLOUSE_ID,
      productId: BLOUSE_ID,
      productInputName: EXPECTED_PRODUCT_INPUT_NAME,
    });
    expect(deleteCalls()).toHaveLength(1);
    expect(String(deleteCalls()[0][0])).toBe(EXPECTED_DELETE_URL);
  });
});

// ---------------------------------------------------------------------------
// Regression — nothing else deletes
// ---------------------------------------------------------------------------

describe("no other path deletes", () => {
  it("keeps applyMerchantCatalogueSyncBatch INSERT-only", async () => {
    stubAudit([
      mkAudit(SAREE_ID, "READY"),
      mkAudit(BLOUSE_ID, "UNSUPPORTED_PRODUCT_TYPE"),
    ]);
    // The blouse is present in Google, i.e. a live DELETE_CANDIDATE.
    stubGoogle({ products: [googleProduct(BLOUSE_ID)] });

    await applyMerchantCatalogueSyncBatch(5);

    expect(deleteCalls()).toHaveLength(0);
    expect(
      fetchMock.mock.calls.filter(
        ([, init]) => (init as RequestInit)?.method === "DELETE",
      ),
    ).toHaveLength(0);
  });

  it("keeps DELETE_CANDIDATE a report the planner never acts on", () => {
    const audits = [
      mkAudit(BLOUSE_ID, "UNSUPPORTED_PRODUCT_TYPE"),
      mkAudit(SAREE_ID, "READY"),
    ];

    const plan = planCatalogueSync(
      audits,
      [
        {
          availability: null,
          contentLanguage: "en",
          dataSource: DATA_SOURCE,
          destinationStatuses: [],
          feedLabel: "IN",
          itemLevelIssues: [],
          name: `accounts/${ACCOUNT_ID}/products/en~IN~${BLOUSE_ID}`,
          offerId: BLOUSE_ID,
          price: null,
          title: BLOUSE_NAME,
        },
      ],
      DATA_SOURCE,
    );

    const candidate = plan.actions.find(
      (action) => action.report.offerId === BLOUSE_ID,
    );

    expect(candidate?.report.action).toBe("DELETE_CANDIDATE");
    expect(candidate?.report.reason).toBe("UNSUPPORTED_PRODUCT_TYPE");
    expect(candidate?.productInput).toBeNull();
    expect(plan.summary.deleteCandidates).toBe(1);
    // The batch selector still takes INSERTs only.
    expect(
      selectInsertBatch(plan, 5).map((action) => action.report.offerId),
    ).toEqual([SAREE_ID]);
  });
});
