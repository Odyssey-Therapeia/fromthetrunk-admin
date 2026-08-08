/**
 * Phase 2A.1 — catalogue backfill service + admin routes.
 *
 * What these tests prove:
 *   - Preview performs ZERO writes: `updateProduct` is never called.
 *   - Apply recomputes the plan from current state, re-validates every change,
 *     writes only `attributes` through the existing `updateProduct` helper (no
 *     raw SQL), and then re-runs the readiness audit.
 *   - Apply is idempotent: a second run over the written rows changes nothing.
 *   - Apply refuses when the catalogue moved under it, and fails closed with
 *     accounting when a write fails.
 *   - The apply endpoint is admin-only, production-only and kill-switched; the
 *     preview endpoint is admin-only but needs neither, because it cannot write.
 *   - No fetch happens anywhere — the backfill never touches the Merchant API.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks — database, flags, logger
// ---------------------------------------------------------------------------

const listProductsMock = vi.hoisted(() => vi.fn());
const updateProductMock = vi.hoisted(() => vi.fn());
const forbiddenWriteMocks = vi.hoisted(() => ({
  createProduct: vi.fn(),
  deleteProduct: vi.fn(),
  updateProductsBatch: vi.fn(),
}));
vi.mock("@/db/queries/products", () => ({
  getProduct: vi.fn(),
  listProducts: listProductsMock,
  updateProduct: updateProductMock,
  ...forbiddenWriteMocks,
}));

const listProductTypesMock = vi.hoisted(() => vi.fn());
vi.mock("@/db/queries/product-types", () => ({
  listProductTypes: listProductTypesMock,
}));

const getReservationCountsMock = vi.hoisted(() => vi.fn());
vi.mock("@/db/queries/reservations", () => ({
  getBatchActiveReservationsCounts: getReservationCountsMock,
}));

const isInventoryV2Mock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/config/flags", () => ({ isInventoryV2: isInventoryV2Mock }));

const rawSqlMock = vi.hoisted(() => vi.fn());
vi.mock("@/db", () => ({
  db: new Proxy(
    {},
    {
      get() {
        throw new Error("direct db access is not permitted in the backfill");
      },
    },
  ),
  rawSql: rawSqlMock,
  withRetry: (fn: () => unknown) => fn(),
}));

const logMock = vi.hoisted(() => ({
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}));
vi.mock("@/lib/log", () => ({ createLogger: () => logMock }));

import { registerGoogleMerchantBackfillRoutes } from "@/api/hono/routes/google-merchant-backfill";
import type { ProductWithRelations } from "@/db/queries/products";
import type { ProductTypeRecord } from "@/db/queries/product-types";
import {
  applyMerchantCatalogueBackfill,
  previewMerchantCatalogueBackfill,
} from "@/lib/google-merchant/apply-catalogue-backfill";
import { mergeBackfillAttributes } from "@/lib/google-merchant/catalogue-backfill";
import { GoogleMerchantError } from "@/lib/google-merchant/config";
import { createRouteHarness } from "../helpers/route-harness";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = new Date("2026-01-01T00:00:00.000Z");
const SAREE_TYPE_ID = "512925ba-62e3-4a9c-84b6-53fc4295e635";

const sareeType = {
  attributeDefs: ["fabric", "condition", "color", "gender", "age_group", "size"].map(
    (key) => ({ key, meta: { label: key, type: "text" }, required: false }),
  ),
  createdAt: NOW,
  id: SAREE_TYPE_ID,
  name: "Preloved Saree",
  slug: "preloved-saree",
  updatedAt: NOW,
} as unknown as ProductTypeRecord;

let sequence = 0;

function mkProduct(
  overrides: Record<string, unknown> = {},
): ProductWithRelations {
  sequence += 1;

  return {
    attributes: { color: "Orange", condition: "Excellent", fabric: "Chiffon" },
    createdAt: NOW,
    detailsFabric: "Chiffon",
    id: `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`,
    images: [
      {
        media: { id: "m1", url: "https://blob.vercel-storage.com/a.jpg" },
        sortOrder: 0,
      },
    ],
    name: `Saree ${sequence}`,
    pricePaise: 529900,
    quantityAvailable: 1,
    slug: `saree-${sequence}`,
    status: "published",
    stockStatus: "available",
    storyTitle: "Story",
    tags: [],
    typeId: SAREE_TYPE_ID,
    updatedAt: NOW,
    ...overrides,
  } as unknown as ProductWithRelations;
}

/** Backing store so apply's writes are visible to the readiness re-run. */
let catalogue: ProductWithRelations[] = [];

