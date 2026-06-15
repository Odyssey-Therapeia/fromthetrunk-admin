/**
 * P2-07: payment_completed exactly-once + fire-and-forget proofs.
 *
 * Tests completePaidOrder in isolation with emitAnalyticsEvent mocked to verify:
 *   L3: payment_completed fires EXACTLY ONCE — only in the winner branch.
 *   L2 (money path): emitAnalyticsEvent throwing does NOT break completePaidOrder.
 *
 * These are in a separate file because vi.mock("@/lib/analytics/emit") conflicts
 * with the direct emitAnalyticsEvent tests in analytics-emit.test.ts.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks — must come before any import that uses these modules
// ---------------------------------------------------------------------------

const addOrderEventMock = vi.hoisted(() => vi.fn());
const getOrderMock = vi.hoisted(() => vi.fn());
const getOrderNotificationRecipientsMock = vi.hoisted(() => vi.fn());
const orderConfirmationEmailMock = vi.hoisted(() => vi.fn());
const orderPurchaseNotificationEmailMock = vi.hoisted(() => vi.fn());
const sendEmailMock = vi.hoisted(() => vi.fn());

// db.update chain: .set().where().returning()
const returningMock = vi.hoisted(() => vi.fn());
const whereMock = vi.hoisted(() => vi.fn());
const setMock = vi.hoisted(() => vi.fn());
const updateMock = vi.hoisted(() => vi.fn());

// emitAnalyticsEvent spy — mocked so we can assert call count without network
const emitAnalyticsEventMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("@/db", () => ({
  db: { update: updateMock },
}));

vi.mock("@/db/schema", () => ({
  orders: { id: "id", paymentStatus: "paymentStatus" },
  products: { id: "id" },
  reservations: { id: "id", orderId: "orderId", productId: "productId" },
  events: { eventId: "eventId" },
}));

vi.mock("@/db/queries/reservations", () => ({
  releaseReservationsByOrder: vi.fn().mockResolvedValue(undefined),
  releaseReservationsByProducts: vi.fn().mockResolvedValue(undefined),
  insertReservation: vi.fn().mockResolvedValue({ id: "res-1" }),
  expireReservations: vi.fn().mockResolvedValue({ deleted: 0 }),
}));

vi.mock("@/db/queries/orders", () => ({
  addOrderEvent: addOrderEventMock,
  getOrder: getOrderMock,
}));

vi.mock("@/lib/email/send", () => ({
  sendEmail: sendEmailMock,
}));

vi.mock("@/lib/email/recipients", () => ({
  getOrderNotificationRecipients: getOrderNotificationRecipientsMock,
}));

vi.mock("@/lib/email/templates", () => ({
  orderConfirmationEmail: orderConfirmationEmailMock,
  orderPurchaseNotificationEmail: orderPurchaseNotificationEmailMock,
}));

vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => ({ _and: args }),
  eq: (col: unknown, val: unknown) => ({ _eq: [col, val] }),
  inArray: (col: unknown, vals: unknown) => ({ _inArray: [col, vals] }),
  ne: (col: unknown, val: unknown) => ({ _ne: [col, val] }),
}));

vi.mock("@/lib/analytics/emit", () => ({
  emitAnalyticsEvent: emitAnalyticsEventMock,
  _resetSinks: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Import SUT after mocks
// ---------------------------------------------------------------------------

import { completePaidOrder } from "@/lib/orders/complete-paid-order";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const PENDING_ORDER = {
  id: "order-1",
  items: [{ productId: "prod-1", name: "Saree", pricePaise: 100000, quantity: 1 }],
  paymentStatus: "pending",
  shippingCity: "Mumbai",
  shippingCountry: "India",
  shippingCostPaise: 0,
  shippingEmail: "buyer@example.com",
  shippingLine1: "123 Street",
  shippingLine2: null,
  shippingName: "Test Buyer",
  shippingPhone: "9999999999",
  shippingPostalCode: "400001",
  shippingState: "MH",
  subtotalPaise: 100000,
  taxAmountPaise: 0,
  totalPaise: 100000,
};

const CONFIRMED_ORDER = { ...PENDING_ORDER, paymentStatus: "paid", status: "confirmed" };

const INPUT = {
  orderId: "order-1",
  paymentId: "pay_abc123",
  paymentMethod: "razorpay",
  paymentReference: "ref_xyz",
  paymentUrl: null,
  source: "razorpay-webhook",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("completePaidOrder — payment_completed exactly-once (L3)", () => {
  beforeEach(() => {
    updateMock.mockReset();
    setMock.mockReset();
    whereMock.mockReset();
    returningMock.mockReset();
    getOrderMock.mockReset();
    addOrderEventMock.mockReset();
    sendEmailMock.mockReset();
    getOrderNotificationRecipientsMock.mockReset();
    orderConfirmationEmailMock.mockReset();
    orderPurchaseNotificationEmailMock.mockReset();
    emitAnalyticsEventMock.mockReset();
    emitAnalyticsEventMock.mockResolvedValue(undefined);

    updateMock.mockReturnValue({ set: setMock });
    setMock.mockReturnValue({ where: whereMock });
    whereMock.mockReturnValue({ returning: returningMock });

    getOrderNotificationRecipientsMock.mockReturnValue(["admin@example.com"]);
    orderConfirmationEmailMock.mockReturnValue({ subject: "Order confirmed", html: "<p>confirmed</p>" });
    orderPurchaseNotificationEmailMock.mockReturnValue({ subject: "New purchase", html: "<p>purchase</p>" });
    sendEmailMock.mockResolvedValue(undefined);
    addOrderEventMock.mockResolvedValue(undefined);
  });

  it("emits payment_completed exactly once in winner branch (rows returned)", async () => {
    // Winner: atomic UPDATE returns rows
    returningMock.mockResolvedValue([{ id: "order-1" }]);

    getOrderMock
      .mockResolvedValueOnce(PENDING_ORDER)  // existing check
      .mockResolvedValueOnce(CONFIRMED_ORDER); // confirmed load (winner path)

    const result = await completePaidOrder(INPUT);

    expect(result.alreadyPaid).toBe(false);
    expect(result.emailsSent).toBe(true);

    expect(emitAnalyticsEventMock).toHaveBeenCalledTimes(1);
    expect(emitAnalyticsEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "payment_completed",
        payload: expect.objectContaining({
          orderId: "order-1",
          paymentId: "pay_abc123",
        }),
      })
    );
  });

  it("does NOT emit payment_completed in loser (already-paid) branch", async () => {
    // Loser: atomic UPDATE returns empty (order already paid by concurrent call)
    returningMock.mockResolvedValue([]);

    getOrderMock
      .mockResolvedValueOnce(CONFIRMED_ORDER)  // existing check passes (order exists)
      .mockResolvedValueOnce(CONFIRMED_ORDER); // current state read in loser path

    const result = await completePaidOrder(INPUT);

    expect(result.alreadyPaid).toBe(true);
    expect(result.emailsSent).toBe(false);
    expect(emitAnalyticsEventMock).not.toHaveBeenCalled();
  });

  it("emits exactly once under concurrent winner + loser calls", async () => {
    let updateCallCount = 0;
    returningMock.mockImplementation(() => {
      updateCallCount++;
      // First UPDATE call = winner, second = loser (concurrent race)
      return updateCallCount === 1
        ? Promise.resolve([{ id: "order-1" }])
        : Promise.resolve([]);
    });

    getOrderMock
      .mockResolvedValueOnce(PENDING_ORDER)   // call 1 existing check
      .mockResolvedValueOnce(PENDING_ORDER)   // call 2 existing check (concurrent)
      .mockResolvedValueOnce(CONFIRMED_ORDER) // call 1 confirmed (winner path)
      .mockResolvedValueOnce(CONFIRMED_ORDER); // call 2 current state (loser path)

    const [r1, r2] = await Promise.all([
      completePaidOrder(INPUT),
      completePaidOrder(INPUT),
    ]);

    const winners = [r1, r2].filter((r) => !r.alreadyPaid);
    const losers = [r1, r2].filter((r) => r.alreadyPaid);

    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);

    // Only the winner emits — total call count is exactly 1
    expect(emitAnalyticsEventMock).toHaveBeenCalledTimes(1);
    expect(emitAnalyticsEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: "payment_completed" })
    );
  });

  it("completePaidOrder succeeds (returns order) even when emitAnalyticsEvent rejects", async () => {
    // Simulate a failing analytics sink — should not break the money path
    emitAnalyticsEventMock.mockRejectedValue(new Error("Analytics infrastructure down"));

    // Winner path
    returningMock.mockResolvedValue([{ id: "order-1" }]);

    getOrderMock
      .mockResolvedValueOnce(PENDING_ORDER)
      .mockResolvedValueOnce(CONFIRMED_ORDER);

    // Because the SUT uses `void emitAnalyticsEvent(...)` the rejection is fire-and-forget.
    // The mock rejection here still propagates synchronously into the void since the
    // actual emitAnalyticsEvent wraps each sink call in .catch() — but we test that
    // completePaidOrder itself doesn't throw.
    //
    // NOTE: Even if the mocked function rejects, the `void` in the SUT means it
    // does not await or propagate the error into completePaidOrder.
    const result = await completePaidOrder(INPUT);

    // The order must be confirmed and emails sent despite analytics failure
    expect(result.alreadyPaid).toBe(false);
    expect(result.emailsSent).toBe(true);
    expect(result.order).toBeDefined();
  });

  it("payment_completed event_id is a valid UUID string (generated server-side)", async () => {
    returningMock.mockResolvedValue([{ id: "order-1" }]);

    getOrderMock
      .mockResolvedValueOnce(PENDING_ORDER)
      .mockResolvedValueOnce(CONFIRMED_ORDER);

    await completePaidOrder(INPUT);

    expect(emitAnalyticsEventMock).toHaveBeenCalledTimes(1);
    const [event] = emitAnalyticsEventMock.mock.calls[0] as [{ event_id: string }];
    // Validate that event_id is a UUID (generated via crypto.randomUUID())
    expect(event.event_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });
});
