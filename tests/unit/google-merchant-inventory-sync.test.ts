/**
 * Automatic Merchant inventory reconciliation — primitive, worker, cron, preview.
 *
 * What these tests prove:
 *   - The availability primitive issues exactly ONE Merchant API v1 PATCH, at
 *     the derived `accounts/{account}/productInputs/en~IN~{offerId}` resource,
 *     with `updateMask=productAttributes.availability` and the pinned data
 *     source, and a body containing ONLY availability — no title, price or
 *     image can ride along. The echoed ProductInput's identity is validated,
 *     and every upstream failure is sanitised.
 *   - The worker reads ONCE (one audit, one products.list), reuses ONE access
 *     token, writes SEQUENTIALLY in safety-first order, respects a hard
 *     ceiling, and NEVER touches the database.
 *   - An INSERT submits the audit's own ProductInput; a SOLD deletion goes
 *     through the shared delete primitive and treats an upstream 404 as
 *     convergence, because products.list lags behind productInputs.delete.
 *   - One failed Google write neither aborts the run nor alters local
 *     inventory; a credential or rate-limit failure stops the run early.
 *   - The cron requires CRON_SECRET, performs ZERO writes while the dedicated
 *     switch is off, and never mutates product inventory itself.
 *   - The bootstrap paths are untouched: apply stays INSERT-only, the manual
 *     delete stays restricted to UNSUPPORTED_PRODUCT_TYPE.
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

/** The reconciler must never reach the database. Any access throws. */
vi.mock("@/db", () => ({
  db: new Proxy(
    {},
    {
      get() {
        throw new Error(
          "the inventory reconciler must never touch the database",
        );
      },
    },
  ),
  rawSql: vi.fn(),
  withRetry: <T>(fn: () => Promise<T>) => fn(),
}));

const logMock = vi.hoisted(() => ({
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}));
vi.mock("@/lib/log", () => ({ createLogger: () => logMock }));

import { registerCronRoutes } from "@/api/hono/routes/cron";
import { registerGoogleMerchantSyncRoutes } from "@/api/hono/routes/google-merchant-sync";
import type { MerchantProductAudit } from "@/lib/google-merchant/catalogue-readiness";
import { GoogleMerchantError } from "@/lib/google-merchant/config";
import type { GoogleMerchantProductSummary } from "@/lib/google-merchant/google-catalogue";
import {
  AVAILABILITY_UPDATE_MASK,
  patchGoogleMerchantProductAvailability,
} from "@/lib/google-merchant/patch-product-availability";
import type { MerchantProductInput } from "@/lib/google-merchant/product-input";
import {
  MAX_INVENTORY_SYNC_WRITES,
  previewMerchantInventorySync,
  reconcileMerchantInventory,
} from "@/lib/google-merchant/reconcile-inventory";
import { createRouteHarness } from "../helpers/route-harness";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ACCOUNT_ID = "5833526164";
const DATA_SOURCE_ID = "10696807524";
const DATA_SOURCE = `accounts/${ACCOUNT_ID}/dataSources/${DATA_SOURCE_ID}`;
const ACCESS_TOKEN = "ya29.ACCESS-TOKEN-SUPER-SECRET";
const CRON_SECRET = "cron-secret-for-inventory-sync";

const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const SAREE = uuid(1);

const productInputName = (offerId: string) =>
  `accounts/${ACCOUNT_ID}/productInputs/en~IN~${offerId}`;

const LIST_URL_PREFIX = `https://merchantapi.googleapis.com/products/v1/accounts/${ACCOUNT_ID}/products?`;
const INPUT_URL_PREFIX = `https://merchantapi.googleapis.com/products/v1/accounts/${ACCOUNT_ID}/productInputs/`;
const INSERT_URL_PREFIX = `https://merchantapi.googleapis.com/products/v1/accounts/${ACCOUNT_ID}/productInputs:insert`;

const mkProductInput = (offerId: string): MerchantProductInput =>
  ({
    contentLanguage: "en",
    feedLabel: "IN",
    offerId,
    productAttributes: {
      availability: "IN_STOCK",
      imageLink: "https://blob.test/a.jpg",
      price: { amountMicros: "5299000000", currencyCode: "INR" },
      title: `Saree ${offerId}`,
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
      ignoredImages: 0,
      safeImages: 1,
      totalImages: 1,
    },
    productInput:
      merchantReadiness === "READY" ? mkProductInput(productId) : null,
    report: {
      images: { ignoredImages: 0, safeImages: 1, totalImages: 1 },
      merchantReadiness,
      missingFields: [],
      name: `Saree ${productId.slice(-2)}`,
      productId,
      reasons: [],
      slug: `saree-${productId.slice(-2)}`,
      status: "published",
      stockStatus:
        merchantReadiness === "SOLD"
          ? "sold"
          : merchantReadiness === "RESERVED"
            ? "reserved"
            : "available",
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
  productAttributes: { availability: "IN_STOCK", title: `Saree ${offerId}` },
  productStatus: { destinationStatuses: [], itemLevelIssues: [] },
  ...overrides,
});

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });

