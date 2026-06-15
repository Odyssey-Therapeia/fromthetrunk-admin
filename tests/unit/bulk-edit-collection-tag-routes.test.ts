/**
 * P4-06: tests/unit/bulk-edit-collection-tag-routes.test.ts
 *
 * Extends bulk-edit-routes.test.ts to specifically prove that:
 * 1. The bulk-edit route accepts addCollectionId and removeCollectionId and calls
 *    bulkAddProductsToCollection / bulkRemoveProductsFromCollection with ALL selected IDs.
 * 2. The bulk-edit route accepts addTagIds and removeTagIds and calls
 *    bulkSetProductTags with ALL selected IDs.
 * 3. A body with addCollectionId AND addTagIds runs BOTH operations in the same request.
 *
 * These tests back the consumer UI path: the products-grid page sends
 * POST /api/v2/products/bulk-edit with these exact body shapes, wired via
 * handleBulkCollectionOp and handleBulkTagOp in app/(admin)/admin/products/page.tsx.
 *
 * Mutation proofs:
 *   - If bulkAddProductsToCollection is removed from the route handler, the collection
 *     add test fails (bulkAddProductsToCollectionMock not called).
 *   - If bulkSetProductTags is removed, the tag add test fails.
 *   - If only a subset of IDs is passed (bug), the assertion on idsArg.length fails.
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

// Simulate the UI sending N selected product IDs (proves ALL N are forwarded)
const SELECTED_IDS = [
  "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
];

const COLLECTION_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /products/bulk-edit — collection controls (UI consumer path)", () => {
  beforeEach(() => {
    updateProductsBatchMock.mockReset();
    bulkAddProductsToCollectionMock.mockReset();
    bulkRemoveProductsFromCollectionMock.mockReset();
    bulkSetProductTagsMock.mockReset();
  });

  it("addCollectionId: calls bulkAddProductsToCollection with ALL selected IDs (mutation proof)", async () => {
    // This is exactly the body that handleBulkCollectionOp("add") sends from the UI
    bulkAddProductsToCollectionMock.mockResolvedValue({ updated: 3, failed: 0, errors: [] });

    const { request } = createRouteHarness({
      register: registerProductRoutes,
      authUser: ADMIN_USER,
    });

    const res = await request("/bulk-edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productIds: SELECTED_IDS,
        addCollectionId: COLLECTION_ID,
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { updated: number; failed: number };
    expect(body.updated).toBe(3);
    expect(body.failed).toBe(0);

    // MUTATION PROOF: bulkAddProductsToCollection must be called with all 3 IDs
    expect(bulkAddProductsToCollectionMock).toHaveBeenCalledTimes(1);
    const [collectionArg, idsArg] = bulkAddProductsToCollectionMock.mock.calls[0] as [string, string[]];
    expect(collectionArg).toBe(COLLECTION_ID);
    // If the route only forwarded a subset, this would fail
    expect(idsArg).toHaveLength(SELECTED_IDS.length);
    expect(idsArg).toContain(SELECTED_IDS[0]);
    expect(idsArg).toContain(SELECTED_IDS[1]);
    expect(idsArg).toContain(SELECTED_IDS[2]);
  });

  it("removeCollectionId: calls bulkRemoveProductsFromCollection with ALL selected IDs", async () => {
    // This is exactly the body that handleBulkCollectionOp("remove") sends from the UI
    bulkRemoveProductsFromCollectionMock.mockResolvedValue({ updated: 3, failed: 0, errors: [] });

    const { request } = createRouteHarness({
      register: registerProductRoutes,
      authUser: ADMIN_USER,
    });

    const res = await request("/bulk-edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productIds: SELECTED_IDS,
        removeCollectionId: COLLECTION_ID,
      }),
    });

    expect(res.status).toBe(200);

    expect(bulkRemoveProductsFromCollectionMock).toHaveBeenCalledTimes(1);
    const [collectionArg, idsArg] = bulkRemoveProductsFromCollectionMock.mock.calls[0] as [string, string[]];
    expect(collectionArg).toBe(COLLECTION_ID);
    expect(idsArg).toHaveLength(SELECTED_IDS.length);
  });
});

describe("POST /products/bulk-edit — tag controls (UI consumer path)", () => {
  beforeEach(() => {
    updateProductsBatchMock.mockReset();
    bulkAddProductsToCollectionMock.mockReset();
    bulkRemoveProductsFromCollectionMock.mockReset();
    bulkSetProductTagsMock.mockReset();
  });

  it("addTagIds: calls bulkSetProductTags with ALL selected IDs and the tag IDs (mutation proof)", async () => {
    // This is exactly the body that handleBulkTagOp("add") sends from the UI
    bulkSetProductTagsMock.mockResolvedValue({ updated: 3, failed: 0, errors: [] });

    const { request } = createRouteHarness({
      register: registerProductRoutes,
      authUser: ADMIN_USER,
    });

    const res = await request("/bulk-edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productIds: SELECTED_IDS,
        addTagIds: [5, 7],
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { updated: number; failed: number };
    expect(body.updated).toBe(3);

    // MUTATION PROOF: bulkSetProductTags must be called with ALL 3 product IDs
    expect(bulkSetProductTagsMock).toHaveBeenCalledTimes(1);
    const [idsArg, addTagIds, removeTagIds] =
      bulkSetProductTagsMock.mock.calls[0] as [string[], number[], number[]];
    expect(idsArg).toHaveLength(SELECTED_IDS.length);
    expect(idsArg).toContain(SELECTED_IDS[0]);
    expect(idsArg).toContain(SELECTED_IDS[1]);
    expect(idsArg).toContain(SELECTED_IDS[2]);
    expect(addTagIds).toContain(5);
    expect(addTagIds).toContain(7);
    expect(removeTagIds).toHaveLength(0);
  });

  it("removeTagIds: calls bulkSetProductTags with removeTagIds set, addTagIds empty", async () => {
    // This is exactly the body that handleBulkTagOp("remove") sends from the UI
    bulkSetProductTagsMock.mockResolvedValue({ updated: 3, failed: 0, errors: [] });

    const { request } = createRouteHarness({
      register: registerProductRoutes,
      authUser: ADMIN_USER,
    });

    const res = await request("/bulk-edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productIds: SELECTED_IDS,
        removeTagIds: [3, 9],
      }),
    });

    expect(res.status).toBe(200);

    expect(bulkSetProductTagsMock).toHaveBeenCalledTimes(1);
    const [idsArg, addTagIds, removeTagIds] =
      bulkSetProductTagsMock.mock.calls[0] as [string[], number[], number[]];
    expect(idsArg).toHaveLength(SELECTED_IDS.length);
    expect(addTagIds).toHaveLength(0);
    expect(removeTagIds).toContain(3);
    expect(removeTagIds).toContain(9);
  });
});

describe("POST /products/bulk-edit — combined collection + tag in one request", () => {
  beforeEach(() => {
    updateProductsBatchMock.mockReset();
    bulkAddProductsToCollectionMock.mockReset();
    bulkRemoveProductsFromCollectionMock.mockReset();
    bulkSetProductTagsMock.mockReset();
  });

  it("runs both collection add AND tag add when body contains addCollectionId + addTagIds", async () => {
    bulkAddProductsToCollectionMock.mockResolvedValue({ updated: 3, failed: 0, errors: [] });
    bulkSetProductTagsMock.mockResolvedValue({ updated: 3, failed: 0, errors: [] });

    const { request } = createRouteHarness({
      register: registerProductRoutes,
      authUser: ADMIN_USER,
    });

    const res = await request("/bulk-edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productIds: SELECTED_IDS,
        addCollectionId: COLLECTION_ID,
        addTagIds: [11],
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { updated: number; failed: number };
    // Both operations ran: 3+3 = 6 total updated
    expect(body.updated).toBe(6);
    expect(body.failed).toBe(0);

    expect(bulkAddProductsToCollectionMock).toHaveBeenCalledTimes(1);
    expect(bulkSetProductTagsMock).toHaveBeenCalledTimes(1);
  });
});
