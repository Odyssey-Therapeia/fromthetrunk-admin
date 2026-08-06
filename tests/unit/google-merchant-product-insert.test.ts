/**
 * Controlled Merchant Center product insertion — service + admin route.
 *
 * SERVICE (lib/google-merchant/insert-product.ts):
 *   - Loads the product through getProduct (no raw SQL) and refuses any id
 *     other than the one controlled product.
 *   - Refuses a missing, draft, wrongly-slugged, sold or reserved product.
 *   - Honours the inventory-v2 flag: reservations are counted and
 *     deriveStockStatus decides purchasability; with the flag off the
 *     stockStatus column decides and the reservations query is not run.
 *   - Calls productInputs:insert with a URLSearchParams-encoded dataSource and
 *     a bearer token, then strictly validates the ProductInput response.
 *   - Every upstream/network/malformed case fails closed with a sanitised
 *     error — no token, no WIF config, no database row, no stack trace.
 *
 * ROUTE (POST /api/v2/integrations/google-merchant/products/test-insert):
 *   - Kill switch and production gate return an indistinguishable 404 and run
 *     BEFORE authentication.
 *   - Admin-only; the product id and confirmation phrase are both literals.
 *   - Success returns exactly inserted/productId/offerId/productInputName/
 *     processedProductName; incomplete data returns the 422 contract.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks — database, flags, auth, logger
// ---------------------------------------------------------------------------

const getProductMock = vi.hoisted(() => vi.fn());
vi.mock("@/db/queries/products", () => ({ getProduct: getProductMock }));

const getReservationCountsMock = vi.hoisted(() => vi.fn());
vi.mock("@/db/queries/reservations", () => ({
  getBatchActiveReservationsCounts: getReservationCountsMock,
}));

const isInventoryV2Mock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/config/flags", () => ({ isInventoryV2: isInventoryV2Mock }));

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

import { registerGoogleMerchantProductRoutes } from "@/api/hono/routes/google-merchant-products";
import { INSERT_PRODUCT_CONFIRMATION } from "@/api/hono/schemas/google-merchant-product";
import type { ProductWithRelations } from "@/db/queries/products";
import {
  GoogleMerchantError,
  GoogleMerchantProductDataError,
} from "@/lib/google-merchant/config";
import { insertGoogleMerchantTestProduct } from "@/lib/google-merchant/insert-product";
import type { GoogleMerchantInsertResult } from "@/lib/google-merchant/insert-product";
import {
  TEST_INSERT_PRODUCT_ID,
  TEST_INSERT_PRODUCT_SLUG,
} from "@/lib/google-merchant/product-input";
import { createRouteHarness } from "../helpers/route-harness";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ACCOUNT_ID = "5833526164";
const DATA_SOURCE_ID = "10696807524";
const DATA_SOURCE_NAME = `accounts/${ACCOUNT_ID}/dataSources/${DATA_SOURCE_ID}`;
const DEVELOPER_EMAIL = "partner-access@odysseytherapeia.com";
const ACCESS_TOKEN = "ya29.ACCESS-TOKEN-SUPER-SECRET";

const EXPECTED_URL =
  `https://merchantapi.googleapis.com/products/v1/accounts/${ACCOUNT_ID}` +
  `/productInputs:insert?dataSource=accounts%2F${ACCOUNT_ID}%2FdataSources%2F${DATA_SOURCE_ID}`;

const PRODUCT_INPUT_NAME = `accounts/${ACCOUNT_ID}/productInputs/en~IN~${TEST_INSERT_PRODUCT_ID}`;
const PROCESSED_PRODUCT_NAME = `accounts/${ACCOUNT_ID}/products/en~IN~${TEST_INSERT_PRODUCT_ID}`;

const NOW = new Date("2026-01-01T00:00:00.000Z");

const mkMedia = (url: string) => ({
  alt: null,
  blurDataUrl: null,
  createdAt: NOW,
  filename: "img.jpg",
  filesize: null,
  height: null,
  id: "media-1",
  key: "media/img.jpg",
  metadata: null,
  mimeType: "image/jpeg",
  updatedAt: NOW,
  url,
  width: null,
});

function mkProduct(
  overrides: Record<string, unknown> = {},
): ProductWithRelations {
  return {
    artisanId: null,
    attributes: {
      ageGroup: "adult",
      color: "Tangerine",
      fabric: "Chiffon",
      gender: "female",
      size: "Free Size",
    },
    collection: null,
    collectionId: null,
    createdAt: NOW,
    detailsCondition: "Excellent condition",
    detailsDesigner: null,
    detailsFabric: "Chiffon",
    detailsLength: null,
    detailsWidth: null,
    featured: false,
    id: TEST_INSERT_PRODUCT_ID,
    images: [
      {
        media: mkMedia("https://blob.vercel-storage.com/img1.jpg"),
        sortOrder: 0,
      },
    ],
    metadata: null,
    name: "Tangerine Noir Floral Border Weave",
    originalPricePaise: null,
    pricePaise: 524900,
    quantityAvailable: 1,
    reservedUntil: null,
    slug: TEST_INSERT_PRODUCT_SLUG,
    soldAt: null,
    status: "published",
    stockStatus: "available",
    storyEra: null,
    storyNarrative: "A tangerine chiffon with a noir floral border.",
    storyProvenance: null,
    storyTitle: "Tangerine Noir",
    tags: [],
    typeId: null,
    updatedAt: NOW,
    ...overrides,
  } as unknown as ProductWithRelations;
}

/**
 * A realistic ProductInput response.
 *
 * NOTE: it carries NO `dataSource` — that field belongs to the processed
 * Product resource (accounts.products.get), not to ProductInput. Requiring it
 * used to turn a successful insert into a 502.
 */
