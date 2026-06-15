/**
 * P4-06: tests/unit/bulk-edit-routes.test.ts
 *
 * Proves that the bulk-edit route (POST /products/bulk-edit) persists changes
 * for ALL selected products via real DB join helpers.
 *
 * Mutation proofs:
 *   - Status: updateProductsBatch called with ALL N product IDs (not a subset)
 *   - Collections: bulkAddProductsToCollection / bulkRemoveProductsFromCollection
 *     called with ALL N product IDs
 *   - Tags: bulkSetProductTags called for ALL N products when addTagIds provided
 *   - Partial failures: reported, not swallowed
 *   - Non-admin: 403
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const updateProductsBatchMock = vi.hoisted(() => vi.fn());
const bulkAddProductsToCollectionMock = vi.hoisted(() => vi.fn());
const bulkRemoveProductsFromCollectionMock = vi.hoisted(() => vi.fn());
const bulkSetProductTagsMock = vi.hoisted(() => vi.fn());

vi.mock("@/db/queries/products", () => ({
  updateProductsBatch: updateProductsBatchMock,
  bulkSetProductTags: bulkSetProductTagsMock,
  // Route also uses these — provide stubs so module loads without DB connection
  getProduct: vi.fn(),
  createProduct: vi.fn(),
  deleteProduct: vi.fn(),
  duplicateProduct: vi.fn(),
  updateProduct: vi.fn(),
  getProductBySlug: vi.fn(),
  getProductsByIds: vi.fn(),
  listProducts: vi.fn(),
  deriveQuantityAvailable: vi.fn(),
}));

vi.mock("@/db/queries/collections", () => ({
  bulkAddProductsToCollection: bulkAddProductsToCollectionMock,
  bulkRemoveProductsFromCollection: bulkRemoveProductsFromCollectionMock,
}));

// Prevent the AI/embedding modules from trying to connect to the DB
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
const CUSTOMER_USER = { id: "cust-1", email: "cust@example.com", role: "customer" as const };

const PRODUCT_IDS = [
  "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
];

const COLLECTION_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /products/bulk-edit — status update", () => {
  beforeEach(() => {
    updateProductsBatchMock.mockReset();
    bulkAddProductsToCollectionMock.mockReset();
    bulkRemoveProductsFromCollectionMock.mockReset();
    bulkSetProductTagsMock.mockReset();
  });

  it("updates status for ALL N selected products (mutation proof: updateProductsBatch called with all IDs)", async () => {
    updateProductsBatchMock.mockResolvedValue({ updated: 3, failed: 0, errors: [] });

    const { request } = createRouteHarness({
      register: registerProductRoutes,
      authUser: ADMIN_USER,
    });

    const res = await request("/bulk-edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productIds: PRODUCT_IDS,
        status: "published",
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { updated: number; failed: number };
    expect(body.updated).toBe(3);
    expect(body.failed).toBe(0);

    // MUTATION PROOF: updateProductsBatch must be called with ALL 3 product IDs
    expect(updateProductsBatchMock).toHaveBeenCalledTimes(1);
    const callArg = updateProductsBatchMock.mock.calls[0]![0] as string[];
    expect(callArg).toHaveLength(3);
    expect(callArg).toContain(PRODUCT_IDS[0]);
    expect(callArg).toContain(PRODUCT_IDS[1]);
    expect(callArg).toContain(PRODUCT_IDS[2]);
  });

  it("rejects non-admin users with 403", async () => {
    const { request } = createRouteHarness({
      register: registerProductRoutes,
      authUser: CUSTOMER_USER,
    });

    const res = await request("/bulk-edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productIds: PRODUCT_IDS,
        status: "published",
      }),
    });

    expect(res.status).toBe(403);
    expect(updateProductsBatchMock).not.toHaveBeenCalled();
  });

  it("validates status enum — rejects unknown status value", async () => {
    const { request } = createRouteHarness({
      register: registerProductRoutes,
      authUser: ADMIN_USER,
    });

    const res = await request("/bulk-edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productIds: PRODUCT_IDS,
        status: "archived", // not in enum (real enum: draft|published)
      }),
    });

    // Must be rejected at the validation layer
    expect(res.status).toBe(400);
    expect(updateProductsBatchMock).not.toHaveBeenCalled();
  });

  it("validates productIds is non-empty", async () => {
    const { request } = createRouteHarness({
      register: registerProductRoutes,
      authUser: ADMIN_USER,
    });

    const res = await request("/bulk-edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productIds: [],
        status: "published",
      }),
    });

    expect(res.status).toBe(400);
    expect(updateProductsBatchMock).not.toHaveBeenCalled();
  });
});

describe("POST /products/bulk-edit — collection membership", () => {
  beforeEach(() => {
    updateProductsBatchMock.mockReset();
    bulkAddProductsToCollectionMock.mockReset();
    bulkRemoveProductsFromCollectionMock.mockReset();
    bulkSetProductTagsMock.mockReset();
  });

  it("adds ALL N products to a collection (mutation proof: bulkAddProductsToCollection called with all IDs)", async () => {
    bulkAddProductsToCollectionMock.mockResolvedValue({ updated: 3, failed: 0, errors: [] });

    const { request } = createRouteHarness({
      register: registerProductRoutes,
      authUser: ADMIN_USER,
    });

    const res = await request("/bulk-edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productIds: PRODUCT_IDS,
        addCollectionId: COLLECTION_ID,
      }),
    });

    expect(res.status).toBe(200);

    // MUTATION PROOF: bulkAddProductsToCollection called with ALL 3 IDs
    expect(bulkAddProductsToCollectionMock).toHaveBeenCalledTimes(1);
    const [collectionArg, idsArg] = bulkAddProductsToCollectionMock.mock.calls[0] as [string, string[]];
    expect(collectionArg).toBe(COLLECTION_ID);
    expect(idsArg).toHaveLength(3);
    expect(idsArg).toContain(PRODUCT_IDS[0]);
    expect(idsArg).toContain(PRODUCT_IDS[1]);
    expect(idsArg).toContain(PRODUCT_IDS[2]);
  });

  it("removes ALL N products from a collection", async () => {
    bulkRemoveProductsFromCollectionMock.mockResolvedValue({ updated: 3, failed: 0, errors: [] });

    const { request } = createRouteHarness({
      register: registerProductRoutes,
      authUser: ADMIN_USER,
    });

    const res = await request("/bulk-edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productIds: PRODUCT_IDS,
        removeCollectionId: COLLECTION_ID,
      }),
    });

    expect(res.status).toBe(200);

    // MUTATION PROOF: bulkRemoveProductsFromCollection called with ALL 3 IDs
    expect(bulkRemoveProductsFromCollectionMock).toHaveBeenCalledTimes(1);
    const [collectionArg, idsArg] = bulkRemoveProductsFromCollectionMock.mock.calls[0] as [string, string[]];
    expect(collectionArg).toBe(COLLECTION_ID);
    expect(idsArg).toHaveLength(3);
  });
});

describe("POST /products/bulk-edit — tag operations", () => {
  beforeEach(() => {
    updateProductsBatchMock.mockReset();
    bulkSetProductTagsMock.mockReset();
    bulkAddProductsToCollectionMock.mockReset();
    bulkRemoveProductsFromCollectionMock.mockReset();
  });

  it("adds tags for ALL N selected products (mutation proof: bulkSetProductTags called for all)", async () => {
    bulkSetProductTagsMock.mockResolvedValue({ updated: 3, failed: 0, errors: [] });

    const { request } = createRouteHarness({
      register: registerProductRoutes,
      authUser: ADMIN_USER,
    });

    const res = await request("/bulk-edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productIds: PRODUCT_IDS,
        addTagIds: [1, 2],
      }),
    });

    expect(res.status).toBe(200);

    // MUTATION PROOF: bulkSetProductTags called with all product IDs
    expect(bulkSetProductTagsMock).toHaveBeenCalledTimes(1);
    const [idsArg] = bulkSetProductTagsMock.mock.calls[0] as [string[], number[], number[]];
    expect(idsArg).toHaveLength(3);
    expect(idsArg).toContain(PRODUCT_IDS[0]);
    expect(idsArg).toContain(PRODUCT_IDS[1]);
    expect(idsArg).toContain(PRODUCT_IDS[2]);
  });

  it("removes tags for ALL N selected products", async () => {
    bulkSetProductTagsMock.mockResolvedValue({ updated: 3, failed: 0, errors: [] });

    const { request } = createRouteHarness({
      register: registerProductRoutes,
      authUser: ADMIN_USER,
    });

    const res = await request("/bulk-edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productIds: PRODUCT_IDS,
        removeTagIds: [3, 4],
      }),
    });

    expect(res.status).toBe(200);

    expect(bulkSetProductTagsMock).toHaveBeenCalledTimes(1);
    const [idsArg, _addIds, removeIds] = bulkSetProductTagsMock.mock.calls[0] as [string[], number[], number[]];
    expect(idsArg).toHaveLength(3);
    expect(removeIds).toContain(3);
    expect(removeIds).toContain(4);
  });
});

describe("POST /products/bulk-edit — partial failure reporting", () => {
  beforeEach(() => {
    updateProductsBatchMock.mockReset();
    bulkSetProductTagsMock.mockReset();
    bulkAddProductsToCollectionMock.mockReset();
    bulkRemoveProductsFromCollectionMock.mockReset();
  });

  it("reports partial failures from updateProductsBatch without swallowing errors", async () => {
    updateProductsBatchMock.mockResolvedValue({
      updated: 2,
      failed: 1,
      errors: [{ id: PRODUCT_IDS[2], message: "DB constraint" }],
    });

    const { request } = createRouteHarness({
      register: registerProductRoutes,
      authUser: ADMIN_USER,
    });

    const res = await request("/bulk-edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productIds: PRODUCT_IDS,
        status: "draft",
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      updated: number;
      failed: number;
      errors: unknown[];
    };

    // Partial failure must be reported, not swallowed
    expect(body.updated).toBe(2);
    expect(body.failed).toBe(1);
    expect(body.errors).toHaveLength(1);
  });
});
