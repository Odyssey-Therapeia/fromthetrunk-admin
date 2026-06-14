/**
 * P6-05: Shipment tracking → customer email guard.
 *
 * Discipline:
 *   - mock @/db/queries/orders (getOrder, updateOrderTracking)
 *   - mock @/lib/email/send
 *   - MUTATION PROOF: no-change tracking → no email sent (guard is load-bearing)
 *   - Assert email contains the tracking link
 */

import { OpenAPIHono } from "@hono/zod-openapi";
import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Hoisted mocks ---
const getOrderMock = vi.hoisted(() => vi.fn());
const updateOrderTrackingMock = vi.hoisted(() => vi.fn());
const sendEmailMock = vi.hoisted(() => vi.fn());
const restockProductMock = vi.hoisted(() => vi.fn());
const refundPaymentMock = vi.hoisted(() => vi.fn());

vi.mock("@/db/queries/orders", () => ({
  getOrder: getOrderMock,
  updateOrderTracking: updateOrderTrackingMock,
  // atomic refund helpers (used by the refund route, not tracking)
  claimOrderRefund: vi.fn(),
  finalizeOrderRefund: vi.fn(),
  revertOrderRefundClaim: vi.fn(),
  updateOrderNote: vi.fn(),
  updateOrderStatus: vi.fn(),
}));

vi.mock("@/db/queries/products", () => ({
  restockProduct: restockProductMock,
}));

vi.mock("@/lib/ports/payments", () => ({
  getPaymentsPort: () => ({ refund: refundPaymentMock }),
}));

vi.mock("@/lib/email/send", () => ({
  sendEmail: sendEmailMock,
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

const ORDER_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const baseOrder = {
  id: ORDER_ID,
  status: "confirmed",
  paymentStatus: "paid",
  trackingNumber: null,
  trackingCarrier: null,
  shippingEmail: "customer@example.com",
  shippingName: "Test Customer",
  items: [],
  events: [],
};

describe("admin orders PATCH /:id/tracking — email guard", () => {
  beforeEach(() => {
    getOrderMock.mockReset();
    updateOrderTrackingMock.mockReset();
    sendEmailMock.mockReset();
    updateOrderTrackingMock.mockResolvedValue(undefined);
    sendEmailMock.mockResolvedValue(true);
  });

  it("setting tracking number for the first time sends ONE email", async () => {
    getOrderMock.mockResolvedValue({ ...baseOrder, trackingNumber: null });
    const app = createAdminApp();
    const res = await app.request(`/${ORDER_ID}/tracking`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trackingNumber: "1Z999AA10123456784", trackingCarrier: "UPS" }),
    });

    expect(res.status).toBe(200);
    expect(updateOrderTrackingMock).toHaveBeenCalledOnce();
    expect(sendEmailMock).toHaveBeenCalledOnce();

    // Email must contain the tracking number
    const emailArgs = sendEmailMock.mock.calls[0][0] as { html: string; subject: string; to: string };
    expect(emailArgs.html).toContain("1Z999AA10123456784");

    const body = await res.json();
    expect(body.emailSent).toBe(true);
  });

  it("changing tracking number sends ONE email", async () => {
    getOrderMock.mockResolvedValue({ ...baseOrder, trackingNumber: "OLD123", trackingCarrier: "DTDC" });
    const app = createAdminApp();
    const res = await app.request(`/${ORDER_ID}/tracking`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trackingNumber: "NEW456", trackingCarrier: "DTDC" }),
    });

    expect(res.status).toBe(200);
    expect(sendEmailMock).toHaveBeenCalledOnce();
  });

  // MUTATION PROOF: the guard (old vs new tracking number) is load-bearing
  // If you remove the isTrackingChange guard, this test will FAIL (email fires).
  it("GUARD: same tracking number submitted again does NOT re-send email", async () => {
    getOrderMock.mockResolvedValue({
      ...baseOrder,
      trackingNumber: "SAME123",
      trackingCarrier: "BlueDart",
    });
    const app = createAdminApp();
    const res = await app.request(`/${ORDER_ID}/tracking`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trackingNumber: "SAME123", trackingCarrier: "BlueDart" }),
    });

    expect(res.status).toBe(200);
    // DB update still persists (idempotent storage), but email is NOT resent
    expect(updateOrderTrackingMock).toHaveBeenCalledOnce();
    expect(sendEmailMock).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.emailSent).toBe(false);
  });

  it("no shippingEmail → tracking update succeeds but no email sent", async () => {
    getOrderMock.mockResolvedValue({ ...baseOrder, shippingEmail: null, trackingNumber: null });
    const app = createAdminApp();
    const res = await app.request(`/${ORDER_ID}/tracking`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trackingNumber: "TRK001", trackingCarrier: "India Post" }),
    });

    expect(res.status).toBe(200);
    expect(updateOrderTrackingMock).toHaveBeenCalledOnce();
    expect(sendEmailMock).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.emailSent).toBe(false);
  });

  it("non-admin is rejected with 401/403", async () => {
    const nonAdminApp = new OpenAPIHono<HonoBindings>();
    nonAdminApp.use("*", async (c, next) => {
      c.set("authUser", { id: "customer", role: "customer" });
      await next();
    });
    registerAdminOrderRoutes(nonAdminApp);

    getOrderMock.mockResolvedValue(baseOrder);
    const res = await nonAdminApp.request(`/${ORDER_ID}/tracking`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trackingNumber: "TRK001" }),
    });
    expect([401, 403]).toContain(res.status);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  // XSS HARDENING: admin-supplied trackingNumber must be HTML-escaped in the
  // shipped email. Without escapeHtml(), a tracking number like
  // '<script>alert(1)</script>' would inject raw HTML into the email body.
  it("XSS: HTML in trackingNumber is escaped in the shipped email", async () => {
    const xssTracking = "<script>alert('xss')</script>";
    getOrderMock.mockResolvedValue({ ...baseOrder, trackingNumber: null });
    const app = createAdminApp();
    const res = await app.request(`/${ORDER_ID}/tracking`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trackingNumber: xssTracking, trackingCarrier: "Manual" }),
    });

    expect(res.status).toBe(200);
    expect(sendEmailMock).toHaveBeenCalledOnce();

    const emailArgs = sendEmailMock.mock.calls[0][0] as { html: string };
    // The raw script tag must NOT appear in the HTML
    expect(emailArgs.html).not.toContain("<script>");
    // The escaped form must appear instead
    expect(emailArgs.html).toContain("&lt;script&gt;");
  });
});
