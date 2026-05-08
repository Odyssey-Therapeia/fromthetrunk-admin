import crypto from "crypto";
import Razorpay from "razorpay";

import { GST_RATE, SHIPPING_TIERS, type ShippingMethod } from "@/lib/config/order-pricing";

export const RAZORPAY_MIN_AMOUNT_PAISE = 100;

let instance: Razorpay | null = null;

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null ? value as Record<string, unknown> : null;

const readNumber = (value: unknown, key: string): number | null => {
  const record = asRecord(value);
  if (!record) return null;
  const raw = record[key];
  return typeof raw === "number" ? raw : null;
};

export function isRazorpayAuthError(error: unknown): boolean {
  const directStatus = readNumber(error, "statusCode");
  const nestedStatus = readNumber(asRecord(error)?.error, "statusCode");
  return directStatus === 401 || nestedStatus === 401;
}

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
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keySecret) return false;

  const body = `${orderId}|${paymentId}`;
  const expectedSignature = crypto
    .createHmac("sha256", keySecret)
    .update(body)
    .digest("hex");

  const expected = Buffer.from(expectedSignature, "hex");
  const received = Buffer.from(signature, "hex");

  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

/**
 * Calculate order totals server-side.
 */
export function calculateOrderTotals(
  subtotal: number,
  shippingMethod: ShippingMethod = "standard"
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
