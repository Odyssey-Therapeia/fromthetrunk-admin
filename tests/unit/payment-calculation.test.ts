import crypto from "crypto";
import { describe, expect, it } from "vitest";

import { GST_RATE, SHIPPING_TIERS } from "@/lib/config/order-pricing";
import { calculateOrderTotals, verifyPaymentSignature } from "@/lib/payments/razorpay";

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
