import { describe, expect, it } from "vitest";

import { calculateOrderTotals, GST_RATE, SHIPPING_TIERS } from "@/lib/payments/razorpay";

describe("calculateOrderTotals", () => {
  it("calculates standard shipping + GST for small order", () => {
    const result = calculateOrderTotals(15000, "standard");

    expect(result.subtotal).toBe(15000);
    expect(result.shippingCost).toBe(SHIPPING_TIERS.standard);
    expect(result.shippingMethod).toBe("standard");
    expect(result.taxRate).toBe(GST_RATE);
    expect(result.taxAmount).toBe(Math.round(15000 * GST_RATE));
    expect(result.total).toBe(15000 + SHIPPING_TIERS.standard + Math.round(15000 * GST_RATE));
  });

  it("gives free shipping above threshold", () => {
    const result = calculateOrderTotals(30000, "standard");

    expect(result.shippingCost).toBe(0);
    expect(result.total).toBe(30000 + Math.round(30000 * GST_RATE));
  });

  it("gives free shipping for express above threshold", () => {
    const result = calculateOrderTotals(30000, "express");

    expect(result.shippingCost).toBe(0);
  });

  it("calculates express shipping for small order", () => {
    const result = calculateOrderTotals(10000, "express");

    expect(result.shippingCost).toBe(SHIPPING_TIERS.express);
    expect(result.total).toBe(10000 + SHIPPING_TIERS.express + Math.round(10000 * GST_RATE));
  });

  it("handles zero subtotal", () => {
    const result = calculateOrderTotals(0, "standard");

    expect(result.subtotal).toBe(0);
    expect(result.taxAmount).toBe(0);
    expect(result.shippingCost).toBe(SHIPPING_TIERS.standard);
    expect(result.total).toBe(SHIPPING_TIERS.standard);
  });

  it("handles exact threshold amount", () => {
    const result = calculateOrderTotals(25000, "standard");

    // At exactly the threshold, shipping should be free
    expect(result.shippingCost).toBe(0);
  });
});
