/**
 * P4-03: tests/unit/collections-routes.test.ts
 *
 * Admin CRUD route tests for collection management endpoints,
 * including the new manual-product add/remove routes added in P4-03.
 *
 * All DB calls are mocked via vi.hoisted + vi.mock.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks — must come before any imports that touch the mocked modules
// ---------------------------------------------------------------------------

const listCollectionsMock = vi.hoisted(() => vi.fn());
const getCollectionBySlugMock = vi.hoisted(() => vi.fn());
const createCollectionMock = vi.hoisted(() => vi.fn());
const updateCollectionMock = vi.hoisted(() => vi.fn());
const deleteCollectionMock = vi.hoisted(() => vi.fn());
const addProductToCollectionMock = vi.hoisted(() => vi.fn());
const removeProductFromCollectionMock = vi.hoisted(() => vi.fn());
const getCollectionProductIdsMock = vi.hoisted(() => vi.fn());

vi.mock("@/db/queries/collections", () => ({
  listCollections: listCollectionsMock,
  getCollectionBySlug: getCollectionBySlugMock,
  createCollection: createCollectionMock,
  updateCollection: updateCollectionMock,
  deleteCollection: deleteCollectionMock,
  addProductToCollection: addProductToCollectionMock,
  removeProductFromCollection: removeProductFromCollectionMock,
  getCollectionProductIds: getCollectionProductIdsMock,
}));

import { registerCollectionRoutes } from "@/api/hono/routes/collections";
import { createRouteHarness } from "../helpers/route-harness";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ADMIN_USER = { id: "admin-1", email: "admin@example.com", role: "admin" as const };
const CUSTOMER_USER = { id: "cust-1", email: "cust@example.com", role: "customer" as const };

const COLLECTION_1 = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  name: "Silk Heritage",
  slug: "silk-heritage",
  description: null,
  featured: false,
  heroMediaId: null,
  rules: null,
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
  heroMedia: null,
};

// ---------------------------------------------------------------------------
// Admin collection CRUD
// ---------------------------------------------------------------------------

describe("GET /collections — list collections", () => {
  beforeEach(() => {
    listCollectionsMock.mockReset();
  });

  it("returns the collection list", async () => {
    listCollectionsMock.mockResolvedValue([COLLECTION_1]);

    const { request } = createRouteHarness({
      register: registerCollectionRoutes,
      authUser: ADMIN_USER,
    });

    const res = await request("/");
    expect(res.status).toBe(200);
    const body = (await res.json()) as unknown[];
    expect(body).toHaveLength(1);
  });
});

describe("POST /collections — create collection", () => {
  beforeEach(() => {
    createCollectionMock.mockReset();
  });

  it("creates a collection and returns 201", async () => {
    createCollectionMock.mockResolvedValue(COLLECTION_1);

    const { request } = createRouteHarness({
      register: registerCollectionRoutes,
      authUser: ADMIN_USER,
    });

    const res = await request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Silk Heritage", slug: "silk-heritage" }),
    });

    expect(res.status).toBe(201);
  });

  it("rejects non-admin users with 403", async () => {
    const { request } = createRouteHarness({
      register: registerCollectionRoutes,
      authUser: CUSTOMER_USER,
    });

    const res = await request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Silk Heritage", slug: "silk-heritage" }),
    });

    expect(res.status).toBe(403);
    expect(createCollectionMock).not.toHaveBeenCalled();
  });

  it("creates a collection with rules", async () => {
    const withRules = {
      ...COLLECTION_1,
      rules: [{ type: "price-range", min: 10000, max: 50000 }],
    };
    createCollectionMock.mockResolvedValue(withRules);

    const { request } = createRouteHarness({
      register: registerCollectionRoutes,
      authUser: ADMIN_USER,
    });

    const res = await request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Mid-Range",
        slug: "mid-range",
        rules: [{ type: "price-range", min: 10000, max: 50000 }],
      }),
    });

    expect(res.status).toBe(201);
  });
});

describe("PATCH /collections/:id — update collection", () => {
  beforeEach(() => {
    updateCollectionMock.mockReset();
  });

  it("updates a collection and returns 200", async () => {
    const updated = { ...COLLECTION_1, name: "Updated Name" };
    updateCollectionMock.mockResolvedValue(updated);

    const { request } = createRouteHarness({
      register: registerCollectionRoutes,
      authUser: ADMIN_USER,
    });

    const res = await request(`/${COLLECTION_1.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated Name" }),
    });

    expect(res.status).toBe(200);
  });

  it("returns 404 when collection is not found", async () => {
    updateCollectionMock.mockResolvedValue(null);

    const { request } = createRouteHarness({
      register: registerCollectionRoutes,
      authUser: ADMIN_USER,
    });

    const res = await request("/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Does not matter" }),
    });

    expect(res.status).toBe(404);
  });
});

describe("DELETE /collections/:id — delete collection", () => {
  beforeEach(() => {
    deleteCollectionMock.mockReset();
  });

  it("deletes a collection and returns 200", async () => {
    deleteCollectionMock.mockResolvedValue(true);

    const { request } = createRouteHarness({
      register: registerCollectionRoutes,
      authUser: ADMIN_USER,
    });

    const res = await request(`/${COLLECTION_1.id}`, { method: "DELETE" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean };
    expect(body.success).toBe(true);
  });

  it("returns 404 when collection does not exist", async () => {
    deleteCollectionMock.mockResolvedValue(false);

    const { request } = createRouteHarness({
      register: registerCollectionRoutes,
      authUser: ADMIN_USER,
    });

    const res = await request("/cccccccc-cccc-4ccc-8ccc-cccccccccccc", { method: "DELETE" });
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Manual product membership routes
// ---------------------------------------------------------------------------

describe("POST /collections/:id/products — add product to collection", () => {
  beforeEach(() => {
    addProductToCollectionMock.mockReset();
  });

  const PRODUCT_UUID = "11111111-1111-4111-8111-111111111111";

  it("adds a product to a collection and returns 200", async () => {
    addProductToCollectionMock.mockResolvedValue(undefined);

    const { request } = createRouteHarness({
      register: registerCollectionRoutes,
      authUser: ADMIN_USER,
    });

    const res = await request(`/${COLLECTION_1.id}/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: PRODUCT_UUID }),
    });

    expect(res.status).toBe(200);
    expect(addProductToCollectionMock).toHaveBeenCalledWith(
      COLLECTION_1.id,
      PRODUCT_UUID
    );
  });

  it("rejects non-admin users with 403", async () => {
    const { request } = createRouteHarness({
      register: registerCollectionRoutes,
      authUser: CUSTOMER_USER,
    });

    const res = await request(`/${COLLECTION_1.id}/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: PRODUCT_UUID }),
    });

    expect(res.status).toBe(403);
    expect(addProductToCollectionMock).not.toHaveBeenCalled();
  });
});

describe("DELETE /collections/:id/products/:productId — remove product from collection", () => {
  beforeEach(() => {
    removeProductFromCollectionMock.mockReset();
  });

  const PRODUCT_UUID = "22222222-2222-4222-8222-222222222222";

  it("removes a product from a collection and returns 200", async () => {
    removeProductFromCollectionMock.mockResolvedValue(true);

    const { request } = createRouteHarness({
      register: registerCollectionRoutes,
      authUser: ADMIN_USER,
    });

    const res = await request(`/${COLLECTION_1.id}/products/${PRODUCT_UUID}`, {
      method: "DELETE",
    });

    expect(res.status).toBe(200);
    expect(removeProductFromCollectionMock).toHaveBeenCalledWith(
      COLLECTION_1.id,
      PRODUCT_UUID
    );
  });

  it("rejects non-admin with 403", async () => {
    const { request } = createRouteHarness({
      register: registerCollectionRoutes,
      authUser: CUSTOMER_USER,
    });

    const res = await request(`/${COLLECTION_1.id}/products/${PRODUCT_UUID}`, {
      method: "DELETE",
    });

    expect(res.status).toBe(403);
    expect(removeProductFromCollectionMock).not.toHaveBeenCalled();
  });
});