const successBody = (overrides: Record<string, unknown> = {}) => ({
  contentLanguage: "en",
  feedLabel: "IN",
  name: PRODUCT_INPUT_NAME,
  offerId: TEST_INSERT_PRODUCT_ID,
  product: PROCESSED_PRODUCT_NAME,
  productAttributes: { title: "Tangerine Noir Floral Border Weave" },
  versionNumber: "1",
  ...overrides,
});

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });

const textResponse = (status: number, body: string): Response =>
  new Response(body, { status });

const fetchMock = vi.fn();

const loggedText = (): string =>
  [logMock.debug, logMock.error, logMock.info, logMock.warn]
    .flatMap((fn) => fn.mock.calls)
    .map((args) => JSON.stringify(args))
    .join("|");

const stubServiceEnv = (overrides: Record<string, string | undefined> = {}) => {
  const env: Record<string, string | undefined> = {
    GOOGLE_MERCHANT_ACCOUNT_ID: ACCOUNT_ID,
    GOOGLE_MERCHANT_DATA_SOURCE_ID: DATA_SOURCE_ID,
    GOOGLE_MERCHANT_DATA_SOURCE_NAME: DATA_SOURCE_NAME,
    GOOGLE_MERCHANT_DEVELOPER_EMAIL: DEVELOPER_EMAIL,
    ...overrides,
  };

  for (const [key, value] of Object.entries(env)) {
    vi.stubEnv(key, value);
  }
};

const expectMerchantError = async (
  promise: Promise<unknown>,
  code: string,
): Promise<GoogleMerchantError> => {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );

  expect(error).toBeInstanceOf(GoogleMerchantError);
  const merchantError = error as GoogleMerchantError;

  expect(merchantError.code).toBe(code);
  expect(merchantError.message).not.toContain(ACCESS_TOKEN);
  expect(merchantError.message).not.toContain("external_account");

  const logged = loggedText();
  expect(logged).not.toContain(ACCESS_TOKEN);
  expect(logged).not.toContain("external_account");

  return merchantError;
};

