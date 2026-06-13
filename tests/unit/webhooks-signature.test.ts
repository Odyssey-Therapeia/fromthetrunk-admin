import crypto from "crypto";
import { OpenAPIHono } from "@hono/zod-openapi";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted mocks — must be declared before any imports that use them
const completePaidOrderMock = vi.hoisted(() => vi.fn());
const getOrderMock = vi.hoisted(() => vi.fn());
const addOrderEventMock = vi.hoisted(() => vi.fn());
const dbUpdateMock = vi.hoisted(() => vi.fn());
const dbSelectMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/orders/complete-paid-order", () => ({
  completePaidOrder: completePaidOrderMock,
}));

vi.mock("@/db/queries/orders", () => ({
  getOrder: getOrderMock,
  addOrderEvent: addOrderEventMock,
}));

// Mock the db module to avoid real DB calls
vi.mock("@/db", () => {
  const selectChain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
  };
  const updateChain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([]),
  };
  return {
    db: {
      select: vi.fn(() => selectChain),
      update: vi.fn(() => updateChain),
    },
  };
});

// Must import AFTER mocks are declared
import { registerWebhookRoutes } from "@/api/hono/routes/webhooks";
import type { HonoBindings } from "@/api/hono/types";

function computeHmac(body: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

const WEBHOOK_SECRET = "test-secret";

function createTestApp() {
  const app = new OpenAPIHono<HonoBindings>();
  registerWebhookRoutes(app);
  return app;
}

describe("Webhook signature verification", () => {
  beforeEach(() => {
    process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
    completePaidOrderMock.mockReset();
    getOrderMock.mockReset();
    addOrderEventMock.mockReset();
    completePaidOrderMock.mockResolvedValue({ alreadyPaid: false, emailsSent: true });
    getOrderMock.mockResolvedValue(null);
    addOrderEventMock.mockResolvedValue(undefined);
  });

  it("Test A: valid signature is accepted (does not return INVALID_SIGNATURE 400)", async () => {
    const body = JSON.stringify({ event: "payment.failed", payload: {} });
    const signature = computeHmac(body, WEBHOOK_SECRET);

    const app = createTestApp();
    const response = await app.request("/razorpay", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-razorpay-signature": signature,
      },
      body,
    });

    expect(response.status).toBe(200);
  });

  it("Test B: wrong signature is rejected with INVALID_SIGNATURE 400", async () => {
    const body = JSON.stringify({ event: "payment.failed", payload: {} });
    const wrongSignature = computeHmac(body, "wrong-secret");

    const app = createTestApp();
    const response = await app.request("/razorpay", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-razorpay-signature": wrongSignature,
      },
      body,
    });

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json).toMatchObject({ code: "INVALID_SIGNATURE" });
  });

  it("Test D: malformed/short signature triggers length guard and returns INVALID_SIGNATURE 400", async () => {
    const body = JSON.stringify({ event: "payment.failed", payload: {} });

    const app = createTestApp();
    const response = await app.request("/razorpay", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-razorpay-signature": "deadbeef", // 8 chars, not 64 — mismatched length
      },
      body,
    });

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json).toMatchObject({ code: "INVALID_SIGNATURE" });
  });

  it("Test C: missing signature header returns MISSING_SIGNATURE 400", async () => {
    const body = JSON.stringify({ event: "payment.failed", payload: {} });

    const app = createTestApp();
    const response = await app.request("/razorpay", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body,
    });

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json).toMatchObject({ code: "MISSING_SIGNATURE" });
  });
});
