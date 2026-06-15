/**
 * P6-05: Razorpay refund adapter — fixture-tested (NO live Razorpay).
 *
 * Discipline:
 *   - getRazorpayInstance is stubbed so the SDK never calls the live API
 *   - collectPrimitives used for WHERE value assertions
 *   - Real adapter logic runs (only the Razorpay SDK boundary is mocked)
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

function collectPrimitives(node: unknown, visited = new WeakSet<object>()): string[] {
  if (node === null || node === undefined) return [];
  if (typeof node === "string") return [node];
  if (node instanceof Date) return [node.toISOString()];
  if (typeof node !== "object") return [];
  if (visited.has(node as object)) return [];
  visited.add(node as object);
  return Object.values(node as Record<string, unknown>).flatMap((v) =>
    collectPrimitives(v, visited)
  );
}

// --- Hoisted mocks ---
const razorpayPaymentsRefundMock = vi.hoisted(() => vi.fn());
const getRazorpayInstanceMock = vi.hoisted(() =>
  vi.fn().mockReturnValue({
    payments: {
      refund: razorpayPaymentsRefundMock,
    },
  })
);

vi.mock("@/lib/payments/razorpay", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/payments/razorpay")>();
  return {
    ...actual,
    getRazorpayInstance: getRazorpayInstanceMock,
  };
});

import { createRazorpayRefundAdapter } from "@/lib/adapters/razorpay-refund";

const PAYMENT_ID = "pay_testABC123";

describe("createRazorpayRefundAdapter", () => {
  beforeEach(() => {
    razorpayPaymentsRefundMock.mockReset();
    getRazorpayInstanceMock.mockClear();
  });

  it("calls Razorpay payments.refund with the paymentId and full amount", async () => {
    const mockRefundResponse = { id: "rfnd_xyz", amount: 500000, status: "processed" };
    razorpayPaymentsRefundMock.mockResolvedValue(mockRefundResponse);

    const adapter = createRazorpayRefundAdapter();
    const result = await adapter.refund({ paymentId: PAYMENT_ID, amountPaise: 500000 });

    expect(razorpayPaymentsRefundMock).toHaveBeenCalledOnce();

    // collectPrimitives: assert the paymentId appears in the call args
    const allPrimitives = collectPrimitives(razorpayPaymentsRefundMock.mock.calls[0]);
    expect(allPrimitives).toContain(PAYMENT_ID);

    expect(result.refundId).toBe("rfnd_xyz");
    expect(result.amountPaise).toBe(500000);
  });

  it("propagates Razorpay errors as thrown exceptions", async () => {
    razorpayPaymentsRefundMock.mockRejectedValue(new Error("Razorpay: invalid payment"));

    const adapter = createRazorpayRefundAdapter();
    await expect(adapter.refund({ paymentId: PAYMENT_ID, amountPaise: 100 })).rejects.toThrow(
      "Razorpay: invalid payment"
    );
  });

  it("does not call Razorpay when paymentId is missing", async () => {
    const adapter = createRazorpayRefundAdapter();
    await expect(adapter.refund({ paymentId: "", amountPaise: 100 })).rejects.toThrow();
    expect(razorpayPaymentsRefundMock).not.toHaveBeenCalled();
  });
});
