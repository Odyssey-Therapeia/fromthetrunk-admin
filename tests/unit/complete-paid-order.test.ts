import { beforeEach, describe, expect, it, vi } from "vitest";

// ---- hoisted mocks ----
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

vi.mock("@/db", () => ({
  db: { update: updateMock },
}));

vi.mock("@/db/schema", () => ({
  orders: { id: "id", paymentStatus: "paymentStatus" },
  products: { id: "id" },
  reservations: { id: "id", orderId: "orderId", productId: "productId" },
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

import { completePaidOrder } from "@/lib/orders/complete-paid-order";

// ---- helper data ----
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

describe("completePaidOrder", () => {
  beforeEach(() => {
    // Reset all mocks
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

    // Wire the db.update chain so both orders and products updates work.
    // The chain: update(table).set(...).where(...) — and for orders: .returning(...)
    // We attach .returning() to the where result so it's always available.
    updateMock.mockReturnValue({ set: setMock });
    setMock.mockReturnValue({ where: whereMock });
    whereMock.mockReturnValue({ returning: returningMock });

    // Set up email mocks
    getOrderNotificationRecipientsMock.mockReturnValue(["admin@example.com"]);
    orderConfirmationEmailMock.mockReturnValue({ subject: "Order confirmed", html: "<p>confirmed</p>" });
    orderPurchaseNotificationEmailMock.mockReturnValue({ subject: "New purchase", html: "<p>purchase</p>" });
    sendEmailMock.mockResolvedValue(undefined);
    addOrderEventMock.mockResolvedValue(undefined);
  });

  describe("Test 1: concurrent calls — exactly one email sent", () => {
    it("first call wins (rows returned), second call loses (no rows returned)", async () => {
      // Simulate two concurrent calls, both reading a pending order.
      // The atomic UPDATE (orders table) is called once per completePaidOrder invocation.
      // First invocation: UPDATE returns [{ id }] → winner → sends emails
      // Second invocation: UPDATE returns [] → loser → returns alreadyPaid: true

      // Track call count to differentiate first vs second invocation's orders UPDATE.
      // In the new implementation the orders UPDATE is the FIRST db.update call per invocation.
      // Each invocation: orders UPDATE → products UPDATE (winner only).
      // We use a simple incrementing counter.
      let ordersUpdateCallCount = 0;
      returningMock.mockImplementation(() => {
        ordersUpdateCallCount++;
        if (ordersUpdateCallCount === 1) {
          // First invocation orders UPDATE — winner
          return Promise.resolve([{ id: "order-1" }]);
        }
        // Second invocation orders UPDATE — loser
        return Promise.resolve([]);
      });

      // whereMock for products update (winner path) — must resolve without error
      // The products update doesn't chain .returning(), it awaits whereMock's return directly.
      // But whereMock already returns { returning: returningMock }. In the implementation,
      // `await db.update(products).set(...).where(...)` awaits the where result.
      // Since whereMock returns { returning: returningMock } (a plain object, not a Promise),
      // awaiting it resolves to the object itself (no error). This is fine.

      // getOrder calls:
      // Call 1: existing check for first invocation (pending)
      // Call 2: existing check for second invocation (pending — race condition)
      // Call 3: confirmed load for first invocation (winner path)
      // Call 4: current state for second invocation (loser path)
      getOrderMock
        .mockResolvedValueOnce(PENDING_ORDER) // first call existing check
        .mockResolvedValueOnce(PENDING_ORDER) // second call existing check
        .mockResolvedValueOnce(CONFIRMED_ORDER) // first call confirmed load (winner)
        .mockResolvedValueOnce(CONFIRMED_ORDER); // second call current state (loser)

      const [result1, result2] = await Promise.all([
        completePaidOrder(INPUT),
        completePaidOrder(INPUT),
      ]);

      const results = [result1, result2];
      const winners = results.filter((r) => r.emailsSent);
      const losers = results.filter((r) => !r.emailsSent);

      // Exactly one winner, one loser
      expect(winners).toHaveLength(1);
      expect(losers).toHaveLength(1);

      // The loser must carry alreadyPaid: true
      expect(losers[0]).toHaveProperty("alreadyPaid", true);

      // sendEmail called exactly twice (customer + admin notification from winner only)
      expect(sendEmailMock).toHaveBeenCalledTimes(2);

      // Assert the atomic SET includes paymentStatus: "paid" (the guard that prevents double-pay).
      expect(setMock).toHaveBeenCalledWith(
        expect.objectContaining({ paymentStatus: "paid", status: "confirmed" })
      );

      // Assert the WHERE predicate contains the ne(orders.paymentStatus, "paid") guard.
      // Each concurrent call issues one orders UPDATE; whereMock is called at least twice.
      expect(whereMock.mock.calls.length).toBeGreaterThanOrEqual(2);
      // Every orders-table WHERE call must include the ne(..., "paid") predicate in its _and clause.
      const ordersWhereCalls = whereMock.mock.calls.filter(
        (args) =>
          args[0] &&
          typeof args[0] === "object" &&
          "_and" in args[0] &&
          Array.isArray((args[0] as { _and: unknown[] })._and) &&
          (args[0] as { _and: unknown[] })._and.some(
            (pred) =>
              pred !== null &&
              typeof pred === "object" &&
              "_ne" in (pred as object) &&
              Array.isArray((pred as { _ne: unknown[] })._ne) &&
              (pred as { _ne: unknown[] })._ne[0] === "paymentStatus" &&
              (pred as { _ne: unknown[] })._ne[1] === "paid"
          )
      );
      // Both concurrent calls must have used the atomic ne(...) guard
      expect(ordersWhereCalls.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("Test 2: idempotent re-call on already-paid order", () => {
    it("returns alreadyPaid=true and does not send emails when order is already paid", async () => {
      // getOrder returns the order (not-found check passes).
      // The existing order is already in confirmed/paid state, reflecting the scenario name.
      // The atomic orders UPDATE finds nothing (order already paid) → returns []
      // loser path: another getOrder call fetches current state
      getOrderMock
        .mockResolvedValueOnce(CONFIRMED_ORDER) // existing check — already-paid order (passes not-found guard)
        .mockResolvedValueOnce(CONFIRMED_ORDER); // current state read in loser path

      // orders UPDATE returns [] (already paid — no rows matched the ne(...) predicate)
      returningMock.mockResolvedValue([]);

      const result = await completePaidOrder(INPUT);

      expect(result.emailsSent).toBe(false);
      expect(result).toHaveProperty("alreadyPaid", true);
      expect(sendEmailMock).not.toHaveBeenCalled();

      // Assert the atomic SET was attempted with paymentStatus: "paid"
      expect(setMock).toHaveBeenCalledWith(
        expect.objectContaining({ paymentStatus: "paid", status: "confirmed" })
      );

      // Assert the WHERE included the ne(orders.paymentStatus, "paid") guard
      const ordersWhereCalls = whereMock.mock.calls.filter(
        (args) =>
          args[0] &&
          typeof args[0] === "object" &&
          "_and" in args[0] &&
          Array.isArray((args[0] as { _and: unknown[] })._and) &&
          (args[0] as { _and: unknown[] })._and.some(
            (pred) =>
              pred !== null &&
              typeof pred === "object" &&
              "_ne" in (pred as object) &&
              Array.isArray((pred as { _ne: unknown[] })._ne) &&
              (pred as { _ne: unknown[] })._ne[0] === "paymentStatus" &&
              (pred as { _ne: unknown[] })._ne[1] === "paid"
          )
      );
      // The single call must have used the atomic ne(...) guard
      expect(ordersWhereCalls.length).toBeGreaterThanOrEqual(1);
    });
  });
});