beforeEach(() => {
  getProductMock.mockResolvedValue(mkProduct());
  getReservationCountsMock.mockResolvedValue(new Map());
  isInventoryV2Mock.mockReturnValue(false);
  getAccessTokenMock.mockResolvedValue(ACCESS_TOKEN);
  fetchMock.mockResolvedValue(jsonResponse(200, successBody()));
  vi.stubGlobal("fetch", fetchMock);
  stubServiceEnv();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// Service — happy path
// ---------------------------------------------------------------------------

describe("insertGoogleMerchantTestProduct — successful insertion", () => {
  it("returns the sanitised insertion result", async () => {
    await expect(insertGoogleMerchantTestProduct()).resolves.toEqual({
      inserted: true,
      offerId: TEST_INSERT_PRODUCT_ID,
      processedProductName: PROCESSED_PRODUCT_NAME,
      productId: TEST_INSERT_PRODUCT_ID,
      productInputName: PRODUCT_INPUT_NAME,
    });
  });

  it("loads the product through getProduct, not raw SQL", async () => {
    await insertGoogleMerchantTestProduct();

    expect(getProductMock).toHaveBeenCalledWith(TEST_INSERT_PRODUCT_ID);
  });

  it("POSTs to productInputs:insert with the encoded dataSource query", async () => {
    await insertGoogleMerchantTestProduct();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(url).toBe(EXPECTED_URL);
    expect(url).toContain("dataSource=accounts%2F");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    });
  });

  it("sends the product UUID as offerId, never the slug", async () => {
    await insertGoogleMerchantTestProduct();

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as {
      contentLanguage: string;
      feedLabel: string;
      offerId: string;
    };

    expect(body.offerId).toBe(TEST_INSERT_PRODUCT_ID);
    expect(body.offerId).not.toBe(TEST_INSERT_PRODUCT_SLUG);
    expect(body.contentLanguage).toBe("en");
    expect(body.feedLabel).toBe("IN");
  });

  it("sends integer micros for the price", async () => {
    await insertGoogleMerchantTestProduct();

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as {
      productAttributes: { price: { amountMicros: string } };
    };

    expect(body.productAttributes.price).toEqual({
      amountMicros: "5249000000",
      currencyCode: "INR",
    });
  });

  it("never logs the access token", async () => {
    await insertGoogleMerchantTestProduct();

    expect(loggedText()).not.toContain(ACCESS_TOKEN);
  });

  const appOrigins = [
    "https://admin.fromthetrunk.shop",
    "http://localhost:3001",
    "https://ftt-admin-git-preview-odyssey-therapeia.vercel.app",
  ];

  for (const origin of appOrigins) {
    it(`sends storefront links to Google when the app domain is ${origin}`, async () => {
      vi.stubEnv("NEXT_PUBLIC_SERVER_URL", origin);

      await insertGoogleMerchantTestProduct();

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const rawBody = String(init.body);
      const body = JSON.parse(rawBody) as {
        productAttributes: { canonicalLink: string; link: string };
      };

      expect(body.productAttributes.link).toBe(
        `https://www.fromthetrunk.shop/collection/${TEST_INSERT_PRODUCT_SLUG}`,
      );
      expect(body.productAttributes.canonicalLink).toBe(
        body.productAttributes.link,
      );

      // Nothing anywhere in the request may carry the admin/app domain.
      expect(rawBody).not.toContain("admin.fromthetrunk.shop");
      expect(rawBody).not.toContain("localhost");
      expect(rawBody).not.toContain("vercel.app");
    });
  }
});

// ---------------------------------------------------------------------------
// Service — product state
// ---------------------------------------------------------------------------