const emptyResponse = (status = 200): Response => new Response(null, { status });

/** The ProductInput Google echoes back from an insert or a patch. */
const inputEcho = (offerId: string) => ({
  contentLanguage: "en",
  feedLabel: "IN",
  name: productInputName(offerId),
  offerId,
  product: `accounts/${ACCOUNT_ID}/products/en~IN~${offerId}`,
});

const fetchMock = vi.fn();

const stubGoogle = (options: {
  products?: unknown[];
  onPatch?: (offerId: string) => Response | Promise<Response>;
  onDelete?: (offerId: string) => Response | Promise<Response>;
  onInsert?: (offerId: string) => Response | Promise<Response>;
} = {}) => {
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    const target = String(url);

    if (target.startsWith(LIST_URL_PREFIX)) {
      return Promise.resolve(
        jsonResponse(200, { products: options.products ?? [] }),
      );
    }

    if (target.startsWith(INSERT_URL_PREFIX)) {
      const offerId = (JSON.parse(String(init?.body)) as { offerId: string })
        .offerId;
      return Promise.resolve(
        options.onInsert
          ? options.onInsert(offerId)
          : jsonResponse(200, inputEcho(offerId)),
      );
    }

    if (target.startsWith(INPUT_URL_PREFIX)) {
      const offerId = target
        .slice(INPUT_URL_PREFIX.length)
        .split("?")[0]
        .replace("en~IN~", "");

      if (init?.method === "DELETE") {
        return Promise.resolve(
          options.onDelete ? options.onDelete(offerId) : emptyResponse(),
        );
      }

      if (init?.method === "PATCH") {
        return Promise.resolve(
          options.onPatch
            ? options.onPatch(offerId)
            : jsonResponse(200, inputEcho(offerId)),
        );
      }
    }

    return Promise.reject(new Error(`unexpected fetch: ${target}`));
  });
};

const callsWithMethod = (method: string) =>
  fetchMock.mock.calls.filter(
    ([, init]) => (init as RequestInit | undefined)?.method === method,
  );

const listCalls = () =>
  fetchMock.mock.calls.filter(([url]) =>
    String(url).startsWith(LIST_URL_PREFIX),
  );

const loggedText = () =>
  [logMock.debug, logMock.error, logMock.info, logMock.warn]
    .flatMap((fn) => fn.mock.calls)
    .map((args) => JSON.stringify(args))
    .join("|");

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
  stubAudit([mkAudit(SAREE)]);
  stubGoogle({ products: [googleProduct(SAREE)] });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// The availability PATCH primitive
// ---------------------------------------------------------------------------