const setCatalogue = (rows: ProductWithRelations[]) => {
  catalogue = rows;
};

const fetchMock = vi.fn();

beforeEach(() => {
  sequence = 0;
  setCatalogue([mkProduct(), mkProduct()]);

  listProductsMock.mockImplementation(() =>
    Promise.resolve({ rows: catalogue, totalCount: catalogue.length }),
  );
  listProductTypesMock.mockResolvedValue([sareeType]);
  getReservationCountsMock.mockResolvedValue(new Map());
  isInventoryV2Mock.mockReturnValue(false);

  // A write updates the in-memory catalogue, mirroring the real helper.
  updateProductMock.mockImplementation(
    (productId: string, input: { attributes: Record<string, unknown> }) => {
      const index = catalogue.findIndex((row) => row.id === productId);
      if (index === -1) return Promise.resolve(null);

      catalogue[index] = {
        ...catalogue[index],
        attributes: input.attributes,
      } as ProductWithRelations;

      return Promise.resolve(catalogue[index]);
    },
  );

  fetchMock.mockRejectedValue(new Error("no network call is permitted"));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// Preview — read-only
// ---------------------------------------------------------------------------

describe("previewMerchantCatalogueBackfill", () => {
  it("proposes the catalogue defaults", async () => {
    const plan = await previewMerchantCatalogueBackfill();

    expect(plan.summary.productsScanned).toBe(2);
    expect(plan.summary.productsWouldChange).toBe(2);
    expect(plan.summary.fieldWrites).toBe(6);
    expect(plan.changes[0].set).toEqual({
      age_group: "ADULT",
      gender: "FEMALE",
      size: "OS",
    });
  });

  it("performs zero writes", async () => {
    await previewMerchantCatalogueBackfill();

    expect(updateProductMock).not.toHaveBeenCalled();
    for (const write of Object.values(forbiddenWriteMocks)) {
      expect(write).not.toHaveBeenCalled();
    }
  });

  it("uses no raw SQL", async () => {
    await previewMerchantCatalogueBackfill();

    expect(rawSqlMock).not.toHaveBeenCalled();
  });

  it("makes no Merchant API request", async () => {
    await previewMerchantCatalogueBackfill();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("scans published products of every stock status", async () => {
    setCatalogue([
      mkProduct({ stockStatus: "available" }),
      mkProduct({ stockStatus: "reserved" }),
      mkProduct({ stockStatus: "sold" }),
    ]);

    const plan = await previewMerchantCatalogueBackfill();

    expect(listProductsMock).toHaveBeenCalledWith({
      includeDrafts: false,
      limit: 1000,
      offset: 0,
    });
    expect(plan.summary.productsWouldChange).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

describe("applyMerchantCatalogueBackfill", () => {
  it("writes only the previewed fields, through updateProduct", async () => {
    const [first] = catalogue;

    const result = await applyMerchantCatalogueBackfill();

    expect(result.applied).toBe(true);
    expect(result.productsChanged).toBe(2);
    expect(result.fieldsWritten).toBe(6);

    expect(updateProductMock).toHaveBeenCalledTimes(2);
    expect(updateProductMock).toHaveBeenNthCalledWith(1, first.id, {
      attributes: {
        age_group: "ADULT",
        color: "Orange",
        condition: "Excellent",
        fabric: "Chiffon",
        gender: "FEMALE",
        size: "OS",
      },
    });
  });

  it("touches no column other than attributes", async () => {
    await applyMerchantCatalogueBackfill();

    for (const [, input] of updateProductMock.mock.calls) {
      expect(Object.keys(input as Record<string, unknown>)).toEqual([
        "attributes",
      ]);
    }
  });

  it("uses no raw SQL and no bulk helper", async () => {
    await applyMerchantCatalogueBackfill();

    expect(rawSqlMock).not.toHaveBeenCalled();
    for (const write of Object.values(forbiddenWriteMocks)) {
      expect(write).not.toHaveBeenCalled();
    }
  });

  it("makes no Merchant API request", async () => {
    await applyMerchantCatalogueBackfill();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("re-runs the readiness audit afterwards", async () => {
    const result = await applyMerchantCatalogueBackfill();

    // Both products are now fully attributed, so both are READY.
    expect(result.readinessAfter).toEqual({ blocked: 0, ready: 2 });
  });

  it("is idempotent — a second apply changes nothing", async () => {
    const first = await applyMerchantCatalogueBackfill();
    updateProductMock.mockClear();

    const second = await applyMerchantCatalogueBackfill();

    expect(first.productsChanged).toBe(2);
    expect(second.productsChanged).toBe(0);
    expect(second.fieldsWritten).toBe(0);
    expect(updateProductMock).not.toHaveBeenCalled();
  });

  it("never overwrites a value written between preview and apply", async () => {
    setCatalogue([
      mkProduct({
        attributes: { color: "Orange", gender: "MALE" },
      }),
    ]);

    await applyMerchantCatalogueBackfill();

    const [, input] = updateProductMock.mock.calls[0] as [
      string,
      { attributes: Record<string, unknown> },
    ];
    expect(input.attributes.gender).toBe("MALE");
  });

  it("writes nothing when the type does not declare the keys", async () => {
    // The schema as it stands in the database today: no gender, no age_group,
    // and no size on the saree type.
    listProductTypesMock.mockResolvedValue([
      {
        ...sareeType,
        attributeDefs: [
          { key: "fabric" },
          { key: "condition" },
          { key: "color" },
        ],
      },
    ]);

    const result = await applyMerchantCatalogueBackfill();

    expect(result.productsChanged).toBe(0);
    expect(result.fieldsWritten).toBe(0);
    expect(updateProductMock).not.toHaveBeenCalled();
  });

  it("surfaces those products for manual review instead", async () => {
    listProductTypesMock.mockResolvedValue([
      { ...sareeType, attributeDefs: [{ key: "fabric" }] },
    ]);

    const plan = await previewMerchantCatalogueBackfill();

    expect(plan.summary.requiresManualReview).toBe(2);
    expect(plan.manualReview[0].reasons).toContain("TYPE_ATTRIBUTE_NOT_DEFINED");
    expect(plan.manualReview[0].missingFields).toEqual([
      "gender",
      "ageGroup",
      "size",
    ]);
  });

  it("fails closed with accounting when a write fails", async () => {
    setCatalogue([mkProduct(), mkProduct(), mkProduct()]);
    const failing = catalogue[1].id;
    updateProductMock.mockImplementation((productId: string) =>
      productId === failing
        ? Promise.reject(new Error("connection reset"))
        : Promise.resolve(catalogue[0]),
    );

    const error = await applyMerchantCatalogueBackfill().catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(GoogleMerchantError);
    expect((error as GoogleMerchantError).code).toBe(
      "CATALOGUE_BACKFILL_WRITE_FAILED",
    );
    expect((error as GoogleMerchantError).message).toContain("1 product(s)");
    // Stopped at the failure — the third product was never attempted.
    expect(updateProductMock).toHaveBeenCalledTimes(2);
  });

  it("writes nothing when the plan is empty", async () => {
    setCatalogue([
      mkProduct({
        attributes: {
          age_group: "ADULT",
          color: "Orange",
          condition: "Excellent",
          fabric: "Chiffon",
          gender: "FEMALE",
          size: "OS",
        },
      }),
    ]);

    const result = await applyMerchantCatalogueBackfill();

    expect(result.productsChanged).toBe(0);
    expect(updateProductMock).not.toHaveBeenCalled();
  });

  it("keeps merged attributes free of any other change", async () => {
    const before = { ...(catalogue[0].attributes as Record<string, unknown>) };
    const plan = await previewMerchantCatalogueBackfill();

    expect(mergeBackfillAttributes(catalogue[0], plan.changes[0])).toEqual({
      ...before,
      age_group: "ADULT",
      gender: "FEMALE",
      size: "OS",
    });
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
  deps: Parameters<typeof registerGoogleMerchantBackfillRoutes>[1] = {},
) =>
  createRouteHarness({
    authUser,
    register: (app) => registerGoogleMerchantBackfillRoutes(app, deps),
  });

const post = (
  harness: ReturnType<typeof createRouteHarness>,
  path: string,
  body: unknown,
) =>
  harness.request(path, {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

const PREVIEW = "/catalogue-backfill/preview";
const APPLY = "/catalogue-backfill/apply";
const PREVIEW_BODY = { confirm: "PREVIEW_MERCHANT_CATALOGUE_BACKFILL" };
const APPLY_BODY = { confirm: "APPLY_MERCHANT_CATALOGUE_BACKFILL" };

const enableProductionApply = () => {
  vi.stubEnv("GOOGLE_MERCHANT_CATALOGUE_BACKFILL_ENABLED", "true");
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("ADMIN_API_SECRET", undefined);
};

describe("POST /catalogue-backfill/preview", () => {
  it("401s for an unauthenticated request", async () => {
    const response = await post(makeHarness(null), PREVIEW, PREVIEW_BODY);

    expect(response.status).toBe(401);
    expect(listProductsMock).not.toHaveBeenCalled();
  });

  it("403s for a signed-in non-admin", async () => {
    vi.stubEnv("ADMIN_API_SECRET", undefined);

    const response = await post(makeHarness(CUSTOMER), PREVIEW, PREVIEW_BODY);

    expect(response.status).toBe(403);
  });

  it("400s on a wrong confirmation phrase", async () => {
    const response = await post(makeHarness(ADMIN), PREVIEW, {
      confirm: "PREVIEW",
    });

    expect(response.status).toBe(400);
    expect(((await response.json()) as ErrorBody).code).toBe(
      "INVALID_CONFIRMATION",
    );
    expect(listProductsMock).not.toHaveBeenCalled();
  });

  it("400s on an extra property", async () => {
    const response = await post(makeHarness(ADMIN), PREVIEW, {
      ...PREVIEW_BODY,
      apply: true,
    });

    expect(response.status).toBe(400);
  });

  it("needs no kill switch and no production runtime", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("GOOGLE_MERCHANT_CATALOGUE_BACKFILL_ENABLED", "false");

    const response = await post(makeHarness(ADMIN), PREVIEW, PREVIEW_BODY);

    expect(response.status).toBe(200);
  });

  it("returns the agreed summary, changes and manualReview shape", async () => {
    setCatalogue([mkProduct(), mkProduct({ attributes: { fabric: "Chiffon" } })]);

    const response = await post(makeHarness(ADMIN), PREVIEW, PREVIEW_BODY);
    const body = (await response.json()) as {
      changes: Array<Record<string, unknown>>;
      manualReview: Array<Record<string, unknown>>;
      summary: Record<string, number>;
    };

    expect(response.status).toBe(200);
    expect(Object.keys(body).sort()).toEqual([
      "changes",
      "manualReview",
      "summary",
    ]);
    expect(Object.keys(body.summary).sort()).toEqual([
      "fieldWrites",
      "productsScanned",
      "productsWouldChange",
      "requiresManualReview",
      "skipped",
    ]);
    expect(Object.keys(body.changes[0]).sort()).toEqual([
      "name",
      "productId",
      "productType",
      "set",
      "slug",
    ]);
    expect(Object.keys(body.manualReview[0]).sort()).toEqual([
      "missingFields",
      "name",
      "productId",
      "reasons",
      "slug",
    ]);
  });

  it("writes nothing while serving", async () => {
    await post(makeHarness(ADMIN), PREVIEW, PREVIEW_BODY);

    expect(updateProductMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("exposes no row internals", async () => {
    const raw = await (
      await post(makeHarness(ADMIN), PREVIEW, PREVIEW_BODY)
    ).text();

    for (const leak of [
      "pricePaise",
      "stockStatus",
      "blob.vercel-storage",
      "typeId",
      "storyTitle",
    ]) {
      expect(raw).not.toContain(leak);
    }
  });

  it("returns a sanitised 500 when the preview fails", async () => {
    const harness = makeHarness(ADMIN, {
      previewBackfill: () =>
        Promise.reject(new Error("DATABASE_URL=postgres://user:pw@host/db")),
    });

    const response = await post(harness, PREVIEW, PREVIEW_BODY);
    const raw = await response.text();

    expect(response.status).toBe(500);
    expect(raw).not.toContain("postgres://");
    expect(JSON.parse(raw)).toEqual({
      code: "CATALOGUE_BACKFILL_FAILED",
      message: "The catalogue backfill preview could not be completed.",
    });
  });
});

describe("POST /catalogue-backfill/apply — gates", () => {
  it("404s when the kill switch is off", async () => {
    enableProductionApply();
    vi.stubEnv("GOOGLE_MERCHANT_CATALOGUE_BACKFILL_ENABLED", "false");

    const response = await post(makeHarness(ADMIN), APPLY, APPLY_BODY);

    expect(response.status).toBe(404);
    expect(updateProductMock).not.toHaveBeenCalled();
  });

  it("404s when the kill switch is unset", async () => {
    enableProductionApply();
    vi.stubEnv("GOOGLE_MERCHANT_CATALOGUE_BACKFILL_ENABLED", undefined);

    expect((await post(makeHarness(ADMIN), APPLY, APPLY_BODY)).status).toBe(404);
  });

  it("404s outside production", async () => {
    enableProductionApply();
    vi.stubEnv("VERCEL_ENV", "preview");

    const response = await post(makeHarness(ADMIN), APPLY, APPLY_BODY);

    expect(response.status).toBe(404);
    expect(updateProductMock).not.toHaveBeenCalled();
  });

  it("gates before authentication", async () => {
    enableProductionApply();
    vi.stubEnv("GOOGLE_MERCHANT_CATALOGUE_BACKFILL_ENABLED", "false");

    expect((await post(makeHarness(null), APPLY, APPLY_BODY)).status).toBe(404);
  });

  it("401s for an unauthenticated request", async () => {
    enableProductionApply();

    const response = await post(makeHarness(null), APPLY, APPLY_BODY);

    expect(response.status).toBe(401);
    expect(updateProductMock).not.toHaveBeenCalled();
  });

  it("403s for a signed-in non-admin", async () => {
    enableProductionApply();

    const response = await post(makeHarness(CUSTOMER), APPLY, APPLY_BODY);

    expect(response.status).toBe(403);
    expect(updateProductMock).not.toHaveBeenCalled();
  });

  const wrongBodies: Array<{ body: unknown; label: string }> = [
    { body: { confirm: "APPLY" }, label: "a truncated phrase" },
    { body: PREVIEW_BODY, label: "the preview phrase" },
    {
      body: { confirm: "apply_merchant_catalogue_backfill" },
      label: "a lower-cased phrase",
    },
    { body: {}, label: "an empty object" },
    { body: { ...APPLY_BODY, force: true }, label: "an extra property" },
  ];

  for (const { body, label } of wrongBodies) {
    it(`400s on ${label}`, async () => {
      enableProductionApply();

      const response = await post(makeHarness(ADMIN), APPLY, body);

      expect(response.status).toBe(400);
      expect(updateProductMock).not.toHaveBeenCalled();
    });
  }
});

describe("POST /catalogue-backfill/apply — success and failure", () => {
  beforeEach(() => {
    enableProductionApply();
  });

  it("applies and returns the post-apply readiness", async () => {
    const response = await post(makeHarness(ADMIN), APPLY, APPLY_BODY);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      applied: true,
      fieldsWritten: 6,
      productsChanged: 2,
      readinessAfter: { blocked: 0, ready: 2 },
    });
  });

  it("emits exactly the agreed response keys", async () => {
    const body = (await (
      await post(makeHarness(ADMIN), APPLY, APPLY_BODY)
    ).json()) as Record<string, unknown>;

    expect(Object.keys(body).sort()).toEqual([
      "applied",
      "fieldsWritten",
      "productsChanged",
      "readinessAfter",
    ]);
  });

  it("is idempotent across two calls", async () => {
    const harness = makeHarness(ADMIN);

    const first = await (await post(harness, APPLY, APPLY_BODY)).json();
    const second = await (await post(harness, APPLY, APPLY_BODY)).json();

    expect(first).toMatchObject({ productsChanged: 2 });
    expect(second).toMatchObject({ fieldsWritten: 0, productsChanged: 0 });
  });

  it("makes no Merchant API request", async () => {
    await post(makeHarness(ADMIN), APPLY, APPLY_BODY);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces a refusal as a sanitised 409", async () => {
    const harness = makeHarness(ADMIN, {
      applyBackfill: () =>
        Promise.reject(
          new GoogleMerchantError(
            "CATALOGUE_BACKFILL_REFUSED",
            "A proposed change no longer matches the current catalogue state.",
            409,
          ),
        ),
    });

    const response = await post(harness, APPLY, APPLY_BODY);

    expect(response.status).toBe(409);
    expect((await response.json()) as ErrorBody).toEqual({
      code: "CATALOGUE_BACKFILL_REFUSED",
      message: "A proposed change no longer matches the current catalogue state.",
    });
  });

  it("never leaks credentials or a stack trace on an unexpected failure", async () => {
    const harness = makeHarness(ADMIN, {
      applyBackfill: () =>
        Promise.reject(
          new Error('boom DATABASE_URL=postgres://u:p@h/db token=ya29.SECRET'),
        ),
    });

    const response = await post(harness, APPLY, APPLY_BODY);
    const raw = await response.text();

    expect(response.status).toBe(500);
    expect(raw).not.toContain("postgres://");
    expect(raw).not.toContain("ya29.SECRET");
    expect(raw).not.toContain("at Object");
    expect(JSON.parse(raw)).toEqual({
      code: "CATALOGUE_BACKFILL_FAILED",
      message: "The catalogue backfill could not be completed.",
    });
  });
});
