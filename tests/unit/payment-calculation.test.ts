import crypto from "crypto";
import { describe, expect, it } from "vitest";

import { GST_RATE, SHIPPING_TIERS } from "@/lib/config/order-pricing";
import { calculateOrderTotals, verifyPaymentSignature } from "@/lib/payments/razorpay";

// calculateOrderTotals now works entirely in PAISE — the unit the routes that
// charge the customer actually carry. SHIPPING_TIERS values are rupee tiers, so
// the paise equivalents are scaled by 100.
const STANDARD_PAISE = SHIPPING_TIERS.standard * 100; // 500 INR -> 50000 paise
const EXPRESS_PAISE = SHIPPING_TIERS.express * 100; // 1200 INR -> 120000 paise
const FREE_THRESHOLD_PAISE = SHIPPING_TIERS.freeThreshold * 100; // 25000 INR -> 2500000 paise

describe("calculateOrderTotals (flag OFF / exclusive — default)", () => {
  it("calculates standard shipping + GST for small order", () => {
    const subtotalPaise = 1_500_000; // 15000 INR
    const result = calculateOrderTotals(subtotalPaise, "standard");

    expect(result.subtotalPaise).toBe(subtotalPaise);
    expect(result.shippingCostPaise).toBe(STANDARD_PAISE);
    expect(result.shippingMethod).toBe("standard");
    expect(result.taxRate).toBe(GST_RATE);
    expect(result.taxAmountPaise).toBe(Math.round(subtotalPaise * GST_RATE));
    expect(result.totalPaise).toBe(
      subtotalPaise + STANDARD_PAISE + Math.round(subtotalPaise * GST_RATE)
    );
  });

  it("gives free shipping above threshold", () => {
    const subtotalPaise = 3_000_000; // 30000 INR > threshold
    const result = calculateOrderTotals(subtotalPaise, "standard");

    expect(result.shippingCostPaise).toBe(0);
    expect(result.totalPaise).toBe(subtotalPaise + Math.round(subtotalPaise * GST_RATE));
  });

  it("gives free shipping for express above threshold", () => {
    const result = calculateOrderTotals(3_000_000, "express");

    expect(result.shippingCostPaise).toBe(0);
  });

  it("calculates express shipping for small order", () => {
    const subtotalPaise = 1_000_000; // 10000 INR
    const result = calculateOrderTotals(subtotalPaise, "express");

    expect(result.shippingCostPaise).toBe(EXPRESS_PAISE);
    expect(result.totalPaise).toBe(
      subtotalPaise + EXPRESS_PAISE + Math.round(subtotalPaise * GST_RATE)
    );
  });

  it("handles zero subtotal", () => {
    const result = calculateOrderTotals(0, "standard");

    expect(result.subtotalPaise).toBe(0);
    expect(result.taxAmountPaise).toBe(0);
    expect(result.shippingCostPaise).toBe(STANDARD_PAISE);
    expect(result.totalPaise).toBe(STANDARD_PAISE);
  });

  it("handles exact threshold amount", () => {
    const result = calculateOrderTotals(FREE_THRESHOLD_PAISE, "standard");

    // At exactly the threshold, shipping should be free
    expect(result.shippingCostPaise).toBe(0);
  });
});

describe("verifyPaymentSignature", () => {
  const withRazorpaySecret = (secret: string, test: () => void) => {
    const originalSecret = process.env.RAZORPAY_KEY_SECRET;
    process.env.RAZORPAY_KEY_SECRET = secret;
    try {
      test();
    } finally {
      if (originalSecret === undefined) {
        delete process.env.RAZORPAY_KEY_SECRET;
      } else {
        process.env.RAZORPAY_KEY_SECRET = originalSecret;
      }
    }
  };

  it("accepts a valid Razorpay order/payment HMAC", () => {
    withRazorpaySecret("test_secret", () => {
      const orderId = "order_test";
      const paymentId = "pay_test";
      const signature = crypto
        .createHmac("sha256", "test_secret")
        .update(`${orderId}|${paymentId}`)
        .digest("hex");

      expect(verifyPaymentSignature({ orderId, paymentId, signature })).toBe(true);
    });
  });

  it("rejects a mismatched Razorpay signature", () => {
    withRazorpaySecret("test_secret", () => {
      expect(
        verifyPaymentSignature({
          orderId: "order_test",
          paymentId: "pay_test",
          signature: "0".repeat(64),
        })
      ).toBe(false);
    });
  });
});
