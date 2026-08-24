/**
 * Phase 2A — catalogue readiness service + admin route.
 *
 * What these tests prove:
 *   - The audit is READ-ONLY: only SELECT-shaped calls (listProducts, ONE
 *     product-types lookup and ONE batched reservations lookup), no write query
 *     of any kind, and no fetch — so no Merchant API request can happen during
 *     an audit.
 *   - Product types are loaded ONCE for the whole page: never
 *     `getProductTypeById()` per product, no matter how large the catalogue.
 *   - Reservation counts are batched: one call with every id, never N+1.
 *   - The reservations query is skipped entirely when inventory v2 is off.
 *   - The endpoint is admin-only but has no kill switch and no production gate,
 *     because it cannot change anything.
 *   - The JSON body carries only the safe report keys; the internally built
 *     ProductInput never leaves the process.
 *   - The CSV variant serialises the same sanitised reports.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks — database, flags, logger
// ---------------------------------------------------------------------------

const listProductsMock = vi.hoisted(() => vi.fn());
const writeQueryMocks = vi.hoisted(() => ({
  createProduct: vi.fn(),
  deleteProduct: vi.fn(),
  updateProduct: vi.fn(),
  updateProductsBatch: vi.fn(),
}));
vi.mock("@/db/queries/products", () => ({
  listProducts: listProductsMock,
  ...writeQueryMocks,
}));

const listProductTypesMock = vi.hoisted(() => vi.fn());
vi.mock("@/db/queries/product-types", () => ({
  getProductTypeById: vi.fn(() => {
    throw new Error("per-product type lookups are not permitted in the audit");
  }),
  listProductTypes: listProductTypesMock,
}));

const getReservationCountsMock = vi.hoisted(() => vi.fn());
vi.mock("@/db/queries/reservations", () => ({
  getBatchActiveReservationsCounts: getReservationCountsMock,
}));

const isInventoryV2Mock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/config/flags", () => ({ isInventoryV2: isInventoryV2Mock }));

const logMock = vi.hoisted(() => ({
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}));
vi.mock("@/lib/log", () => ({ createLogger: () => logMock }));

import { registerGoogleMerchantCatalogueRoutes } from "@/api/hono/routes/google-merchant-catalogue";
import type { ProductWithRelations } from "@/db/queries/products";
import { runMerchantCatalogueAudit } from "@/lib/google-merchant/audit-catalogue";
import type { MerchantCatalogueAuditResult } from "@/lib/google-merchant/audit-catalogue";
import { createRouteHarness } from "../helpers/route-harness";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = new Date("2026-01-01T00:00:00.000Z");
const SAREE_TYPE_ID = "512925ba-62e3-4a9c-84b6-53fc4295e635";
const BLOUSE_TYPE_ID = "8fbf9c1e-9d3a-4f0b-9a7a-5f5d3f2c1b00";

const PRODUCT_TYPES = [
  { id: SAREE_TYPE_ID, name: "Preloved Saree", slug: "preloved-saree" },
  { id: BLOUSE_TYPE_ID, name: "Blouse", slug: "blouse" },
];

const READY_ATTRIBUTES = {
  age_group: "ADULT",
  color: "Orange",
  fabric: "Chiffon",
  gender: "FEMALE",
  size: "OS",
};

const mkMedia = (url: string) => ({
  alt: null,
  blurDataUrl: null,
  createdAt: NOW,
  filename: "img.jpg",
  filesize: 2_000_000,
  height: 1600,
  id: "media-1",
  key: "media/img.jpg",
  metadata: null,
  mimeType: "image/jpeg",
  updatedAt: NOW,
  url,
  width: 1200,
});

let sequence = 0;

function mkProduct(
  overrides: Record<string, unknown> = {},
): ProductWithRelations {
  sequence += 1;

  return {
    artisanId: null,
    attributes: { ...READY_ATTRIBUTES },
    collection: null,
    collectionId: null,
    createdAt: NOW,
    detailsCondition: "Excellent condition",
    detailsDesigner: null,
    detailsFabric: "Chiffon",
    detailsLength: null,
    detailsWidth: null,
    featured: false,
    id: `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`,
    images: [
      {
        media: mkMedia("https://blob.vercel-storage.com/img1.jpg"),
        sortOrder: 0,
      },
    ],
    metadata: { internalNote: "do not leak" },
    name: `Saree ${sequence}`,
    originalPricePaise: null,
    pricePaise: 529900,
    quantityAvailable: 1,
    reservedUntil: null,
    slug: `saree-${sequence}`,
    soldAt: null,
    status: "published",
    stockStatus: "available",
    storyEra: null,
    storyNarrative: "A tangerine chiffon with a noir floral border.",
    storyProvenance: null,
    storyTitle: "Story",
    tags: [],
    typeId: SAREE_TYPE_ID,
    updatedAt: NOW,
    ...overrides,
  } as unknown as ProductWithRelations;
}

const stubCatalogue = (rows: ProductWithRelations[], totalCount = rows.length) =>
  listProductsMock.mockResolvedValue({ rows, totalCount });

const fetchMock = vi.fn();

beforeEach(() => {
  sequence = 0;
  isInventoryV2Mock.mockReturnValue(false);
  listProductTypesMock.mockResolvedValue(PRODUCT_TYPES);
  getReservationCountsMock.mockResolvedValue(new Map());
  stubCatalogue([mkProduct()]);
  fetchMock.mockRejectedValue(new Error("no network call is permitted"));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// Service — read-only behaviour
// ---------------------------------------------------------------------------

describe("runMerchantCatalogueAudit — read-only", () => {
  it("lists published products only, through the existing query", async () => {
    await runMerchantCatalogueAudit();

    expect(listProductsMock).toHaveBeenCalledTimes(1);
    expect(listProductsMock).toHaveBeenCalledWith({
      includeDrafts: false,
      limit: 1000,
      offset: 0,
    });
  });

  it("makes no Merchant API request", async () => {
    await runMerchantCatalogueAudit();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("performs no database write", async () => {
    await runMerchantCatalogueAudit();

    for (const write of Object.values(writeQueryMocks)) {
      expect(write).not.toHaveBeenCalled();
    }
  });

  it("reports totals and truncation", async () => {
    stubCatalogue([mkProduct(), mkProduct()], 5);

    const audit = await runMerchantCatalogueAudit();

    expect(audit.totalPublishedProducts).toBe(5);
    expect(audit.truncated).toBe(true);
    expect(audit.summary.publishedProducts).toBe(2);
  });

  it("is not truncated when the page covers the catalogue", async () => {
    stubCatalogue([mkProduct(), mkProduct()], 2);

    expect((await runMerchantCatalogueAudit()).truncated).toBe(false);
  });

  it("returns the ProductInput for each ready product", async () => {
    const audit = await runMerchantCatalogueAudit();

    expect(audit.audits[0].report.merchantReadiness).toBe("READY");
    expect(audit.audits[0].productInput?.offerId).toBe(
      audit.audits[0].report.productId,
    );
  });
});

// ---------------------------------------------------------------------------
// Service — inventory batching
// ---------------------------------------------------------------------------

describe("runMerchantCatalogueAudit — inventory batching", () => {
  it("does not query reservations when inventory v2 is off", async () => {
    await runMerchantCatalogueAudit();

    expect(getReservationCountsMock).not.toHaveBeenCalled();
  });

  it("batches every product id into ONE reservations query", async () => {
    isInventoryV2Mock.mockReturnValue(true);
    const products = [mkProduct(), mkProduct(), mkProduct(), mkProduct()];
    stubCatalogue(products);

    await runMerchantCatalogueAudit();

    expect(getReservationCountsMock).toHaveBeenCalledTimes(1);
    expect(getReservationCountsMock).toHaveBeenCalledWith(
      products.map((product) => product.id),
    );
  });

  it("keeps the reservations query count at one regardless of catalogue size", async () => {
    isInventoryV2Mock.mockReturnValue(true);
    stubCatalogue(Array.from({ length: 50 }, () => mkProduct()));

    await runMerchantCatalogueAudit();

    expect(getReservationCountsMock).toHaveBeenCalledTimes(1);
    expect(listProductsMock).toHaveBeenCalledTimes(1);
  });

  it("loads the product-type taxonomy exactly once for the whole page", async () => {
    stubCatalogue(Array.from({ length: 62 }, () => mkProduct()));

    await runMerchantCatalogueAudit();

    expect(listProductTypesMock).toHaveBeenCalledTimes(1);
    expect(listProductTypesMock).toHaveBeenCalledWith();
  });

  it("keeps the audit at three queries with inventory v2 on", async () => {
    isInventoryV2Mock.mockReturnValue(true);
    stubCatalogue(Array.from({ length: 62 }, () => mkProduct()));

    await runMerchantCatalogueAudit();

    expect(listProductsMock).toHaveBeenCalledTimes(1);
    expect(listProductTypesMock).toHaveBeenCalledTimes(1);
    expect(getReservationCountsMock).toHaveBeenCalledTimes(1);
  });

  it("applies the batched counts to the right products", async () => {
    isInventoryV2Mock.mockReturnValue(true);
    const ready = mkProduct();
    const held = mkProduct();
    stubCatalogue([ready, held]);
    getReservationCountsMock.mockResolvedValue(new Map([[held.id, 1]]));

    const audit = await runMerchantCatalogueAudit();

    expect(audit.audits[0].report.merchantReadiness).toBe("READY");
    expect(audit.audits[1].report.merchantReadiness).toBe("RESERVED");
  });
});

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

type ReadinessBody = {
  products: Array<Record<string, unknown>>;
  summary: {
    blocked: number;
    byReason: Record<string, number>;
    byReasonCode: Record<string, number>;
    publishedProducts: number;
    ready: number;
  };
};

const ADMIN = { email: "admin@example.com", id: "admin-1", role: "admin" };
const CUSTOMER = { email: "user@example.com", id: "user-1", role: "customer" };

const makeHarness = (
  authUser: { email: string; id: string; role: string } | null,
  runAudit: () => Promise<MerchantCatalogueAuditResult> = () =>
    runMerchantCatalogueAudit(),
) =>
  createRouteHarness({
    authUser,
    register: (app) =>
      registerGoogleMerchantCatalogueRoutes(app, { runAudit }),
  });

describe("GET /catalogue-readiness — access", () => {
  it("401s for an unauthenticated request", async () => {
    const response = await makeHarness(null).request("/catalogue-readiness");

    expect(response.status).toBe(401);
    expect(listProductsMock).not.toHaveBeenCalled();
  });

  it("403s for a signed-in non-admin", async () => {
    vi.stubEnv("ADMIN_API_SECRET", undefined);

    const response = await makeHarness(CUSTOMER).request(
      "/catalogue-readiness",
    );

    expect(response.status).toBe(403);
    expect(listProductsMock).not.toHaveBeenCalled();
  });

  it("serves an admin in production", async () => {
    vi.stubEnv("VERCEL_ENV", "production");

    expect(
      (await makeHarness(ADMIN).request("/catalogue-readiness")).status,
    ).toBe(200);
  });

  it("serves an admin outside production — no kill switch needed", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("GOOGLE_MERCHANT_REGISTRATION_ENABLED", "false");
    vi.stubEnv("GOOGLE_MERCHANT_TEST_INSERT_ENABLED", "false");

    expect(
      (await makeHarness(ADMIN).request("/catalogue-readiness")).status,
    ).toBe(200);
  });
});

describe("GET /catalogue-readiness — body", () => {
  it("returns a deterministic summary and safe product reports", async () => {
    stubCatalogue([
      mkProduct(),
      mkProduct({ attributes: { fabric: "Chiffon" } }),
      mkProduct({ images: [] }),
      mkProduct({ stockStatus: "sold" }),
      mkProduct({ name: "test chiffon do not buy" }),
    ]);

    const response = await makeHarness(ADMIN).request("/catalogue-readiness");
    const body = (await response.json()) as ReadinessBody;

    expect(response.status).toBe(200);
    expect(body.summary.publishedProducts).toBe(5);
    expect(body.summary.ready).toBe(1);
    expect(body.summary.blocked).toBe(4);
    expect(body.summary.byReason.MISSING_REQUIRED_ATTRIBUTES).toBe(1);
    expect(body.summary.byReason.NO_VALID_IMAGE).toBe(1);
    expect(body.summary.byReason.SOLD).toBe(1);
    expect(body.summary.byReason.EXCLUDED_TEST_PRODUCT).toBe(1);
    expect(body.products).toHaveLength(5);
  });

  it("reports blouses as UNSUPPORTED_PRODUCT_TYPE and never as READY", async () => {
    stubCatalogue([
      mkProduct(),
      mkProduct(),
      mkProduct({ typeId: BLOUSE_TYPE_ID }),
      mkProduct({ typeId: BLOUSE_TYPE_ID }),
      mkProduct({ typeId: null }),
    ]);

    const body = (await (
      await makeHarness(ADMIN).request("/catalogue-readiness")
    ).json()) as ReadinessBody;

    expect(body.summary.publishedProducts).toBe(5);
    expect(body.summary.ready).toBe(2);
    expect(body.summary.byReason.UNSUPPORTED_PRODUCT_TYPE).toBe(3);
    expect(body.summary.byReasonCode.unsupported_product_type).toBe(3);
  });

  it("emits exactly the agreed safe keys per product", async () => {
    const body = (await (
      await makeHarness(ADMIN).request("/catalogue-readiness")
    ).json()) as ReadinessBody;

    expect(Object.keys(body.products[0]).sort()).toEqual([
      "images",
      "merchantReadiness",
      "missingFields",
      "name",
      "productId",
      "reasons",
      "slug",
      "status",
      "stockStatus",
    ]);
    expect(Object.keys(body).sort()).toEqual(["products", "summary"]);
  });

  it("never exposes the internally built ProductInput or row internals", async () => {
    const raw = await (
      await makeHarness(ADMIN).request("/catalogue-readiness")
    ).text();

    for (const leak of [
      "productInput",
      "offerId",
      "amountMicros",
      "productAttributes",
      "internalNote",
      "blob.vercel-storage",
      "pricePaise",
    ]) {
      expect(raw).not.toContain(leak);
    }
  });

  it("emits no duplicate product ids", async () => {
    stubCatalogue([mkProduct(), mkProduct(), mkProduct()]);

    const body = (await (
      await makeHarness(ADMIN).request("/catalogue-readiness")
    ).json()) as ReadinessBody;

    const ids = body.products.map((product) => product.productId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("makes no Merchant API request while serving", async () => {
    await makeHarness(ADMIN).request("/catalogue-readiness");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns a sanitised 500 when the audit fails", async () => {
    const harness = makeHarness(ADMIN, () =>
      Promise.reject(new Error("DATABASE_URL=postgres://user:pw@host/db")),
    );

    const response = await harness.request("/catalogue-readiness");
    const raw = await response.text();

    expect(response.status).toBe(500);
    expect(raw).not.toContain("postgres://");
    expect(JSON.parse(raw)).toEqual({
      code: "CATALOGUE_AUDIT_FAILED",
      message: "The catalogue readiness audit could not be completed.",
    });
  });
});

describe("GET /catalogue-readiness.csv", () => {
  it("401s for an unauthenticated request", async () => {
    const response = await makeHarness(null).request(
      "/catalogue-readiness.csv",
    );

    expect(response.status).toBe(401);
  });

  it("403s for a signed-in non-admin", async () => {
    vi.stubEnv("ADMIN_API_SECRET", undefined);

    const response = await makeHarness(CUSTOMER).request(
      "/catalogue-readiness.csv",
    );

    expect(response.status).toBe(403);
  });

  it("returns the agreed columns as an attachment", async () => {
    stubCatalogue([mkProduct(), mkProduct({ attributes: { fabric: "Silk" } })]);

    const response = await makeHarness(ADMIN).request(
      "/catalogue-readiness.csv",
    );
    const csv = await response.text();
    const lines = csv.split("\n");

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(
      "text/csv; charset=utf-8",
    );
    expect(response.headers.get("Content-Disposition")).toContain(
      "ftt-merchant-catalogue-readiness.csv",
    );
    expect(lines[0]).toBe(
      "product_id,slug,name,stock_status,merchant_readiness,missing_fields,reasons",
    );
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain("READY");
    expect(lines[2]).toContain("color|gender|ageGroup|size");
  });

  it("leaks nothing the JSON endpoint would not", async () => {
    const csv = await (
      await makeHarness(ADMIN).request("/catalogue-readiness.csv")
    ).text();

    for (const leak of ["internalNote", "blob.vercel-storage", "amountMicros"]) {
      expect(csv).not.toContain(leak);
    }
  });
});
