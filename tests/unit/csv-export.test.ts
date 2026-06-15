/**
 * P4-06: tests/unit/csv-export.test.ts
 *
 * Proves the CSV export route returns per-type attribute columns,
 * tag names, and collection membership for exported products.
 *
 * Mutation proofs:
 *   - Removing attributes from the export fails a test
 *   - Removing tags from the export fails a test
 *   - Removing collection from the export fails a test
 *   - Selection-based export (productIds param) only includes selected rows
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const listProductsMock = vi.hoisted(() => vi.fn());
const getProductsByIdsMock = vi.hoisted(() => vi.fn());

vi.mock("@/db/queries/products", () => ({
  listProducts: listProductsMock,
  getProductsByIds: getProductsByIdsMock,
  // Other products functions that may be imported but not needed for export tests
  updateProductsBatch: vi.fn(),
  bulkSetProductTags: vi.fn(),
  getProduct: vi.fn(),
  createProduct: vi.fn(),
  deleteProduct: vi.fn(),
  duplicateProduct: vi.fn(),
  updateProduct: vi.fn(),
  getProductBySlug: vi.fn(),
  deriveQuantityAvailable: vi.fn(),
}));

vi.mock("@/db/queries/collections", () => ({
  bulkAddProductsToCollection: vi.fn(),
  bulkRemoveProductsFromCollection: vi.fn(),
}));

vi.mock("@/lib/ai/embeddings", () => ({
  refreshProductEmbedding: vi.fn(),
}));

vi.mock("@/lib/ai/recommendations", () => ({
  recommendProducts: vi.fn(),
}));

vi.mock("@/lib/ai/tag-suggestions", () => ({
  suggestTagIds: vi.fn(),
}));

vi.mock("@/lib/config/flags", () => ({
  isInventoryV2: vi.fn().mockReturnValue(false),
}));

import { registerProductRoutes } from "@/api/hono/routes/products";
import { createRouteHarness } from "../helpers/route-harness";

const ADMIN_USER = { id: "admin-1", email: "admin@example.com", role: "admin" as const };

const PRODUCT_WITH_ATTRS = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  name: "Silk Saree",
  slug: "silk-saree",
  status: "published" as const,
  stockStatus: "available" as const,
  pricePaise: 75000,
  originalPricePaise: null,
  featured: false,
  storyTitle: "Story of Silk",
  storyNarrative: null,
  storyProvenance: null,
  storyEra: null,
  detailsFabric: null,
  detailsLength: null,
  detailsWidth: null,
  detailsCondition: null,
  detailsDesigner: null,
  typeId: "type-uuid-1111",
  attributes: { fabric: "Silk", condition: "excellent", length: "5.5m" },
  collectionId: "col-uuid-1111",
  artisanId: null,
  reservedUntil: null,
  soldAt: null,
  quantityAvailable: 1,
  metadata: null,
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
  collection: {
    id: "col-uuid-1111",
    name: "Heritage Collection",
    slug: "heritage-collection",
    description: null,
    featured: false,
    heroMediaId: null,
    rules: null,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
  },
  images: [],
  tags: [
    { id: 1, name: "Silk", slug: "silk", category: "fabric", createdAt: new Date("2024-01-01"), updatedAt: new Date("2024-01-01") },
    { id: 2, name: "Vintage", slug: "vintage", category: "era", createdAt: new Date("2024-01-01"), updatedAt: new Date("2024-01-01") },
  ],
};

const PRODUCT_NO_ATTRS = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  name: "Plain Saree",
  slug: "plain-saree",
  status: "draft" as const,
  stockStatus: "available" as const,
  pricePaise: 30000,
  originalPricePaise: null,
  featured: false,
  storyTitle: "Simple Story",
  storyNarrative: null,
  storyProvenance: null,
  storyEra: null,
  detailsFabric: null,
  detailsLength: null,
  detailsWidth: null,
  detailsCondition: null,
  detailsDesigner: null,
  typeId: null,
  attributes: {},
  collectionId: null,
  artisanId: null,
  reservedUntil: null,
  soldAt: null,
  quantityAvailable: 1,
  metadata: null,
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
  collection: null,
  images: [],
  tags: [],
};

const PRODUCT_WITH_MULTISELECT = {
  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  name: "Multi Saree",
  slug: "multi-saree",
  status: "published" as const,
  stockStatus: "available" as const,
  pricePaise: 50000,
  originalPricePaise: null,
  featured: false,
  storyTitle: null,
  storyNarrative: null,
  storyProvenance: null,
  storyEra: null,
  detailsFabric: null,
  detailsLength: null,
  detailsWidth: null,
  detailsCondition: null,
  detailsDesigner: null,
  typeId: "type-uuid-2222",
  // multi-select attribute: array value must be exported as "red|blue|green"
  attributes: { colors: ["red", "blue", "green"], material: "Cotton" },
  collectionId: null,
  artisanId: null,
  reservedUntil: null,
  soldAt: null,
  quantityAvailable: 1,
  metadata: null,
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
  collection: null,
  images: [],
  tags: [],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /products/export.csv — full export with attributes + tags + collections", () => {
  beforeEach(() => {
    listProductsMock.mockReset();
    getProductsByIdsMock.mockReset();
  });

  it("includes per-type attribute columns in the exported CSV (mutation proof: removing attributes breaks this test)", async () => {
    listProductsMock.mockResolvedValue({
      rows: [PRODUCT_WITH_ATTRS],
      totalCount: 1,
    });

    const { request } = createRouteHarness({
      register: registerProductRoutes,
      authUser: ADMIN_USER,
    });

    const res = await request("/export.csv");
    expect(res.status).toBe(200);

    const csv = await res.text();

    // MUTATION PROOF: attributes must appear in the CSV
    // The attributes column or individual attribute columns must be present
    expect(csv).toMatch(/attribute|fabric|condition/i);
    // The actual attribute VALUES must be in the CSV
    expect(csv).toContain("Silk");
    expect(csv).toContain("excellent");
  });

  it("includes tag names in the exported CSV (mutation proof: removing tags breaks this test)", async () => {
    listProductsMock.mockResolvedValue({
      rows: [PRODUCT_WITH_ATTRS],
      totalCount: 1,
    });

    const { request } = createRouteHarness({
      register: registerProductRoutes,
      authUser: ADMIN_USER,
    });

    const res = await request("/export.csv");
    expect(res.status).toBe(200);

    const csv = await res.text();

    // MUTATION PROOF: tag names must appear in the CSV
    expect(csv).toContain("Silk");
    expect(csv).toContain("Vintage");
    // The CSV should have a tags column header
    expect(csv.split("\n")[0]).toMatch(/tags/i);
  });

  it("includes collection membership in the exported CSV (mutation proof: removing collection breaks this test)", async () => {
    listProductsMock.mockResolvedValue({
      rows: [PRODUCT_WITH_ATTRS],
      totalCount: 1,
    });

    const { request } = createRouteHarness({
      register: registerProductRoutes,
      authUser: ADMIN_USER,
    });

    const res = await request("/export.csv");
    expect(res.status).toBe(200);

    const csv = await res.text();

    // MUTATION PROOF: collection name/slug must appear in the CSV
    expect(csv).toContain("Heritage Collection");
    // The CSV should have a collection column header
    expect(csv.split("\n")[0]).toMatch(/collection/i);
  });

  it("responds with Content-Type text/csv", async () => {
    listProductsMock.mockResolvedValue({ rows: [], totalCount: 0 });

    const { request } = createRouteHarness({
      register: registerProductRoutes,
      authUser: ADMIN_USER,
    });

    const res = await request("/export.csv");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/csv/);
  });

  it("rejects non-admin users with 403", async () => {
    const { request } = createRouteHarness({
      register: registerProductRoutes,
      authUser: { id: "cust-1", email: "cust@example.com", role: "customer" as const },
    });

    const res = await request("/export.csv");
    expect(res.status).toBe(403);
    expect(listProductsMock).not.toHaveBeenCalled();
  });
});

describe("GET /products/export.csv — selection export (productIds)", () => {
  beforeEach(() => {
    listProductsMock.mockReset();
    getProductsByIdsMock.mockReset();
  });

  it("exports only selected products when productIds param is provided", async () => {
    getProductsByIdsMock.mockResolvedValue([PRODUCT_WITH_ATTRS]);

    const { request } = createRouteHarness({
      register: registerProductRoutes,
      authUser: ADMIN_USER,
    });

    const id = PRODUCT_WITH_ATTRS.id;
    const res = await request(`/export.csv?productIds=${id}`);
    expect(res.status).toBe(200);

    const csv = await res.text();
    expect(csv).toContain("Silk Saree");
    // Plain Saree should NOT be in this CSV since it wasn't in the selection
    expect(csv).not.toContain("Plain Saree");

    // getProductsByIds must be called (not listProducts) when productIds provided
    expect(getProductsByIdsMock).toHaveBeenCalledTimes(1);
    expect(listProductsMock).not.toHaveBeenCalled();
  });
});

describe("GET /products/export.csv — multi-select attribute pipe-join (round-trip with import)", () => {
  beforeEach(() => {
    listProductsMock.mockReset();
    getProductsByIdsMock.mockReset();
  });

  it("serializes array-valued attributes as pipe-joined strings so import can split on | (mutation proof: comma-join or no-join fails this)", async () => {
    listProductsMock.mockResolvedValue({
      rows: [PRODUCT_WITH_MULTISELECT],
      totalCount: 1,
    });

    const { request } = createRouteHarness({
      register: registerProductRoutes,
      authUser: ADMIN_USER,
    });

    const res = await request("/export.csv");
    expect(res.status).toBe(200);

    const csv = await res.text();

    // The multi-select "colors" attribute must be exported as "red|blue|green".
    // MUTATION PROOF: if Array.isArray check is missing and String(array) is used,
    // the cell becomes "red,blue,green" (JS default), which FAILS toContain("red|blue|green").
    // A comma-join would also fail — the separator MUST be the pipe character.
    expect(csv).toContain("red|blue|green");

    // The non-array attribute must still export normally
    expect(csv).toContain("Cotton");

    // Confirm the header row lists the attribute column
    const header = csv.split("\n")[0] ?? "";
    expect(header).toMatch(/attr_colors/i);
  });
});
