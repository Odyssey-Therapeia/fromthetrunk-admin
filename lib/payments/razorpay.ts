import Razorpay from "razorpay";

let instance: Razorpay | null = null;

export function getRazorpayInstance(): Razorpay {
  if (!instance) {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      throw new Error(
        "Razorpay credentials are not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET."
      );
    }

    instance = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });
  }

  return instance;
}

/**
 * Verify Razorpay payment signature.
 * See: https://razorpay.com/docs/payments/server-integration/nodejs/payment-verification/
 */
export function verifyPaymentSignature({
  orderId,
  paymentId,
  signature,
}: {
  orderId: string;
  paymentId: string;
  signature: string;
}): boolean {
  const crypto = require("crypto") as typeof import("crypto");
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keySecret) return false;

  const body = `${orderId}|${paymentId}`;
  const expectedSignature = crypto
    .createHmac("sha256", keySecret)
    .update(body)
    .digest("hex");

  return expectedSignature === signature;
}

/** GST rate for textile/apparel products in India. */
export const GST_RATE = 0.12; // 12%

/** Shipping cost tiers in INR. */
export const SHIPPING_TIERS = {
  /** Free shipping threshold (in INR) */
  freeThreshold: 25000,
  standard: 500,
  express: 1200,
} as const;

/**
 * Calculate order totals server-side.
 */
export function calculateOrderTotals(
  subtotal: number,
  shippingMethod: "standard" | "express" = "standard"
) {
  const shippingCost =
    subtotal >= SHIPPING_TIERS.freeThreshold ? 0 : SHIPPING_TIERS[shippingMethod];
  const taxAmount = Math.round(subtotal * GST_RATE);
  const total = subtotal + shippingCost + taxAmount;

  return {
    subtotal,
    shippingCost,
    shippingMethod,
    taxRate: GST_RATE,
    taxAmount,
    total,
  };
}
