/**
 * P6-05: Order notes — bounded .max(500), admin-only, persisted.
 *
 * Mutation-proof: oversized note is rejected with 400.
 * The .max(500) validation is in the schema, not mocked.
 */

import { OpenAPIHono } from "@hono/zod-openapi";
import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Hoisted mocks ---
const getOrderMock = vi.hoisted(() => vi.fn());
const updateOrderNoteMock = vi.hoisted(() => vi.fn());
const restockProductMock = vi.hoisted(() => vi.fn());
const refundPaymentMock = vi.hoisted(() => vi.fn());

vi.mock("@/db/queries/orders", () => ({
  getOrder: getOrderMock,
  updateOrderNote: updateOrderNoteMock,
  updateOrderRefund: vi.fn(),
  updateOrderTracking: vi.fn(),
  updateOrderStatus: vi.fn(),
}));

vi.mock("@/db/queries/products", () => ({
  restockProduct: restockProductMock,
}));

vi.mock("@/lib/ports/payments", () => ({
  getPaymentsPort: () => ({ refund: refundPaymentMock }),
}));

vi.mock("@/lib/email/send", () => ({
  sendEmail: vi.fn(),
}));

import { registerAdminOrderRoutes } from "@/api/hono/routes/admin-orders";
import type { HonoBindings } from "@/api/hono/types";

function createAdminApp() {
  const app = new OpenAPIHono<HonoBindings>();
  app.use("*", async (c, next) => {
    c.set("authUser", { id: "admin-user", role: "admin" });
    await next();
  });
  registerAdminOrderRoutes(app);
  return app;
}

const ORDER_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

const existingOrder = {
  id: ORDER_ID,
  status: "confirmed",
  paymentStatus: "paid",
  internalNote: null,
  items: [],
  events: [],
};

describe("admin orders PATCH /:id/note — bounded + persisted", () => {
  beforeEach(() => {
    getOrderMock.mockReset();
    updateOrderNoteMock.mockReset();
    updateOrderNoteMock.mockResolvedValue({ ...existingOrder, internalNote: "saved" });
  });

  it("saves a valid note (≤ 500 chars)", async () => {
    getOrderMock.mockResolvedValue(existingOrder);
    const app = createAdminApp();
    const res = await app.request(`/${ORDER_ID}/note`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: "Internal admin note here." }),
    });

    expect(res.status).toBe(200);
    expect(updateOrderNoteMock).toHaveBeenCalledOnce();
    expect(updateOrderNoteMock.mock.calls[0][0]).toBe(ORDER_ID);
    expect(updateOrderNoteMock.mock.calls[0][1]).toBe("Internal admin note here.");
  });

  // MUTATION PROOF: if .max(500) is removed from schema, the 501-char note would pass (200) and this fails
  it("BOUNDED: note > 500 chars is rejected with 400/422", async () => {
    getOrderMock.mockResolvedValue(existingOrder);
    const app = createAdminApp();
    const oversized = "x".repeat(501);
    const res = await app.request(`/${ORDER_ID}/note`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: oversized }),
    });

    expect([400, 422]).toContain(res.status);
    // updateOrderNote must NOT be called when validation fails
    expect(updateOrderNoteMock).not.toHaveBeenCalled();
  });

  it("exactly 500 chars is accepted", async () => {
    getOrderMock.mockResolvedValue(existingOrder);
    const app = createAdminApp();
    const exactNote = "a".repeat(500);
    const res = await app.request(`/${ORDER_ID}/note`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: exactNote }),
    });

    expect(res.status).toBe(200);
    expect(updateOrderNoteMock).toHaveBeenCalledOnce();
  });

  it("non-admin is rejected", async () => {
    const nonAdminApp = new OpenAPIHono<HonoBindings>();
    nonAdminApp.use("*", async (c, next) => {
      c.set("authUser", { id: "customer", role: "customer" });
      await next();
    });
    registerAdminOrderRoutes(nonAdminApp);

    getOrderMock.mockResolvedValue(existingOrder);
    const res = await nonAdminApp.request(`/${ORDER_ID}/note`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: "sneaky note" }),
    });
    expect([401, 403]).toContain(res.status);
    expect(updateOrderNoteMock).not.toHaveBeenCalled();
  });
});
