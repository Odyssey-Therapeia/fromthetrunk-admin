/**
 * P4-06: tests/unit/bulk-import-coercion.test.ts
 *
 * Proves that the admin import /execute route coerces CSV string values
 * to the correct JS types (number, boolean, array) BEFORE running
 * buildTypeZodSchema validation and persisting.
 *
 * Mutation proofs:
 *   - A valid CSV row with threadCount=200, handwoven=true PERSISTS (createProduct called)
 *     because number/boolean strings are coerced before schema validation.
 *     Without coercion, schema validation would fail (z.number() rejects strings).
 *   - A row with threadCount=abc (non-numeric) is REJECTED with the field name in the error.
 *   - A row with a multi-select attribute using "|" separator is coerced to an array.
 *   - A boolean attribute with value "yes" or "1" is coerced to true.
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

import { registerAdminImportRoutes } from "@/api/hono/routes/admin-import";
import { createRouteHarness } from "../helpers/route-harness";

const ADMIN_USER = { id: "admin-1", email: "admin@example.com", role: "admin" as const };

// A product type with number, boolean, and multi-select attributes
const TYPE_WITH_NUMERIC_BOOL = {
  id: "type-numeric-bool",
  slug: "weave-type",
  name: "Weave Type",
  attributeDefs: [
    {
      key: "threadCount",
      meta: { type: "number", label: "Thread Count" },
      required: true,
    },
    {
      key: "handwoven",
      meta: { type: "boolean", label: "Handwoven" },
      required: true,
    },
    {
      key: "colors",
      meta: { type: "multi-select", label: "Colors", options: [
        { label: "Red", value: "red" },
        { label: "Blue", value: "blue" },
        { label: "Gold", value: "gold" },
      ]},
      required: false,
    },
  ],
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
};

const GOOD_PRODUCT = {
  id: "prod-coerce-1",
  name: "Test Weave",
  slug: "test-weave",
  status: "draft" as const,
  stockStatus: "available" as const,
  pricePaise: 50000,
  storyTitle: "Test Story",
  typeId: TYPE_WITH_NUMERIC_BOOL.id,
  attributes: { threadCount: 200, handwoven: true, colors: ["red", "gold"] },
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

const MAPPINGS_COERCE = [
  { csvColumn: "name", dbField: "name", confidence: 1, status: "mapped" as const },
  { csvColumn: "storyTitle", dbField: "storyTitle", confidence: 1, status: "mapped" as const },
  { csvColumn: "pricePaise", dbField: "pricePaise", confidence: 1, status: "mapped" as const },
  { csvColumn: "typeId", dbField: "typeId", confidence: 1, status: "mapped" as const },
  { csvColumn: "attr_threadCount", dbField: "attributes_threadCount", confidence: 1, status: "mapped" as const },
  { csvColumn: "attr_handwoven", dbField: "attributes_handwoven", confidence: 1, status: "mapped" as const },
  { csvColumn: "attr_colors", dbField: "attributes_colors", confidence: 1, status: "mapped" as const },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const parseAndExecute = async (csvText: string) => {
  const { request } = createRouteHarness({
    register: registerAdminImportRoutes,
    authUser: ADMIN_USER,
  });

  const csvBlob = new Blob([csvText], { type: "text/csv" });
  const formData = new FormData();
  formData.append("file", new File([csvBlob], "test.csv"));
  const parseRes = await request("/parse", { method: "POST", body: formData });
  expect(parseRes.status).toBe(200);
  const { fileId } = (await parseRes.json()) as { fileId: string };

  const execRes = await request("/execute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileId, mappings: MAPPINGS_COERCE }),
  });

  expect(execRes.status).toBe(200);
  return (await execRes.json()) as {
    total: number;
    created: number;
    failed: number;
    errors: Array<{ row: number; message: string; field?: string }>;
  };
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /admin/import/execute — CSV string coercion (P4-06)", () => {
  beforeEach(() => {
    createProductMock.mockReset();
    getProductTypeByIdMock.mockReset();
  });

  it("coerces threadCount='200' (string) to number 200 and persists successfully (mutation proof: createProduct IS called)", async () => {
    getProductTypeByIdMock.mockResolvedValue(TYPE_WITH_NUMERIC_BOOL);
    createProductMock.mockResolvedValue(GOOD_PRODUCT);

    const csv = `name,storyTitle,pricePaise,typeId,attr_threadCount,attr_handwoven,attr_colors
Test Weave,Test Story,50000,type-numeric-bool,200,true,red|gold`;

    const result = await parseAndExecute(csv);

    // MUTATION PROOF: without coercion, z.number() rejects the string "200" → failed=1
    // With coercion, it passes → created=1
    expect(result.created).toBe(1);
    expect(result.failed).toBe(0);
    expect(createProductMock).toHaveBeenCalledTimes(1);

    const createArg = createProductMock.mock.calls[0]![0] as {
      typeId: string;
      attributes: Record<string, unknown>;
    };
    expect(createArg.typeId).toBe(TYPE_WITH_NUMERIC_BOOL.id);
    // threadCount must be a number (coerced from string "200")
    expect(typeof createArg.attributes.threadCount).toBe("number");
    expect(createArg.attributes.threadCount).toBe(200);
    // handwoven must be boolean true
    expect(createArg.attributes.handwoven).toBe(true);
    // colors must be an array (coerced from "red|gold")
    expect(Array.isArray(createArg.attributes.colors)).toBe(true);
    expect(createArg.attributes.colors).toContain("red");
    expect(createArg.attributes.colors).toContain("gold");
  });

  it("rejects row with non-numeric threadCount='abc' and includes field name in error (mutation proof)", async () => {
    getProductTypeByIdMock.mockResolvedValue(TYPE_WITH_NUMERIC_BOOL);
    createProductMock.mockResolvedValue(GOOD_PRODUCT);

    const csv = `name,storyTitle,pricePaise,typeId,attr_threadCount,attr_handwoven,attr_colors
Bad Weave,Bad Story,50000,type-numeric-bool,abc,true,red`;

    const result = await parseAndExecute(csv);

    // MUTATION PROOF: "abc" cannot be coerced to a number → row is rejected
    expect(result.failed).toBe(1);
    expect(result.created).toBe(0);
    expect(createProductMock).not.toHaveBeenCalled();

    // Error must mention the field name
    const err = result.errors[0];
    expect(err).toBeTruthy();
    expect(err!.message).toMatch(/threadCount/i);
  });

  it("coerces handwoven='yes' to boolean true", async () => {
    getProductTypeByIdMock.mockResolvedValue(TYPE_WITH_NUMERIC_BOOL);
    createProductMock.mockResolvedValue(GOOD_PRODUCT);

    const csv = `name,storyTitle,pricePaise,typeId,attr_threadCount,attr_handwoven,attr_colors
Yes Weave,Story,50000,type-numeric-bool,100,yes,blue`;

    const result = await parseAndExecute(csv);

    expect(result.created).toBe(1);
    expect(result.failed).toBe(0);

    const createArg = createProductMock.mock.calls[0]![0] as {
      attributes: Record<string, unknown>;
    };
    expect(createArg.attributes.handwoven).toBe(true);
  });

  it("coerces handwoven='1' to boolean true", async () => {
    getProductTypeByIdMock.mockResolvedValue(TYPE_WITH_NUMERIC_BOOL);
    createProductMock.mockResolvedValue(GOOD_PRODUCT);

    const csv = `name,storyTitle,pricePaise,typeId,attr_threadCount,attr_handwoven,attr_colors
One Weave,Story,50000,type-numeric-bool,150,1,blue`;

    const result = await parseAndExecute(csv);

    expect(result.created).toBe(1);
    const createArg = createProductMock.mock.calls[0]![0] as {
      attributes: Record<string, unknown>;
    };
    expect(createArg.attributes.handwoven).toBe(true);
  });

  it("coerces handwoven='false' to boolean false", async () => {
    getProductTypeByIdMock.mockResolvedValue(TYPE_WITH_NUMERIC_BOOL);
    createProductMock.mockResolvedValue(GOOD_PRODUCT);

    const csv = `name,storyTitle,pricePaise,typeId,attr_threadCount,attr_handwoven,attr_colors
False Weave,Story,50000,type-numeric-bool,300,false,blue`;

    const result = await parseAndExecute(csv);

    // handwoven is required boolean — false is a valid boolean value
    expect(result.created).toBe(1);
    const createArg = createProductMock.mock.calls[0]![0] as {
      attributes: Record<string, unknown>;
    };
    expect(createArg.attributes.handwoven).toBe(false);
  });
});
