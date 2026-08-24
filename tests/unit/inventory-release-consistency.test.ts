/**
 * Canonical inventory release — the shared helper every release path now uses.
 *
 * THE BUG THIS PINS. A release used to reset `stock_status` and `reserved_until`
 * but leave the inventory-v2 reservation row behind. `deriveStockStatus` reads
 * quantity plus the LIVE reservation count, so such a product was "available"
 * to v1 read paths and still "reserved" to every v2 read path — the PDP, the
 * feeds and the Merchant readiness audit — until the row expired on its own.
 * With Merchant inventory now following the v2 view, that pinned a perfectly
 * saleable saree to OUT_OF_STOCK in Google.
 *
 * What these tests prove:
 *   - A release writes all four facts together: stock_status = available,
 *     quantity_available = 1, reserved_until = null, reservation rows deleted.
 *   - The product UPDATE is conditional on `reserved`, so a SOLD product can
 *     never be resurrected by a late webhook or an expiry sweep — which now
 *     also means it can never be re-advertised to Google.
 *   - Reservation rows are cleared by ORDER when an order id is known (so rows
 *     for items that were never claimed go too) and by PRODUCT otherwise.
 *   - It is idempotent and a no-op for an empty product list.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const returningMock = vi.hoisted(() => vi.fn());
const whereMock = vi.hoisted(() => vi.fn(() => ({ returning: returningMock })));
const setMock = vi.hoisted(() => vi.fn(() => ({ where: whereMock })));
const updateMock = vi.hoisted(() => vi.fn(() => ({ set: setMock })));

vi.mock("@/db", () => ({
  db: { update: updateMock },
  rawSql: vi.fn(),
  withRetry: <T>(fn: () => Promise<T>) => fn(),
}));

const releaseByOrderMock = vi.hoisted(() => vi.fn());
const releaseByProductsMock = vi.hoisted(() => vi.fn());

vi.mock("@/db/queries/reservations", () => ({
  releaseReservationsByOrder: releaseByOrderMock,
  releaseReservationsByProducts: releaseByProductsMock,
}));

import { releaseProductReservations } from "@/lib/inventory/release-reservation";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ORDER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PRODUCT_A = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PRODUCT_B = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

/** Every string in the captured Drizzle WHERE AST. */
function collectStrings(node: unknown, seen = new WeakSet<object>()): string[] {
  if (typeof node === "string") return [node];
  if (node === null || typeof node !== "object") return [];
  if (seen.has(node)) return [];
  seen.add(node);

  return Object.values(node as Record<string, unknown>).flatMap((value) =>
    collectStrings(value, seen),
  );
}

const capturedWhere = () =>
  collectStrings((whereMock.mock.calls as unknown[][])[0]?.[0]);

const capturedSet = () =>
  (setMock.mock.calls as unknown[][])[0]?.[0] as Record<string, unknown>;

beforeEach(() => {
  returningMock.mockResolvedValue([{ id: PRODUCT_A }]);
  releaseByOrderMock.mockResolvedValue(undefined);
  releaseByProductsMock.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// The canonical write
// ---------------------------------------------------------------------------

describe("releaseProductReservations — canonical state", () => {
  it("restores all four facts in one update", async () => {
    await releaseProductReservations({ productIds: [PRODUCT_A] });

    expect(capturedSet()).toMatchObject({
      quantityAvailable: 1,
      reservedUntil: null,
      stockStatus: "available",
    });
    expect(releaseByProductsMock).toHaveBeenCalledWith([PRODUCT_A]);
  });

  it("restores quantity_available — the fact the webhook path used to miss", async () => {
    await releaseProductReservations({ productIds: [PRODUCT_A] });

    expect(capturedSet().quantityAvailable).toBe(1);
  });

  it("deletes the reservation rows — the other fact it used to miss", async () => {
    await releaseProductReservations({
      orderId: ORDER_ID,
      productIds: [PRODUCT_A],
    });

    expect(releaseByOrderMock).toHaveBeenCalledWith(ORDER_ID);
  });

  it("only ever releases a RESERVED product", async () => {
    await releaseProductReservations({ productIds: [PRODUCT_A, PRODUCT_B] });

    const where = capturedWhere();

    expect(where).toContain("reserved");
    expect(where).toContain(PRODUCT_A);
    expect(where).toContain(PRODUCT_B);
  });

  it("cannot resurrect a sold product", async () => {
    // The conditional UPDATE matches nothing when the row is 'sold'.
    returningMock.mockResolvedValue([]);

    const result = await releaseProductReservations({
      productIds: [PRODUCT_A],
    });

    expect(result.released).toBe(0);
    expect(capturedWhere()).toContain("reserved");
  });

  it("reports how many holds it actually freed", async () => {
    returningMock.mockResolvedValue([{ id: PRODUCT_A }, { id: PRODUCT_B }]);

    const result = await releaseProductReservations({
      productIds: [PRODUCT_A, PRODUCT_B],
    });

    expect(result.released).toBe(2);
  });
});

describe("releaseProductReservations — reservation-row scope", () => {
  it("clears rows by ORDER when the order is known", async () => {
    await releaseProductReservations({
      orderId: ORDER_ID,
      productIds: [PRODUCT_A],
    });

    expect(releaseByOrderMock).toHaveBeenCalledWith(ORDER_ID);
    expect(releaseByProductsMock).not.toHaveBeenCalled();
  });

  it("clears rows by PRODUCT when there is no order", async () => {
    await releaseProductReservations({ productIds: [PRODUCT_A, PRODUCT_B] });

    expect(releaseByProductsMock).toHaveBeenCalledWith([PRODUCT_A, PRODUCT_B]);
    expect(releaseByOrderMock).not.toHaveBeenCalled();
  });

  it("clears rows regardless of the inventory-v2 flag", async () => {
    // Matching the release-reservations cron and completePaidOrder: the
    // dual-write always runs, so a stale row can never survive a release.
    vi.stubEnv("INVENTORY_V2", "false");

    await releaseProductReservations({ productIds: [PRODUCT_A] });

    expect(releaseByProductsMock).toHaveBeenCalledWith([PRODUCT_A]);
    vi.unstubAllEnvs();
  });

  it("de-duplicates a repeated product id", async () => {
    await releaseProductReservations({
      productIds: [PRODUCT_A, PRODUCT_A, PRODUCT_B],
    });

    expect(releaseByProductsMock).toHaveBeenCalledWith([PRODUCT_A, PRODUCT_B]);
  });
});

describe("releaseProductReservations — no-ops", () => {
  it("touches nothing for an empty product list", async () => {
    const result = await releaseProductReservations({ productIds: [] });

    expect(result.released).toBe(0);
    expect(updateMock).not.toHaveBeenCalled();
    expect(releaseByOrderMock).not.toHaveBeenCalled();
    expect(releaseByProductsMock).not.toHaveBeenCalled();
  });

  it("touches nothing when every id is falsy", async () => {
    await releaseProductReservations({ productIds: ["", ""] });

    expect(updateMock).not.toHaveBeenCalled();
  });

  it("is idempotent — a retried webhook frees nothing the second time", async () => {
    await releaseProductReservations({
      orderId: ORDER_ID,
      productIds: [PRODUCT_A],
    });

    returningMock.mockResolvedValue([]); // already available
    const second = await releaseProductReservations({
      orderId: ORDER_ID,
      productIds: [PRODUCT_A],
    });

    expect(second.released).toBe(0);
    expect(releaseByOrderMock).toHaveBeenCalledTimes(2);
  });
});
