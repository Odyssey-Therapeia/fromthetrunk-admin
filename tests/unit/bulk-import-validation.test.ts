/**
 * P4-06: tests/unit/bulk-import-validation.test.ts
 *
 * Proves that the admin import /execute route REJECTS rows whose attributes
 * are INVALID for their declared product type, using buildTypeZodSchema.
 *
 * Mutation proof: the test asserts on the createProduct mock — it MUST NOT
 * be called for an invalid row. If buildTypeZodSchema validation is removed
 * from the route, the mock WILL be called and the test will fail.
 *
 * Covers:
 *   - Invalid attribute row is rejected with row number + field in the error
 *   - Valid row (matching type schema) persists type_id + attributes
 *   - Type not found → row rejected with clear error (no DB create)
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const createProductMock = vi.hoisted(() => vi.fn());
const getProductTypeByIdMock = vi.hoisted(() => vi.fn());
const slugifyMock = vi.hoisted(() => vi.fn((s: string) => s.toLowerCase().replace(/\s+/g, "-")));

vi.mock("@/db/queries/products", () => ({
  createProduct: createProductMock,
}));

vi.mock("@/db/queries/product-types", () => ({
  getProductTypeById: getProductTypeByIdMock,
}));

vi.mock("@/lib/utils", () => ({
  slugify: slugifyMock,
}));

// We need to mock the file cache by injecting a known fileId via /parse first,
// but the cache is in-module — so we test via the route harness hitting /execute
// with a pre-populated cache mock strategy. Since the cache is in-memory and
// module-local, we spin up the full route for /execute and inject via /parse.

import { registerAdminImportRoutes } from "@/api/hono/routes/admin-import";
import { createRouteHarness } from "../helpers/route-harness";

const ADMIN_USER = { id: "admin-1", email: "admin@example.com", role: "admin" as const };

// A product type with a required "fabric" text attribute and an optional "condition" select
const TYPE_WITH_SCHEMA = {
  id: "type-uuid-1111",
  slug: "preloved-saree",
  name: "Preloved Saree",
  attributeDefs: [
    {
      key: "fabric",
      meta: { type: "text", label: "Fabric" },
      required: true,
    },
    {
      key: "condition",
      meta: {
        type: "select",
        label: "Condition",
        options: [
          { label: "Excellent", value: "excellent" },
          { label: "Good", value: "good" },
        ],
      },
      required: false,
    },
  ],
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
};

const GOOD_PRODUCT = {
  id: "prod-good-1",
  name: "Test Saree",
  slug: "test-saree",
  status: "draft" as const,
  stockStatus: "available" as const,
  pricePaise: 50000,
  storyTitle: "Test Story",
  typeId: TYPE_WITH_SCHEMA.id,
  attributes: { fabric: "Silk", condition: "excellent" },
  collection: null,
  images: [],
  tags: [],
  featured: false,
  collectionId: null,
  artisanId: null,
  originalPricePaise: null,
  reservedUntil: null,
  soldAt: null,
  quantityAvailable: 1,
  storyNarrative: null,
  storyProvenance: null,
  storyEra: null,
  detailsFabric: null,
  detailsLength: null,
  detailsWidth: null,
  detailsCondition: null,
  detailsDesigner: null,
  metadata: null,
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
};

// CSV text with two rows: one valid, one with bad condition value
const VALID_CSV = `name,storyTitle,pricePaise,typeId,attributes_fabric,attributes_condition
Test Saree,Test Story,50000,type-uuid-1111,Silk,excellent
Bad Saree,Bad Story,50000,type-uuid-1111,,invalid_condition`;

const MAPPINGS = [
  { csvColumn: "name", dbField: "name", confidence: 1, status: "mapped" as const },
  { csvColumn: "storyTitle", dbField: "storyTitle", confidence: 1, status: "mapped" as const },
  { csvColumn: "pricePaise", dbField: "pricePaise", confidence: 1, status: "mapped" as const },
  { csvColumn: "typeId", dbField: "typeId", confidence: 1, status: "mapped" as const },
  { csvColumn: "attributes_fabric", dbField: "attributes_fabric", confidence: 1, status: "mapped" as const },
  { csvColumn: "attributes_condition", dbField: "attributes_condition", confidence: 1, status: "mapped" as const },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /admin/import/execute — type-aware attribute validation", () => {
  beforeEach(() => {
    createProductMock.mockReset();
    getProductTypeByIdMock.mockReset();
  });

  it("rejects a row whose attributes are INVALID for its declared type (mutation proof: createProduct NOT called for bad row)", async () => {
    // Row 0: valid — fabric="Silk", condition="excellent"
    // Row 1: invalid — fabric="" (required!), condition="invalid_condition" (not in enum)
    getProductTypeByIdMock.mockResolvedValue(TYPE_WITH_SCHEMA);
    createProductMock.mockResolvedValue(GOOD_PRODUCT);

    const { request } = createRouteHarness({
      register: registerAdminImportRoutes,
      authUser: ADMIN_USER,
    });

    // First, parse the CSV to get a fileId
    const csvBlob = new Blob([VALID_CSV], { type: "text/csv" });
    const formData = new FormData();
    formData.append("file", new File([csvBlob], "test.csv"));

    const parseRes = await request("/parse", {
      method: "POST",
      body: formData,
    });
    expect(parseRes.status).toBe(200);
    const { fileId } = (await parseRes.json()) as { fileId: string };
    expect(fileId).toBeTruthy();

    // Execute import
    const execRes = await request("/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileId, mappings: MAPPINGS }),
    });

    expect(execRes.status).toBe(200);
    const result = (await execRes.json()) as {
      total: number;
      created: number;
      failed: number;
      errors: Array<{ row: number; message: string; field?: string }>;
    };

    // Row 1 (index 1) must be REJECTED — fabric is required but empty
    expect(result.failed).toBeGreaterThanOrEqual(1);
    const failedRows = result.errors.map((e) => e.row);
    expect(failedRows).toContain(1);

    // The error for row 1 must mention which attribute failed
    const row1Error = result.errors.find((e) => e.row === 1);
    expect(row1Error).toBeTruthy();
    expect(row1Error!.message).toMatch(/fabric|attribute/i);

    // Row 0 (valid) should have been created — createProduct called at least once
    expect(createProductMock).toHaveBeenCalledTimes(1);

    // MUTATION PROOF: createProduct called only ONCE (for row 0), NOT for row 1
    // If validation is removed, createProduct would be called twice
    const callArgs = createProductMock.mock.calls[0]![0] as { name: string };
    expect(callArgs.name).toBe("Test Saree");
  });

  it("persists type_id and attributes on a valid row", async () => {
    getProductTypeByIdMock.mockResolvedValue(TYPE_WITH_SCHEMA);
    createProductMock.mockResolvedValue(GOOD_PRODUCT);

    const { request } = createRouteHarness({
      register: registerAdminImportRoutes,
      authUser: ADMIN_USER,
    });

    const oneGoodRow = `name,storyTitle,pricePaise,typeId,attributes_fabric,attributes_condition
Test Saree,Test Story,50000,type-uuid-1111,Silk,excellent`;

    const csvBlob = new Blob([oneGoodRow], { type: "text/csv" });
    const formData = new FormData();
    formData.append("file", new File([csvBlob], "test.csv"));
    const parseRes = await request("/parse", { method: "POST", body: formData });
    const { fileId } = (await parseRes.json()) as { fileId: string };

    const execRes = await request("/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileId, mappings: MAPPINGS }),
    });

    expect(execRes.status).toBe(200);
    const result = (await execRes.json()) as { created: number; failed: number };
    expect(result.created).toBe(1);
    expect(result.failed).toBe(0);

    // Verify createProduct was called with typeId and attributes
    expect(createProductMock).toHaveBeenCalledTimes(1);
    const createArg = createProductMock.mock.calls[0]![0] as {
      typeId: string;
      attributes: Record<string, unknown>;
    };
    expect(createArg.typeId).toBe(TYPE_WITH_SCHEMA.id);
    expect(createArg.attributes).toMatchObject({ fabric: "Silk", condition: "excellent" });
  });

  it("rejects row when typeId references a non-existent type (no createProduct called)", async () => {
    getProductTypeByIdMock.mockResolvedValue(null); // type not found

    const { request } = createRouteHarness({
      register: registerAdminImportRoutes,
      authUser: ADMIN_USER,
    });

    const csv = `name,storyTitle,pricePaise,typeId
Test,Story,50000,nonexistent-type-id`;

    const csvBlob = new Blob([csv], { type: "text/csv" });
    const formData = new FormData();
    formData.append("file", new File([csvBlob], "test.csv"));
    const parseRes = await request("/parse", { method: "POST", body: formData });
    const { fileId } = (await parseRes.json()) as { fileId: string };

    const mappings = [
      { csvColumn: "name", dbField: "name", confidence: 1, status: "mapped" as const },
      { csvColumn: "storyTitle", dbField: "storyTitle", confidence: 1, status: "mapped" as const },
      { csvColumn: "pricePaise", dbField: "pricePaise", confidence: 1, status: "mapped" as const },
      { csvColumn: "typeId", dbField: "typeId", confidence: 1, status: "mapped" as const },
    ];

    const execRes = await request("/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileId, mappings }),
    });

    expect(execRes.status).toBe(200);
    const result = (await execRes.json()) as {
      failed: number;
      errors: Array<{ row: number; message: string }>;
    };

    // Row should be rejected because the type doesn't exist
    expect(result.failed).toBe(1);
    const err = result.errors[0];
    expect(err!.message).toMatch(/type|not found/i);

    // createProduct must NOT have been called
    expect(createProductMock).not.toHaveBeenCalled();
  });
});
