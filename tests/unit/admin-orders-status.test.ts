import { OpenAPIHono } from "@hono/zod-openapi";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted mocks — must be declared before any imports that use them
const getOrderMock = vi.hoisted(() => vi.fn());
const updateOrderStatusMock = vi.hoisted(() => vi.fn());
const sendEmailMock = vi.hoisted(() => vi.fn());
const restockProductMock = vi.hoisted(() => vi.fn());
const refundPaymentMock = vi.hoisted(() => vi.fn());

vi.mock("@/db/queries/orders", () => ({
  getOrder: getOrderMock,
  updateOrderStatus: updateOrderStatusMock,
  updateOrderRefund: vi.fn(),
  updateOrderTracking: vi.fn(),
  updateOrderNote: vi.fn(),
}));

// P6-05: admin-orders.ts now imports restockProduct; must mock to avoid DATABASE_URL error
vi.mock("@/db/queries/products", () => ({
  restockProduct: restockProductMock,
}));

// P6-05: admin-orders.ts now imports getPaymentsPort; must mock
vi.mock("@/lib/ports/payments", () => ({
  getPaymentsPort: () => ({ refund: refundPaymentMock }),
}));

vi.mock("@/lib/email/send", () => ({
  sendEmail: sendEmailMock,
}));

// Must import AFTER mocks are declared
import { registerAdminOrderRoutes } from "@/api/hono/routes/admin-orders";
import type { HonoBindings } from "@/api/hono/types";

function createTestApp() {
  const app = new OpenAPIHono<HonoBindings>();
  app.use("*", async (c, next) => {
    c.set("authUser", { id: "test-admin", role: "admin" });
    await next();
  });
  registerAdminOrderRoutes(app);
  return app;
}

const ORDER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const confirmedOrder = {
  id: ORDER_ID,
  status: "confirmed",
  shippingEmail: "customer@example.com",
  shippingName: "Test Customer",
  items: [],
  events: [],
};

describe("admin orders PATCH /:id/status — transition guard", () => {
  beforeEach(() => {
    getOrderMock.mockReset();
    updateOrderStatusMock.mockReset();
    sendEmailMock.mockReset();

    updateOrderStatusMock.mockResolvedValue(undefined);
    sendEmailMock.mockResolvedValue(undefined);
  });

  it("Test A: same-status PATCH does not call updateOrderStatus or sendEmail", async () => {
    // Order is already "confirmed"; body also says "confirmed"
    getOrderMock.mockResolvedValue(confirmedOrder);

    const app = createTestApp();
    const response = await app.request(`/${ORDER_ID}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "confirmed" }),
    });

    expect(response.status).toBe(200);
    expect(updateOrderStatusMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("Test B: different-status PATCH calls updateOrderStatus and sendEmail (confirmed → shipped)", async () => {
    // Order is "confirmed"; body transitions to "shipped"
    getOrderMock.mockResolvedValue(confirmedOrder);

    const app = createTestApp();
    const response = await app.request(`/${ORDER_ID}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "shipped", note: "Dispatched via courier" }),
    });

    expect(response.status).toBe(200);
    expect(updateOrderStatusMock).toHaveBeenCalledWith(
      ORDER_ID,
      "shipped",
      "Dispatched via courier"
    );
    expect(sendEmailMock).toHaveBeenCalledOnce();
    const body = await response.json();
    expect(body.emailSent).toBe(true);
  });

  it("Test C: transition to shipped WITHOUT shippingEmail does not call sendEmail", async () => {
    getOrderMock.mockResolvedValue({
      ...confirmedOrder,
      shippingEmail: null,
    });

    const app = createTestApp();
    const response = await app.request(`/${ORDER_ID}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "shipped" }),
    });

    expect(response.status).toBe(200);
    expect(updateOrderStatusMock).toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
    const body = await response.json();
    expect(body.emailSent).toBe(false);
  });

  it("Test D: same-status shipped PATCH does not re-email even when shippingEmail is set", async () => {
    // Order is already "shipped" — re-saving shipped must not trigger email again
    getOrderMock.mockResolvedValue({ ...confirmedOrder, status: "shipped" });

    const app = createTestApp();
    const response = await app.request(`/${ORDER_ID}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "shipped" }),
    });

    expect(response.status).toBe(200);
    expect(sendEmailMock).not.toHaveBeenCalled();
    const body = await response.json();
    expect(body.emailSent).toBe(false);
  });
});