describe("insertGoogleMerchantTestProduct — product guards", () => {
  it("refuses any other product id before touching the database", async () => {
    await expectMerchantError(
      insertGoogleMerchantTestProduct("11111111-2222-3333-4444-555555555555"),
      "PRODUCT_NOT_FOUND",
    );

    expect(getProductMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a product that does not exist", async () => {
    getProductMock.mockResolvedValue(null);

    const error = await expectMerchantError(
      insertGoogleMerchantTestProduct(),
      "PRODUCT_NOT_FOUND",
    );

    expect(error.status).toBe(404);
    expect(getAccessTokenMock).not.toHaveBeenCalled();
  });

  it("refuses a draft product", async () => {
    getProductMock.mockResolvedValue(mkProduct({ status: "draft" }));

    const error = await expectMerchantError(
      insertGoogleMerchantTestProduct(),
      "PRODUCT_NOT_PUBLISHED",
    );

    expect(error.status).toBe(409);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a product whose slug does not match", async () => {
    getProductMock.mockResolvedValue(mkProduct({ slug: "some-other-saree" }));

    await expectMerchantError(
      insertGoogleMerchantTestProduct(),
      "PRODUCT_SLUG_MISMATCH",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a sold product", async () => {
    getProductMock.mockResolvedValue(mkProduct({ stockStatus: "sold" }));

    await expectMerchantError(
      insertGoogleMerchantTestProduct(),
      "PRODUCT_NOT_PURCHASABLE",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a reserved product", async () => {
    getProductMock.mockResolvedValue(mkProduct({ stockStatus: "reserved" }));

    await expectMerchantError(
      insertGoogleMerchantTestProduct(),
      "PRODUCT_NOT_PURCHASABLE",
    );
  });

  it("refuses a product with no image", async () => {
    getProductMock.mockResolvedValue(mkProduct({ images: [] }));

    await expectMerchantError(
      insertGoogleMerchantTestProduct(),
      "PRODUCT_IMAGE_MISSING",
    );
    expect(getAccessTokenMock).not.toHaveBeenCalled();
  });

  it("refuses a product with an unusable image URL", async () => {
    getProductMock.mockResolvedValue(
      mkProduct({
        images: [{ media: mkMedia("http://insecure.test/a.jpg"), sortOrder: 0 }],
      }),
    );

    await expectMerchantError(
      insertGoogleMerchantTestProduct(),
      "PRODUCT_IMAGE_INVALID",
    );
  });

  it("refuses a product with a non-positive price", async () => {
    getProductMock.mockResolvedValue(mkProduct({ pricePaise: 0 }));

    await expectMerchantError(
      insertGoogleMerchantTestProduct(),
      "PRODUCT_PRICE_INVALID",
    );
  });

  it("refuses incomplete apparel data before minting a token", async () => {
    getProductMock.mockResolvedValue(mkProduct({ attributes: {} }));

    const error = await expectMerchantError(
      insertGoogleMerchantTestProduct(),
      "MERCHANT_PRODUCT_DATA_INCOMPLETE",
    );

    expect(error).toBeInstanceOf(GoogleMerchantProductDataError);
    expect((error as GoogleMerchantProductDataError).missingFields).toEqual([
      "color",
      "gender",
      "ageGroup",
      "size",
    ]);
    expect(getAccessTokenMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Service — inventory
// ---------------------------------------------------------------------------

describe("insertGoogleMerchantTestProduct — inventory", () => {
  it("does not query reservations when inventory v2 is off", async () => {
    await insertGoogleMerchantTestProduct();

    expect(getReservationCountsMock).not.toHaveBeenCalled();
  });

  it("uses the reservations count when inventory v2 is on", async () => {
    isInventoryV2Mock.mockReturnValue(true);
    getReservationCountsMock.mockResolvedValue(new Map());

    await expect(insertGoogleMerchantTestProduct()).resolves.toMatchObject({
      inserted: true,
    });
    expect(getReservationCountsMock).toHaveBeenCalledWith([
      TEST_INSERT_PRODUCT_ID,
    ]);
  });

  it("refuses when inventory v2 reports an active reservation", async () => {
    isInventoryV2Mock.mockReturnValue(true);
    getReservationCountsMock.mockResolvedValue(
      new Map([[TEST_INSERT_PRODUCT_ID, 1]]),
    );

    await expectMerchantError(
      insertGoogleMerchantTestProduct(),
      "PRODUCT_NOT_PURCHASABLE",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses when inventory v2 reports zero quantity", async () => {
    isInventoryV2Mock.mockReturnValue(true);
    getProductMock.mockResolvedValue(mkProduct({ quantityAvailable: 0 }));

    await expectMerchantError(
      insertGoogleMerchantTestProduct(),
      "PRODUCT_NOT_PURCHASABLE",
    );
  });

  it("ignores a stale stockStatus column when inventory v2 says reserved", async () => {
    isInventoryV2Mock.mockReturnValue(true);
    getProductMock.mockResolvedValue(mkProduct({ stockStatus: "available" }));
    getReservationCountsMock.mockResolvedValue(
      new Map([[TEST_INSERT_PRODUCT_ID, 2]]),
    );

    await expectMerchantError(
      insertGoogleMerchantTestProduct(),
      "PRODUCT_NOT_PURCHASABLE",
    );
  });
});

// ---------------------------------------------------------------------------
// Service — configuration
// ---------------------------------------------------------------------------

describe("insertGoogleMerchantTestProduct — configuration", () => {
  it("fails closed when the data source is not configured", async () => {
    stubServiceEnv({ GOOGLE_MERCHANT_DATA_SOURCE_NAME: undefined });

    await expectMerchantError(
      insertGoogleMerchantTestProduct(),
      "CONFIG_MISSING",
    );
    expect(getProductMock).not.toHaveBeenCalled();
  });

  it("fails closed when the data source belongs to another account", async () => {
    stubServiceEnv({
      GOOGLE_MERCHANT_DATA_SOURCE_NAME: `accounts/9999999999/dataSources/${DATA_SOURCE_ID}`,
    });

    await expectMerchantError(
      insertGoogleMerchantTestProduct(),
      "CONFIG_INVALID",
    );
  });

  it("fails closed when the data source name and id disagree", async () => {
    stubServiceEnv({ GOOGLE_MERCHANT_DATA_SOURCE_ID: "12345" });

    await expectMerchantError(
      insertGoogleMerchantTestProduct(),
      "CONFIG_INVALID",
    );
  });
});

// ---------------------------------------------------------------------------
// Service — upstream failures
// ---------------------------------------------------------------------------

describe("insertGoogleMerchantTestProduct — Google failures", () => {
  const failureCases: Array<{
    code: string;
    status: number;
    upstream: number;
  }> = [
    { code: "GOOGLE_REQUEST_FAILED", status: 502, upstream: 400 },
    { code: "GOOGLE_UNAUTHENTICATED", status: 502, upstream: 401 },
    { code: "GOOGLE_PERMISSION_DENIED", status: 502, upstream: 403 },
    { code: "GOOGLE_REQUEST_FAILED", status: 502, upstream: 404 },
    { code: "GOOGLE_REQUEST_FAILED", status: 502, upstream: 409 },
    { code: "GOOGLE_RATE_LIMITED", status: 429, upstream: 429 },
    { code: "GOOGLE_UNAVAILABLE", status: 502, upstream: 500 },
    { code: "GOOGLE_UNAVAILABLE", status: 502, upstream: 503 },
  ];

  for (const { code, status, upstream } of failureCases) {
    it(`maps HTTP ${upstream} to ${code}`, async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(upstream, {
          error: {
            code: upstream,
            message: `Rejected request for ${ACCESS_TOKEN}`,
          },
        }),
      );

      const error = await expectMerchantError(
        insertGoogleMerchantTestProduct(),
        code,
      );

      expect(error.status).toBe(status);
      expect(error.upstreamStatus).toBe(upstream);
    });
  }

  it("maps a network failure to GOOGLE_REQUEST_FAILED", async () => {
    fetchMock.mockRejectedValue(new Error(`socket hang up ${ACCESS_TOKEN}`));

    await expectMerchantError(
      insertGoogleMerchantTestProduct(),
      "GOOGLE_REQUEST_FAILED",
    );
  });

  it("survives a non-JSON error body", async () => {
    fetchMock.mockResolvedValue(textResponse(500, "<html>oops</html>"));

    await expectMerchantError(
      insertGoogleMerchantTestProduct(),
      "GOOGLE_UNAVAILABLE",
    );
  });
});

describe("insertGoogleMerchantTestProduct — response validation", () => {
  const malformed: Array<{ body: unknown; label: string }> = [
    { body: {}, label: "an empty object" },
    { body: successBody({ name: undefined }), label: "no name" },
    { body: successBody({ product: undefined }), label: "no product" },
    {
      body: successBody({ name: `accounts/${ACCOUNT_ID}/productInputs/` }),
      label: "an empty productInputs id",
    },
    {
      body: successBody({
        name: `accounts/9999999999/productInputs/en~IN~${TEST_INSERT_PRODUCT_ID}`,
      }),
      label: "another account's productInput",
    },
    {
      body: successBody({
        product: `accounts/9999999999/products/en~IN~${TEST_INSERT_PRODUCT_ID}`,
      }),
      label: "another account's product",
    },
    {
      body: successBody({ product: `accounts/${ACCOUNT_ID}/productInputs/x` }),
      label: "a product name with the wrong collection",
    },
    { body: successBody({ offerId: "another-offer" }), label: "another offerId" },
    { body: successBody({ contentLanguage: "hi" }), label: "another language" },
    { body: successBody({ feedLabel: "US" }), label: "another feed label" },
    { body: successBody({ name: 42 }), label: "a non-string name" },
    { body: successBody({ product: 42 }), label: "a non-string product" },
  ];

  for (const { body, label } of malformed) {
    it(`fails closed on a 200 with ${label}`, async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, body));

      await expectMerchantError(
        insertGoogleMerchantTestProduct(),
        "GOOGLE_REQUEST_FAILED",
      );
    });
  }

  it("fails closed on a non-JSON 200", async () => {
    fetchMock.mockResolvedValue(textResponse(200, "<html>ok</html>"));

    await expectMerchantError(
      insertGoogleMerchantTestProduct(),
      "GOOGLE_REQUEST_FAILED",
    );
  });

  // ── dataSource is a Product field, not a ProductInput field ───────────────

  it("accepts a valid ProductInput response that has no dataSource", async () => {
    const body = successBody();
    expect(body).not.toHaveProperty("dataSource");

    fetchMock.mockResolvedValue(jsonResponse(200, body));

    await expect(insertGoogleMerchantTestProduct()).resolves.toEqual({
      inserted: true,
      offerId: TEST_INSERT_PRODUCT_ID,
      processedProductName: PROCESSED_PRODUCT_NAME,
      productId: TEST_INSERT_PRODUCT_ID,
      productInputName: PRODUCT_INPUT_NAME,
    });
  });

  it("accepts the minimal set of fields Google actually returns", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        contentLanguage: "en",
        feedLabel: "IN",
        name: PRODUCT_INPUT_NAME,
        offerId: TEST_INSERT_PRODUCT_ID,
        product: PROCESSED_PRODUCT_NAME,
      }),
    );

    await expect(insertGoogleMerchantTestProduct()).resolves.toMatchObject({
      inserted: true,
    });
  });

  it("ignores a dataSource field if Google returns one", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        ...successBody(),
        dataSource: `accounts/${ACCOUNT_ID}/dataSources/99999`,
      }),
    );

    const result = await insertGoogleMerchantTestProduct();

    expect(result.inserted).toBe(true);
    expect(JSON.stringify(result)).not.toContain("dataSources");
    expect(JSON.stringify(result)).not.toContain("99999");
  });

  it("still pins the data source on the request, not the response", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, successBody()));

    await insertGoogleMerchantTestProduct();

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe(EXPECTED_URL);
    expect(url).toContain(
      `dataSource=accounts%2F${ACCOUNT_ID}%2FdataSources%2F${DATA_SOURCE_ID}`,
    );
  });

  it("ignores every documented ProductInput output field", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        ...successBody(),
        base64EncodedName: "YWNjb3VudHM=",
        base64EncodedProduct: "cHJvZHVjdHM=",
        customAttributes: [{ name: "internal", value: ACCESS_TOKEN }],
        legacyLocal: false,
        productAttributes: { title: "Tangerine Noir Floral Border Weave" },
        versionNumber: "7",
      }),
    );

    const result = await insertGoogleMerchantTestProduct();
    const serialised = JSON.stringify(result);

    expect(result.inserted).toBe(true);
    for (const field of [
      "base64EncodedName",
      "base64EncodedProduct",
      "customAttributes",
      "legacyLocal",
      "productAttributes",
      "versionNumber",
    ]) {
      expect(serialised).not.toContain(field);
    }
    expect(serialised).not.toContain(ACCESS_TOKEN);
  });

  it("ignores extra fields in an otherwise valid response", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        ...successBody(),
        customAttributes: [{ name: "internal", value: ACCESS_TOKEN }],
        versionNumber: "7",
      }),
    );

    const result = await insertGoogleMerchantTestProduct();

    expect(Object.keys(result).sort()).toEqual([
      "inserted",
      "offerId",
      "processedProductName",
      "productId",
      "productInputName",
    ]);
    expect(JSON.stringify(result)).not.toContain(ACCESS_TOKEN);
  });
});

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