describe("patchGoogleMerchantProductAvailability", () => {
  it("sends exactly ONE PATCH to the derived ProductInput resource", async () => {
    stubGoogle();

    const result = await patchGoogleMerchantProductAvailability(
      SAREE,
      "OUT_OF_STOCK",
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(init.method).toBe("PATCH");
    expect(url).toBe(
      `https://merchantapi.googleapis.com/products/v1/${productInputName(SAREE)}` +
        `?updateMask=productAttributes.availability` +
        `&dataSource=accounts%2F${ACCOUNT_ID}%2FdataSources%2F${DATA_SOURCE_ID}`,
    );
    expect(result).toEqual({
      availability: "OUT_OF_STOCK",
      offerId: SAREE,
      patched: true,
      productInputName: productInputName(SAREE),
    });
  });

  it("uses the exact update mask, unescaped", async () => {
    stubGoogle();

    await patchGoogleMerchantProductAvailability(SAREE, "IN_STOCK");

    const [url] = fetchMock.mock.calls[0] as [string];

    expect(AVAILABILITY_UPDATE_MASK).toBe("productAttributes.availability");
    expect(url).toContain("updateMask=productAttributes.availability");
    expect(url).not.toContain("updateMask=productAttributes%2Eavailability");
  });

  it("sends ONLY availability — no title, price, image or attribute", async () => {
    stubGoogle();

    await patchGoogleMerchantProductAvailability(SAREE, "OUT_OF_STOCK");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;

    expect(body).toEqual({
      productAttributes: { availability: "OUT_OF_STOCK" },
    });
    expect(Object.keys(body)).toEqual(["productAttributes"]);
    expect(
      Object.keys(body.productAttributes as Record<string, unknown>),
    ).toEqual(["availability"]);
    for (const leak of ["title", "price", "imageLink", "link", "gender"]) {
      expect(String(init.body)).not.toContain(leak);
    }
  });

  for (const availability of ["IN_STOCK", "OUT_OF_STOCK"] as const) {
    it(`accepts ${availability}`, async () => {
      stubGoogle();

      await expect(
        patchGoogleMerchantProductAvailability(SAREE, availability),
      ).resolves.toMatchObject({ availability, patched: true });

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(String(init.body))).toEqual({
        productAttributes: { availability },
      });
    });
  }

  it("authenticates through the shared bearer helper", async () => {
    stubGoogle();

    await patchGoogleMerchantProductAvailability(SAREE, "IN_STOCK", {
      accessToken: ACCESS_TOKEN,
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(init.headers).toEqual({
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    });
    expect(getAccessTokenMock).not.toHaveBeenCalled();
  });

  it("refuses an offer id that is not a product UUID", async () => {
    stubGoogle();

    await expect(
      patchGoogleMerchantProductAvailability("not-a-uuid", "IN_STOCK"),
    ).rejects.toBeInstanceOf(GoogleMerchantError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  const identityMismatches: Array<{ echo: unknown; label: string }> = [
    { echo: { ...inputEcho(SAREE), offerId: uuid(9) }, label: "another offer" },
    {
      echo: { ...inputEcho(SAREE), name: `accounts/999/productInputs/en~IN~x` },
      label: "another account",
    },
    {
      echo: { ...inputEcho(SAREE), contentLanguage: "hi" },
      label: "another content language",
    },
    { echo: { ...inputEcho(SAREE), feedLabel: "US" }, label: "another feed label" },
  ];

  for (const { echo, label } of identityMismatches) {
    it(`rejects a response describing ${label}`, async () => {
      stubGoogle({ onPatch: () => jsonResponse(200, echo) });

      const error = await patchGoogleMerchantProductAvailability(
        SAREE,
        "IN_STOCK",
      ).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(GoogleMerchantError);
      expect((error as GoogleMerchantError).code).toBe("GOOGLE_REQUEST_FAILED");
    });
  }

  const upstreamFailures: Array<{ code: string; status: number }> = [
    { code: "GOOGLE_UNAUTHENTICATED", status: 401 },
    { code: "GOOGLE_PERMISSION_DENIED", status: 403 },
    { code: "GOOGLE_RATE_LIMITED", status: 429 },
    { code: "GOOGLE_UNAVAILABLE", status: 503 },
    { code: "GOOGLE_REQUEST_FAILED", status: 404 },
  ];

  for (const { code, status } of upstreamFailures) {
    it(`sanitises an upstream ${status}`, async () => {
      stubGoogle({
        onPatch: () =>
          jsonResponse(status, {
            error: {
              message: `secret detail ${ACCESS_TOKEN} for ${DATA_SOURCE}`,
            },
          }),
      });

      const error = await patchGoogleMerchantProductAvailability(
        SAREE,
        "IN_STOCK",
      ).catch((caught: unknown) => caught);

      expect((error as GoogleMerchantError).code).toBe(code);
      expect((error as GoogleMerchantError).message).not.toContain("secret detail");
      expect((error as GoogleMerchantError).message).not.toContain(ACCESS_TOKEN);
    });
  }

  it("never leaks the token into the logs", async () => {
    stubGoogle({
      onPatch: () => jsonResponse(403, { error: { message: ACCESS_TOKEN } }),
    });

    await patchGoogleMerchantProductAvailability(SAREE, "IN_STOCK").catch(
      () => undefined,
    );

    expect(loggedText()).not.toContain(ACCESS_TOKEN);
  });

  it("sanitises a network failure", async () => {
    fetchMock.mockRejectedValue(new Error(`socket died ${ACCESS_TOKEN}`));

    const error = await patchGoogleMerchantProductAvailability(
      SAREE,
      "IN_STOCK",
    ).catch((caught: unknown) => caught);

    expect((error as GoogleMerchantError).code).toBe("GOOGLE_REQUEST_FAILED");
    expect((error as GoogleMerchantError).message).not.toContain(ACCESS_TOKEN);
  });
});

// ---------------------------------------------------------------------------
// The reconciler
// ---------------------------------------------------------------------------

describe("reconcileMerchantInventory — reads", () => {
  it("runs ONE audit and ONE products.list per run", async () => {
    stubAudit([
      mkAudit(uuid(1)),
      mkAudit(uuid(2), "SOLD"),
      mkAudit(uuid(3), "RESERVED"),
    ]);
    stubGoogle({ products: [googleProduct(uuid(2)), googleProduct(uuid(3))] });

    await reconcileMerchantInventory({ enabled: true });

    expect(runAuditMock).toHaveBeenCalledTimes(1);
    expect(listCalls()).toHaveLength(1);
  });

  it("mints ONE access token and reuses it for every write", async () => {
    stubAudit([mkAudit(uuid(1)), mkAudit(uuid(2), "SOLD")]);
    stubGoogle({ products: [googleProduct(uuid(2))] });

    await reconcileMerchantInventory({ enabled: true });

    expect(getAccessTokenMock).toHaveBeenCalledTimes(1);
    for (const [, init] of fetchMock.mock.calls) {
      expect((init as RequestInit).headers).toMatchObject({
        Authorization: `Bearer ${ACCESS_TOKEN}`,
      });
    }
  });

  it("performs no database access at all", async () => {
    // The @/db mock throws on ANY property access; reaching it fails the run.
    stubAudit([mkAudit(uuid(1), "SOLD")]);
    stubGoogle({ products: [googleProduct(uuid(1))] });

    await expect(
      reconcileMerchantInventory({ enabled: true }),
    ).resolves.toMatchObject({ succeeded: 1 });
  });
});

describe("reconcileMerchantInventory — writes", () => {
  it("does nothing at all in a settled catalogue", async () => {
    const result = await reconcileMerchantInventory({ enabled: true });

    expect(result).toMatchObject({
      enabled: true,
      failed: 0,
      remaining: 0,
      succeeded: 0,
      writesAttempted: 0,
    });
    // Only the products.list read.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("PATCHes a reserved saree to OUT_OF_STOCK", async () => {
    stubAudit([mkAudit(SAREE, "RESERVED")]);
    stubGoogle({ products: [googleProduct(SAREE)] });

    const result = await reconcileMerchantInventory({ enabled: true });

    const patches = callsWithMethod("PATCH");
    expect(patches).toHaveLength(1);
    expect(JSON.parse(String((patches[0][1] as RequestInit).body))).toEqual({
      productAttributes: { availability: "OUT_OF_STOCK" },
    });
    expect(result).toMatchObject({ succeeded: 1, writesAttempted: 1 });
  });

  it("PATCHes a freed saree back to IN_STOCK", async () => {
    stubAudit([mkAudit(SAREE)]);
    stubGoogle({
      products: [googleProduct(SAREE, {
        productAttributes: { availability: "OUT_OF_STOCK" },
      })],
    });

    await reconcileMerchantInventory({ enabled: true });

    const patches = callsWithMethod("PATCH");
    expect(patches).toHaveLength(1);
    expect(JSON.parse(String((patches[0][1] as RequestInit).body))).toEqual({
      productAttributes: { availability: "IN_STOCK" },
    });
  });

  it("INSERTs a missing READY saree with the audit's own ProductInput", async () => {
    const audit = mkAudit(SAREE);
    stubAudit([audit]);
    stubGoogle({ products: [] });

    await reconcileMerchantInventory({ enabled: true });

    const inserts = fetchMock.mock.calls.filter(([url]) =>
      String(url).startsWith(INSERT_URL_PREFIX),
    );

    expect(inserts).toHaveLength(1);
    expect(JSON.parse(String((inserts[0][1] as RequestInit).body))).toEqual(
      audit.productInput,
    );
  });

  it("DELETEs a sold saree through the shared delete primitive", async () => {
    stubAudit([mkAudit(SAREE, "SOLD")]);
    stubGoogle({ products: [googleProduct(SAREE)] });

    const result = await reconcileMerchantInventory({ enabled: true });

    const deletes = callsWithMethod("DELETE");
    expect(deletes).toHaveLength(1);
    expect(String(deletes[0][0])).toContain(productInputName(SAREE));
    expect(String(deletes[0][0])).toContain(
      `dataSource=accounts%2F${ACCOUNT_ID}%2FdataSources%2F${DATA_SOURCE_ID}`,
    );
    expect(result).toMatchObject({ succeeded: 1 });
  });

  it("executes writes sequentially, never concurrently", async () => {
    stubAudit([
      ...Array.from({ length: 4 }, (_, i) => mkAudit(uuid(i + 1), "SOLD")),
    ]);

    let inFlight = 0;
    let maxInFlight = 0;

    stubGoogle({
      onDelete: () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        return new Promise<Response>((resolve) => {
          setTimeout(() => {
            inFlight -= 1;
            resolve(emptyResponse());
          }, 3);
        }) as unknown as Response;
      },
      products: Array.from({ length: 4 }, (_, i) => googleProduct(uuid(i + 1))),
    });

    await reconcileMerchantInventory({ enabled: true });

    expect(maxInFlight).toBe(1);
  });

  it("writes in safety-first order", async () => {
    stubAudit([
      mkAudit(uuid(1)), // INSERT
      mkAudit(uuid(2), "RESERVED"), // SET_OUT_OF_STOCK
      mkAudit(uuid(3), "SOLD"), // DELETE_SOLD
    ]);
    stubGoogle({
      products: [
        googleProduct(uuid(2)),
        googleProduct(uuid(3)),
      ],
    });

    await reconcileMerchantInventory({ enabled: true });

    const methods = fetchMock.mock.calls
      .map(([, init]) => (init as RequestInit | undefined)?.method)
      .filter((method) => method !== "GET" && method !== undefined);

    expect(methods).toEqual(["DELETE", "PATCH", "POST"]);
  });

  it("never exceeds the hard write ceiling", async () => {
    stubAudit(
      Array.from({ length: 30 }, (_, i) => mkAudit(uuid(i + 1), "SOLD")),
    );
    stubGoogle({
      products: Array.from({ length: 30 }, (_, i) => googleProduct(uuid(i + 1))),
    });

    const result = await reconcileMerchantInventory({ enabled: true });

    expect(MAX_INVENTORY_SYNC_WRITES).toBe(10);
    expect(callsWithMethod("DELETE")).toHaveLength(10);
    expect(result).toMatchObject({
      remaining: 20,
      succeeded: 10,
      writesAttempted: 10,
    });
  });

  it("clamps a caller-supplied limit to the ceiling", async () => {
    stubAudit(
      Array.from({ length: 30 }, (_, i) => mkAudit(uuid(i + 1), "SOLD")),
    );
    stubGoogle({
      products: Array.from({ length: 30 }, (_, i) => googleProduct(uuid(i + 1))),
    });

    await reconcileMerchantInventory({ enabled: true, limit: 999 });

    expect(callsWithMethod("DELETE")).toHaveLength(MAX_INVENTORY_SYNC_WRITES);
  });

  it("writes NOTHING when the kill switch is off", async () => {
    stubAudit([mkAudit(uuid(1), "SOLD"), mkAudit(uuid(2), "RESERVED")]);
    stubGoogle({ products: [googleProduct(uuid(1)), googleProduct(uuid(2))] });

    const result = await reconcileMerchantInventory({ enabled: false });

    expect(callsWithMethod("DELETE")).toHaveLength(0);
    expect(callsWithMethod("PATCH")).toHaveLength(0);
    expect(result).toMatchObject({
      enabled: false,
      // Still reports what it WOULD do.
      remaining: 2,
      succeeded: 0,
      writesAttempted: 0,
    });
  });
});

describe("reconcileMerchantInventory — sold deletion is idempotent", () => {
  it("treats an upstream 404 as convergence, not failure", async () => {
    // products.list still shows the processed product although the input is
    // already deleted — the documented Google lag.
    stubAudit([mkAudit(SAREE, "SOLD")]);
    stubGoogle({
      onDelete: () => jsonResponse(404, { error: { message: "not found" } }),
      products: [googleProduct(SAREE)],
    });

    const result = await reconcileMerchantInventory({ enabled: true });

    expect(result).toMatchObject({ failed: 0, succeeded: 1 });
    expect(result.failures).toEqual([]);
  });

  it("converges over repeated runs while Google lags", async () => {
    stubAudit([mkAudit(SAREE, "SOLD")]);
    stubGoogle({
      onDelete: () => jsonResponse(404, {}),
      products: [googleProduct(SAREE)],
    });

    for (let run = 0; run < 3; run += 1) {
      const result = await reconcileMerchantInventory({ enabled: true });
      expect(result.failed).toBe(0);
    }

    // Once products.list catches up, no delete is planned at all.
    fetchMock.mockClear();
    stubGoogle({ products: [] });

    const settled = await reconcileMerchantInventory({ enabled: true });

    expect(callsWithMethod("DELETE")).toHaveLength(0);
    expect(settled).toMatchObject({ succeeded: 0, writesAttempted: 0 });
  });

  it("still surfaces a NON-404 delete failure", async () => {
    stubAudit([mkAudit(SAREE, "SOLD")]);
    stubGoogle({
      onDelete: () => jsonResponse(400, {}),
      products: [googleProduct(SAREE)],
    });

    const result = await reconcileMerchantInventory({ enabled: true });

    expect(result).toMatchObject({ failed: 1, succeeded: 0 });
    expect(result.failures[0]).toEqual({
      action: "DELETE_SOLD",
      code: "GOOGLE_REQUEST_FAILED",
      productId: SAREE,
    });
  });
});

describe("reconcileMerchantInventory — failure handling", () => {
  it("continues past a product-specific failure", async () => {
    stubAudit([
      mkAudit(uuid(1), "SOLD"),
      mkAudit(uuid(2), "SOLD"),
      mkAudit(uuid(3), "SOLD"),
    ]);
    stubGoogle({
      onDelete: (offerId) =>
        offerId === uuid(2) ? jsonResponse(400, {}) : emptyResponse(),
      products: [
        googleProduct(uuid(1)),
        googleProduct(uuid(2)),
        googleProduct(uuid(3)),
      ],
    });

    const result = await reconcileMerchantInventory({ enabled: true });

    expect(result).toMatchObject({
      failed: 1,
      stoppedEarly: false,
      succeeded: 2,
      writesAttempted: 3,
    });
  });

  const stoppingFailures = [
    { code: "GOOGLE_UNAUTHENTICATED", status: 401 },
    { code: "GOOGLE_PERMISSION_DENIED", status: 403 },
    { code: "GOOGLE_RATE_LIMITED", status: 429 },
  ];

  for (const { code, status } of stoppingFailures) {
    it(`stops the run early on ${status}, rather than burning the budget`, async () => {
      stubAudit(
        Array.from({ length: 5 }, (_, i) => mkAudit(uuid(i + 1), "SOLD")),
      );
      stubGoogle({
        onDelete: () => jsonResponse(status, {}),
        products: Array.from({ length: 5 }, (_, i) => googleProduct(uuid(i + 1))),
      });

      const result = await reconcileMerchantInventory({ enabled: true });

      expect(callsWithMethod("DELETE")).toHaveLength(1);
      expect(result).toMatchObject({
        failed: 1,
        stoppedEarly: true,
        succeeded: 0,
        writesAttempted: 1,
      });
      expect(result.failures[0].code).toBe(code);
    });
  }

  it("reports a sanitised failure summary with no upstream detail", async () => {
    stubAudit([mkAudit(SAREE, "SOLD")]);
    stubGoogle({
      onDelete: () =>
        jsonResponse(400, { error: { message: `raw ${ACCESS_TOKEN}` } }),
      products: [googleProduct(SAREE)],
    });

    const result = await reconcileMerchantInventory({ enabled: true });
    const serialised = JSON.stringify(result);

    expect(serialised).not.toContain(ACCESS_TOKEN);
    expect(serialised).not.toContain("raw ya29");
    expect(serialised).not.toContain(DATA_SOURCE);
  });
});

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

describe("previewMerchantInventorySync", () => {
  it("writes nothing — only the products.list GET", async () => {
    stubAudit([mkAudit(uuid(1), "SOLD"), mkAudit(uuid(2), "RESERVED")]);
    stubGoogle({ products: [googleProduct(uuid(1)), googleProduct(uuid(2))] });

    const plan = await previewMerchantInventorySync();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(listCalls()).toHaveLength(1);
    expect(plan.summary.pendingWrites).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Admin preview route
// ---------------------------------------------------------------------------

const ADMIN = { email: "admin@example.com", id: "admin-1", role: "admin" };
const CUSTOMER = { email: "user@example.com", id: "user-1", role: "customer" };

const previewHarness = (
  authUser: { email: string; id: string; role: string } | null,
  deps: Parameters<typeof registerGoogleMerchantSyncRoutes>[1] = {},
) =>
  createRouteHarness({
    authUser,
    register: (app) => registerGoogleMerchantSyncRoutes(app, deps),
  });

describe("GET /inventory-sync/preview", () => {
  it("401s unauthenticated and 403s a non-admin", async () => {
    vi.stubEnv("ADMIN_API_SECRET", undefined);

    expect(
      (await previewHarness(null).request("/inventory-sync/preview")).status,
    ).toBe(401);
    expect(
      (await previewHarness(CUSTOMER).request("/inventory-sync/preview")).status,
    ).toBe(403);
  });

  it("serves an admin with no kill switch and outside production", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("GOOGLE_MERCHANT_INVENTORY_SYNC_ENABLED", "false");
    vi.stubEnv("GOOGLE_MERCHANT_CATALOGUE_SYNC_ENABLED", "false");

    const response = await previewHarness(ADMIN).request(
      "/inventory-sync/preview",
    );

    expect(response.status).toBe(200);
    expect(callsWithMethod("PATCH")).toHaveLength(0);
    expect(callsWithMethod("DELETE")).toHaveLength(0);
  });

  it("exposes the decision but no payload, price, image or resource name", async () => {
    stubAudit([mkAudit(uuid(1), "RESERVED")]);
    stubGoogle({ products: [googleProduct(uuid(1))] });

    const response = await previewHarness(ADMIN).request(
      "/inventory-sync/preview",
    );
    const raw = await response.text();
    const body = JSON.parse(raw) as {
      actions: Array<Record<string, unknown>>;
      summary: Record<string, unknown>;
    };

    expect(Object.keys(body.actions[0]).sort()).toEqual([
      "action",
      "googleAvailability",
      "localStockStatus",
      "merchantReadiness",
      "name",
      "offerId",
      "presentInMerchant",
      "productId",
      "reason",
      "slug",
    ]);
    expect(body.summary.writeCeiling).toBe(MAX_INVENTORY_SYNC_WRITES);

    for (const leak of [
      "productAttributes",
      "amountMicros",
      "imageLink",
      "accounts/",
      ACCESS_TOKEN,
    ]) {
      expect(raw).not.toContain(leak);
    }
  });

  it("returns a sanitised 500 when the preview fails", async () => {
    const harness = previewHarness(ADMIN, {
      previewInventorySync: () =>
        Promise.reject(new Error(`boom ${ACCESS_TOKEN} postgres://u:p@h/db`)),
    });

    const response = await harness.request("/inventory-sync/preview");
    const raw = await response.text();

    expect(response.status).toBe(500);
    expect(raw).not.toContain(ACCESS_TOKEN);
    expect(raw).not.toContain("postgres://");
  });
});

// ---------------------------------------------------------------------------
// Cron
// ---------------------------------------------------------------------------

const CRON_PATH = "/reconcile-google-merchant-inventory";

const cronHarness = () =>
  createRouteHarness({ authUser: null, register: registerCronRoutes });

const getCron = (headers: Record<string, string> = {}) =>
  cronHarness().request(CRON_PATH, { headers, method: "GET" });

const asCron = { Authorization: `Bearer ${CRON_SECRET}` };

describe("GET /cron/reconcile-google-merchant-inventory", () => {
  it("500s when CRON_SECRET is not configured", async () => {
    vi.stubEnv("CRON_SECRET", undefined);

    const response = await getCron();

    expect(response.status).toBe(500);
    expect((await response.json()) as { code: string }).toMatchObject({
      code: "CRON_SECRET_MISSING",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("401s without a bearer token", async () => {
    vi.stubEnv("CRON_SECRET", CRON_SECRET);

    expect((await getCron()).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("401s with the wrong secret", async () => {
    vi.stubEnv("CRON_SECRET", CRON_SECRET);

    const response = await getCron({ Authorization: "Bearer wrong-secret" });

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("performs ZERO Google writes while the switch is off", async () => {
    vi.stubEnv("CRON_SECRET", CRON_SECRET);
    vi.stubEnv("GOOGLE_MERCHANT_INVENTORY_SYNC_ENABLED", "false");
    stubAudit([mkAudit(uuid(1), "SOLD"), mkAudit(uuid(2), "RESERVED")]);
    stubGoogle({ products: [googleProduct(uuid(1)), googleProduct(uuid(2))] });

    const response = await getCron(asCron);
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      enabled: false,
      ok: true,
      remaining: 2,
      succeeded: 0,
      writesAttempted: 0,
    });
    expect(callsWithMethod("DELETE")).toHaveLength(0);
    expect(callsWithMethod("PATCH")).toHaveLength(0);
    expect(callsWithMethod("POST")).toHaveLength(0);
  });

  it("does NOT reuse the bootstrap catalogue-sync switch", async () => {
    vi.stubEnv("CRON_SECRET", CRON_SECRET);
    // The manual bootstrap switch ON, the inventory switch OFF: still no write.
    vi.stubEnv("GOOGLE_MERCHANT_CATALOGUE_SYNC_ENABLED", "true");
    vi.stubEnv("GOOGLE_MERCHANT_INVENTORY_SYNC_ENABLED", "false");
    stubAudit([mkAudit(uuid(1), "SOLD")]);
    stubGoogle({ products: [googleProduct(uuid(1))] });

    const body = (await (await getCron(asCron)).json()) as { enabled: boolean };

    expect(body.enabled).toBe(false);
    expect(callsWithMethod("DELETE")).toHaveLength(0);
  });

  it("reconciles exactly once when the switch is on", async () => {
    vi.stubEnv("CRON_SECRET", CRON_SECRET);
    vi.stubEnv("GOOGLE_MERCHANT_INVENTORY_SYNC_ENABLED", "true");
    stubAudit([mkAudit(uuid(1), "SOLD")]);
    stubGoogle({ products: [googleProduct(uuid(1))] });

    const response = await getCron(asCron);
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      enabled: true,
      ok: true,
      succeeded: 1,
      writesAttempted: 1,
    });
    expect(runAuditMock).toHaveBeenCalledTimes(1);
    expect(listCalls()).toHaveLength(1);
    expect(callsWithMethod("DELETE")).toHaveLength(1);
  });

  it("never mutates product inventory itself", async () => {
    // Any db access throws via the module mock; a 200 proves none happened.
    vi.stubEnv("CRON_SECRET", CRON_SECRET);
    vi.stubEnv("GOOGLE_MERCHANT_INVENTORY_SYNC_ENABLED", "true");
    stubAudit([mkAudit(uuid(1), "RESERVED")]);
    stubGoogle({ products: [googleProduct(uuid(1))] });

    expect((await getCron(asCron)).status).toBe(200);
  });

  it("survives a Google outage without looking like a platform error", async () => {
    vi.stubEnv("CRON_SECRET", CRON_SECRET);
    vi.stubEnv("GOOGLE_MERCHANT_INVENTORY_SYNC_ENABLED", "true");
    fetchMock.mockRejectedValue(new Error(`network down ${ACCESS_TOKEN}`));

    const response = await getCron(asCron);
    const raw = await response.text();

    expect(response.status).toBe(200);
    expect(JSON.parse(raw)).toMatchObject({
      code: "RECONCILIATION_FAILED",
      ok: false,
    });
    expect(raw).not.toContain(ACCESS_TOKEN);
  });

  it("leaks no credential in the response of a normal run", async () => {
    vi.stubEnv("CRON_SECRET", CRON_SECRET);
    vi.stubEnv("GOOGLE_MERCHANT_INVENTORY_SYNC_ENABLED", "true");

    const raw = await (await getCron(asCron)).text();

    for (const leak of [ACCESS_TOKEN, CRON_SECRET, DATA_SOURCE, "accounts/"]) {
      expect(raw).not.toContain(leak);
    }
  });
});

// ---------------------------------------------------------------------------
// Vercel cron wiring
// ---------------------------------------------------------------------------

describe("vercel.json", () => {
  /** A route nobody schedules never runs, however correct it is. */
  const readCrons = async () => {
    const { readFileSync } = await import("fs");
    const raw = readFileSync(
      new URL("../../vercel.json", import.meta.url),
      "utf8",
    );

    return (JSON.parse(raw) as { crons: Array<{ path: string; schedule: string }> })
      .crons;
  };

  it("schedules the reconciler every minute", async () => {
    const crons = await readCrons();
    const entry = crons.find(
      (cron) => cron.path === `/api/v2/cron${CRON_PATH}`,
    );

    expect(entry).toBeDefined();
    expect(entry?.schedule).toBe("* * * * *");
  });

  it("leaves the four existing cron schedules untouched", async () => {
    const crons = await readCrons();
    const schedules = Object.fromEntries(
      crons.map((cron) => [cron.path, cron.schedule]),
    );

    expect(schedules["/api/v2/cron/release-reservations"]).toBe("*/10 * * * *");
    expect(schedules["/api/v2/cron/send-reservation-expiry-reminders"]).toBe(
      "*/15 * * * *",
    );
    expect(schedules["/api/v2/cron/weekly-ops-digest"]).toBe("0 9 * * 1");
    expect(schedules["/api/v2/cron/refresh-channel-metrics"]).toBe("0 */6 * * *");
    expect(crons).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// Bootstrap regressions — the manual paths are untouched
// ---------------------------------------------------------------------------

describe("the manual bootstrap paths are unchanged", () => {
  const enableBootstrap = () => {
    vi.stubEnv("GOOGLE_MERCHANT_CATALOGUE_SYNC_ENABLED", "true");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("ADMIN_API_SECRET", undefined);
  };

  const post = (path: string, body: unknown) =>
    previewHarness(ADMIN).request(path, {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

  it("keeps /catalogue-sync/apply INSERT-only — it never deletes or patches", async () => {
    enableBootstrap();
    // A sold saree and a reserved saree, both live in Merchant: the inventory
    // worker would delete one and patch the other. Apply must do neither.
    stubAudit([
      mkAudit(uuid(1), "SOLD"),
      mkAudit(uuid(2), "RESERVED"),
      mkAudit(uuid(3)),
    ]);
    stubGoogle({ products: [googleProduct(uuid(1)), googleProduct(uuid(2))] });

    const response = await post("/catalogue-sync/apply", {
      confirm: "SYNC_FTT_GOOGLE_MERCHANT_BATCH",
      limit: 5,
    });

    expect(response.status).toBe(200);
    expect(callsWithMethod("DELETE")).toHaveLength(0);
    expect(callsWithMethod("PATCH")).toHaveLength(0);
    // Only the one missing READY saree is inserted.
    expect(callsWithMethod("POST")).toHaveLength(1);
  });

  it("keeps the manual delete restricted to UNSUPPORTED_PRODUCT_TYPE", async () => {
    enableBootstrap();
    // SOLD is deletable by the automatic worker but must STILL be refused here.
    stubAudit([mkAudit(SAREE, "SOLD")]);
    stubGoogle({ products: [googleProduct(SAREE)] });

    const response = await post("/catalogue-sync/delete", {
      confirm: "DELETE_FTT_UNSUPPORTED_GOOGLE_MERCHANT_PRODUCT",
      productId: SAREE,
    });

    expect(response.status).toBe(409);
    expect((await response.json()) as { code: string }).toMatchObject({
      code: "MERCHANT_DELETE_NOT_PERMITTED",
    });
    expect(callsWithMethod("DELETE")).toHaveLength(0);
  });

  it("still surfaces a 404 from the MANUAL delete rather than claiming success", async () => {
    // The automatic sold path treats an upstream 404 as convergence. The
    // human-triggered endpoint must not inherit that leniency.
    enableBootstrap();
    stubAudit([mkAudit(SAREE, "UNSUPPORTED_PRODUCT_TYPE")]);
    stubGoogle({
      onDelete: () => jsonResponse(404, {}),
      products: [googleProduct(SAREE)],
    });

    const response = await post("/catalogue-sync/delete", {
      confirm: "DELETE_FTT_UNSUPPORTED_GOOGLE_MERCHANT_PRODUCT",
      productId: SAREE,
    });

    expect(response.status).toBe(502);
    expect((await response.json()) as { code: string }).toMatchObject({
      code: "GOOGLE_REQUEST_FAILED",
    });
  });
});
