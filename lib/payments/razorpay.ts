import crypto from "crypto";
import Razorpay from "razorpay";

import { GST_RATE, SHIPPING_TIERS, type ShippingMethod } from "@/lib/config/order-pricing";

export const RAZORPAY_MIN_AMOUNT_PAISE = 100;
export const RAZORPAY_PAYMENT_LINK_HOLD_MINUTES = 30;

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

const timingSafeHexEqual = (expectedSignature: string, signature: string): boolean => {
  const expected = Buffer.from(expectedSignature, "hex");
  const received = Buffer.from(signature, "hex");

  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
};

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

export type RazorpayPaymentLinkResponse = {
  amount?: number;
  amount_paid?: number;
  currency?: string;
  id: string;
  short_url: string;
  status?: string;
};

export type CreateRazorpayPaymentLinkInput = {
  amountPaise: number;
  callbackUrl: string;
  customer: {
    contact?: string | null;
    email: string;
    name: string;
  };
  description: string;
  expireBy?: Date;
  notes?: Record<string, string>;
  referenceId: string;
};

export const getRazorpayPaymentLinkReferenceId = (orderId: string) =>
  `ftt_${orderId.replace(/-/g, "").slice(0, 32)}`;

export async function createRazorpayPaymentLink({
  amountPaise,
  callbackUrl,
  customer,
  description,
  expireBy,
  notes,
  referenceId,
}: CreateRazorpayPaymentLinkInput): Promise<RazorpayPaymentLinkResponse> {
  const razorpay = getRazorpayInstance();
  const expiresAt =
    expireBy ?? new Date(Date.now() + RAZORPAY_PAYMENT_LINK_HOLD_MINUTES * 60 * 1000);

  const paymentLink = await razorpay.paymentLink.create({
    accept_partial: false,
    amount: amountPaise,
    callback_method: "get",
    callback_url: callbackUrl,
    currency: "INR",
    customer: {
      contact: customer.contact ?? undefined,
      email: customer.email,
      name: customer.name,
    },
    description,
    expire_by: Math.floor(expiresAt.getTime() / 1000),
    notes,
    notify: {
      email: true,
      sms: Boolean(customer.contact),
    },
    reference_id: referenceId,
    reminder_enable: true,
  });

  return paymentLink as RazorpayPaymentLinkResponse;
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

  return timingSafeHexEqual(expectedSignature, signature);
}

/**
 * Verify the redirect signature Razorpay sends after a Payment Link payment.
 */
export function verifyPaymentLinkSignature({
  paymentId,
  paymentLinkId,
  paymentLinkReferenceId,
  paymentLinkStatus,
  signature,
}: {
  paymentId: string;
  paymentLinkId: string;
  paymentLinkReferenceId: string;
  paymentLinkStatus: string;
  signature: string;
}): boolean {
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keySecret) return false;

  const body = `${paymentLinkId}|${paymentLinkReferenceId}|${paymentLinkStatus}|${paymentId}`;
  const expectedSignature = crypto
    .createHmac("sha256", keySecret)
    .update(body)
    .digest("hex");

  return timingSafeHexEqual(expectedSignature, signature);
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