type ErrorBody = { code: string; message: string; missingFields?: string[] };

const ADMIN = { email: "admin@example.com", id: "admin-1", role: "admin" };
const CUSTOMER = { email: "user@example.com", id: "user-1", role: "customer" };

const ROUTE_SUCCESS: GoogleMerchantInsertResult = {
  inserted: true,
  offerId: TEST_INSERT_PRODUCT_ID,
  processedProductName: PROCESSED_PRODUCT_NAME,
  productId: TEST_INSERT_PRODUCT_ID,
  productInputName: PRODUCT_INPUT_NAME,
};

const VALID_BODY = {
  confirm: INSERT_PRODUCT_CONFIRMATION,
  productId: TEST_INSERT_PRODUCT_ID,
};

const makeHarness = (
  authUser: { email: string; id: string; role: string } | null,
  insertTestProduct = vi.fn().mockResolvedValue(ROUTE_SUCCESS),
) => ({
  harness: createRouteHarness({
    authUser,
    register: (app) =>
      registerGoogleMerchantProductRoutes(app, { insertTestProduct }),
  }),
  insertTestProduct,
});

const post = (
  harness: ReturnType<typeof createRouteHarness>,
  body: unknown = VALID_BODY,
) =>
  harness.request("/test-insert", {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

const enableProductionInsert = () => {
  vi.stubEnv("GOOGLE_MERCHANT_TEST_INSERT_ENABLED", "true");
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("ADMIN_API_SECRET", undefined);
};

describe("POST /test-insert — availability gates", () => {
  it("404s when GOOGLE_MERCHANT_TEST_INSERT_ENABLED is not \"true\"", async () => {
    enableProductionInsert();
    vi.stubEnv("GOOGLE_MERCHANT_TEST_INSERT_ENABLED", "false");

    const { harness, insertTestProduct } = makeHarness(ADMIN);
    const response = await post(harness);

    expect(response.status).toBe(404);
    expect(insertTestProduct).not.toHaveBeenCalled();
  });

  it("404s when the flag is unset", async () => {
    enableProductionInsert();
    vi.stubEnv("GOOGLE_MERCHANT_TEST_INSERT_ENABLED", undefined);

    expect((await post(makeHarness(ADMIN).harness)).status).toBe(404);
  });

  it("404s outside production even when the flag is on", async () => {
    enableProductionInsert();
    vi.stubEnv("VERCEL_ENV", "preview");

    const { harness, insertTestProduct } = makeHarness(ADMIN);

    expect((await post(harness)).status).toBe(404);
    expect(insertTestProduct).not.toHaveBeenCalled();
  });

  it("returns an identical body whether disabled or non-production", async () => {
    enableProductionInsert();
    vi.stubEnv("GOOGLE_MERCHANT_TEST_INSERT_ENABLED", "false");
    const disabled = await post(makeHarness(ADMIN).harness);

    enableProductionInsert();
    vi.stubEnv("VERCEL_ENV", "development");
    const nonProduction = await post(makeHarness(ADMIN).harness);

    expect(await disabled.json()).toEqual(await nonProduction.json());
  });

  it("gates before authentication", async () => {
    enableProductionInsert();
    vi.stubEnv("GOOGLE_MERCHANT_TEST_INSERT_ENABLED", "false");

    expect((await post(makeHarness(null).harness)).status).toBe(404);
  });
});

describe("POST /test-insert — authentication", () => {
  beforeEach(() => {
    enableProductionInsert();
  });

  it("401s for an unauthenticated request", async () => {
    const { harness, insertTestProduct } = makeHarness(null);

    expect((await post(harness)).status).toBe(401);
    expect(insertTestProduct).not.toHaveBeenCalled();
  });

  it("403s for a signed-in non-admin", async () => {
    const { harness, insertTestProduct } = makeHarness(CUSTOMER);

    expect((await post(harness)).status).toBe(403);
    expect(insertTestProduct).not.toHaveBeenCalled();
  });
});

describe("POST /test-insert — request validation", () => {
  beforeEach(() => {
    enableProductionInsert();
  });

  const invalidBodies: Array<{ body: unknown; label: string }> = [
    {
      body: { ...VALID_BODY, productId: "11111111-2222-3333-4444-555555555555" },
      label: "another product id",
    },
    { body: { confirm: INSERT_PRODUCT_CONFIRMATION }, label: "no product id" },
    {
      body: { ...VALID_BODY, confirm: "INSERT_TANGERINE_NOIR" },
      label: "a truncated confirmation phrase",
    },
    {
      body: { ...VALID_BODY, confirm: "insert_tangerine_noir_into_google_merchant" },
      label: "a lower-cased confirmation phrase",
    },
    { body: { productId: TEST_INSERT_PRODUCT_ID }, label: "no confirmation" },
    { body: { ...VALID_BODY, dryRun: true }, label: "an extra property" },
    { body: {}, label: "an empty object" },
    { body: [VALID_BODY], label: "an array" },
  ];

  for (const { body, label } of invalidBodies) {
    it(`400s on ${label}`, async () => {
      const { harness, insertTestProduct } = makeHarness(ADMIN);
      const response = await post(harness, body);

      expect(response.status).toBe(400);
      expect(((await response.json()) as ErrorBody).code).toBe(
        "INVALID_REQUEST",
      );
      expect(insertTestProduct).not.toHaveBeenCalled();
    });
  }

  it("400s on a missing body", async () => {
    const { harness, insertTestProduct } = makeHarness(ADMIN);
    const response = await harness.request("/test-insert", {
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(400);
    expect(insertTestProduct).not.toHaveBeenCalled();
  });

  it("400s on a non-JSON body", async () => {
    const { harness } = makeHarness(ADMIN);
    const response = await harness.request("/test-insert", {
      body: "not json",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(400);
  });
});

describe("POST /test-insert — success", () => {
  beforeEach(() => {
    enableProductionInsert();
  });

  it("returns exactly the five agreed keys", async () => {
    const { harness, insertTestProduct } = makeHarness(ADMIN);
    const response = await post(harness);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(JSON.parse(body)).toEqual({
      inserted: true,
      offerId: TEST_INSERT_PRODUCT_ID,
      processedProductName: PROCESSED_PRODUCT_NAME,
      productId: TEST_INSERT_PRODUCT_ID,
      productInputName: PRODUCT_INPUT_NAME,
    });
    expect(Object.keys(JSON.parse(body)).sort()).toEqual([
      "inserted",
      "offerId",
      "processedProductName",
      "productId",
      "productInputName",
    ]);
    expect(insertTestProduct).toHaveBeenCalledWith(TEST_INSERT_PRODUCT_ID);
  });

  it("strips any extra field the service might return", async () => {
    const leaky = vi.fn().mockResolvedValue({
      ...ROUTE_SUCCESS,
      accessToken: ACCESS_TOKEN,
      product: { pricePaise: 524900, slug: TEST_INSERT_PRODUCT_SLUG },
      rawGoogleResponse: { versionNumber: "7" },
    });

    const { harness } = makeHarness(ADMIN, leaky);
    const body = await (await post(harness)).text();

    expect(Object.keys(JSON.parse(body)).sort()).toEqual([
      "inserted",
      "offerId",
      "processedProductName",
      "productId",
      "productInputName",
    ]);
    expect(body).not.toContain(ACCESS_TOKEN);
    expect(body).not.toContain("pricePaise");
    expect(body).not.toContain("rawGoogleResponse");
  });
});

describe("POST /test-insert — failure handling", () => {
  beforeEach(() => {
    enableProductionInsert();
  });

  it("returns the 422 contract for incomplete product data", async () => {
    const { harness } = makeHarness(
      ADMIN,
      vi
        .fn()
        .mockRejectedValue(
          new GoogleMerchantProductDataError(["color", "gender"]),
        ),
    );

    const response = await post(harness);

    expect(response.status).toBe(422);
    expect((await response.json()) as ErrorBody).toEqual({
      code: "MERCHANT_PRODUCT_DATA_INCOMPLETE",
      message: "The product is missing required Google Merchant attributes.",
      missingFields: ["color", "gender"],
    });
  });

  const mappedFailures: Array<{ code: string; status: number }> = [
    { code: "PRODUCT_NOT_FOUND", status: 404 },
    { code: "PRODUCT_NOT_PUBLISHED", status: 409 },
    { code: "PRODUCT_SLUG_MISMATCH", status: 409 },
    { code: "PRODUCT_NOT_PURCHASABLE", status: 409 },
    { code: "PRODUCT_IMAGE_MISSING", status: 422 },
    { code: "GOOGLE_RATE_LIMITED", status: 429 },
    { code: "GOOGLE_UNAVAILABLE", status: 502 },
  ];

  for (const { code, status } of mappedFailures) {
    it(`surfaces ${code} as HTTP ${status}`, async () => {
      const { harness } = makeHarness(
        ADMIN,
        vi
          .fn()
          .mockRejectedValue(
            new GoogleMerchantError(
              code as "GOOGLE_UNAVAILABLE",
              "Sanitised message.",
              status,
            ),
          ),
      );

      const response = await post(harness);

      expect(response.status).toBe(status);
      expect((await response.json()) as ErrorBody).toEqual({
        code,
        message: "Sanitised message.",
      });
    });
  }

  it("never leaks a token, WIF config, database row or stack trace", async () => {
    const leaky = new Error(
      `boom: token=${ACCESS_TOKEN} config={"type":"external_account"} row={"pricePaise":524900}`,
    );

    const { harness } = makeHarness(ADMIN, vi.fn().mockRejectedValue(leaky));
    const response = await post(harness);
    const body = await response.text();

    expect(response.status).toBe(500);
    expect(body).not.toContain(ACCESS_TOKEN);
    expect(body).not.toContain("external_account");
    expect(body).not.toContain("pricePaise");
    expect(body).not.toContain("at Object");
    expect(JSON.parse(body)).toEqual({
      code: "PRODUCT_INSERT_FAILED",
      message: "The product insertion could not be completed.",
    });
    expect(loggedText()).not.toContain(ACCESS_TOKEN);
  });
});
