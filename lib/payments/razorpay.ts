import crypto from "crypto";
import Razorpay from "razorpay";

import { isGstInclusive } from "@/lib/config/flags";
import { GST_RATE, SHIPPING_TIERS, type ShippingMethod } from "@/lib/config/order-pricing";
import { applyDiscountToPaise, type ValidatedDiscount } from "@/lib/discounts/validate";

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
 * Compute shipping cost in PAISE from a paise subtotal.
 *
 * This is the single shipping-cost rule used by every order-charge path. The
 * SHIPPING_TIERS values (freeThreshold, standard, express) are expressed in
 * rupees, so they are scaled to paise here. Free above the threshold.
 *
 * Both /api/v2/payments/create-order and /api/v2/orders MUST call this (via
 * calculateOrderTotals) so the customer-charged shipping is identical across
 * routes.
 */
export function toShippingCostPaise(
  subtotalPaise: number,
  shippingMethod: ShippingMethod = "standard"
): number {
  const freeThresholdPaise = SHIPPING_TIERS.freeThreshold * 100;
  if (subtotalPaise >= freeThresholdPaise) return 0;
  return SHIPPING_TIERS[shippingMethod] * 100;
}

export type OrderTotals = {
  discountAmountPaise: number;
  shippingCostPaise: number;
  shippingMethod: ShippingMethod;
  subtotalPaise: number;
  taxAmountPaise: number;
  taxRate: number;
  totalPaise: number;
};

/**
 * The single source of truth for the amount a customer is charged.
 *
 * Both the payment-link route (api/hono/routes/payments.ts) and the order
 * route (api/hono/routes/orders.ts) MUST call this with the same inputs they
 * already compute (a paise subtotal + the requested shipping method). It owns
 * shipping (via toShippingCostPaise), GST, and the grand total so the three
 * persisted fields — subtotalPaise, taxAmountPaise, totalPaise — and the
 * Razorpay charge can never drift apart.
 *
 * P6-02 DISCOUNT ORDER (documented as required by packet):
 *
 *   Flag OFF (default / GST-exclusive):
 *     1. discountAmountPaise = applyDiscountToPaise(discountableSubtotalPaise, discount)
 *        — clamped so discountAmountPaise ≤ discountableSubtotalPaise.
 *        — When discount.collectionId is set, discountableSubtotalPaise is the sum
 *          of pricePaise*quantity ONLY for items in the collection (scoped base).
 *          When there is no scope, discountableSubtotalPaise === subtotalPaise.
 *     2. discountedSubtotal = subtotalPaise - discountAmountPaise
 *        — out-of-scope items are not discounted; they remain in subtotalPaise.
 *     3. shippingCostPaise = toShippingCostPaise(discountedSubtotal, shippingMethod)
 *        — shipping is computed on the discounted subtotal so the free-shipping
 *          threshold is evaluated post-discount (industry-standard behaviour).
 *     4. taxAmountPaise = round(discountedSubtotal × GST_RATE)
 *        — GST is computed on the DISCOUNTED subtotal, not the original.
 *     5. totalPaise = max(0, discountedSubtotal + shippingCostPaise + taxAmountPaise)
 *
 *   Flag ON (GST-inclusive):
 *     1–2. Same discount computation on discountableSubtotalPaise.
 *     3. shippingCostPaise = toShippingCostPaise(discountedSubtotal, shippingMethod)
 *     4. taxAmountPaise = round(discountedSubtotal × GST_RATE / (1 + GST_RATE))
 *        — backed out for display only; not added to total.
 *     5. totalPaise = max(0, discountedSubtotal + shippingCostPaise)
 *
 * INVARIANTS guaranteed:
 *   - discountAmountPaise ≤ discountableSubtotalPaise (clamp in applyDiscountToPaise)
 *   - totalPaise ≥ 0 (Math.max clamp)
 *   - The CLIENT never computes or sends the discount amount — only the CODE.
 *   - Collection-scoped discounts apply ONLY to the in-collection base, not the
 *     full subtotal. Out-of-scope items are never discounted.
 *
 * When FTT_FEATURE_GST_INCLUSIVE is "true":
 *   - pricePaise / subtotalPaise is treated as the all-in (GST-inclusive) price.
 *   - No GST is added on top; the GST component is backed OUT for display only.
 *
 * When the flag is OFF (default, every current environment):
 *   - taxAmountPaise = round(discountedSubtotal × rate)
 *   - totalPaise = discountedSubtotal + shippingCostPaise + taxAmountPaise
 *
 * totalPaise is never negative.
 *
 * @param discountableSubtotalPaise - The base on which the discount is applied.
 *   When a discount has a collectionId, the caller computes this as the sum of
 *   pricePaise*quantity for items IN the collection only. When there is no scope
 *   (discount.collectionId === null), the caller passes subtotalPaise here.
 *   If omitted, defaults to subtotalPaise (backward-compatible).
 */
export function calculateOrderTotals(
  subtotalPaise: number,
  shippingMethod: ShippingMethod = "standard",
  discount?: ValidatedDiscount,
  discountableSubtotalPaise?: number
): OrderTotals {
  // P6-02: Apply discount to the SCOPED discountable base.
  // When discount.collectionId is set, discountableSubtotalPaise is the sum of
  // in-collection item lines (computed by the route). When there is no scope,
  // or no discount at all, it equals subtotalPaise.
  const effectiveDiscountBase = discountableSubtotalPaise ?? subtotalPaise;
  // The discount amount is clamped to [0, effectiveDiscountBase] by applyDiscountToPaise,
  // so the reduction never exceeds the discountable portion.
  const discountAmountPaise = discount ? applyDiscountToPaise(effectiveDiscountBase, discount) : 0;
  // Apply discount against the FULL subtotal: out-of-scope items are still in the
  // total, they just don't receive the discount. Math.max(0,...) is a safety clamp
  // but discountAmountPaise ≤ effectiveDiscountBase ≤ subtotalPaise, so it is never negative.
  const discountedSubtotal = Math.max(0, subtotalPaise - discountAmountPaise);

  // Shipping is computed on the discounted subtotal: the buyer earns free shipping
  // based on what they actually pay, not the pre-discount price.
  const shippingCostPaise = toShippingCostPaise(discountedSubtotal, shippingMethod);

  let taxAmountPaise: number;
  let totalPaise: number;

  if (isGstInclusive()) {
    // Inclusive: back-calculate the GST component from the discounted all-in price
    // for transparency display only. No GST is added on top.
    taxAmountPaise = Math.round((discountedSubtotal * GST_RATE) / (1 + GST_RATE));
    totalPaise = Math.max(0, discountedSubtotal + shippingCostPaise);
  } else {
    // Exclusive (default): add GST on top of the DISCOUNTED subtotal.
    // GST is computed AFTER discount (not on the original subtotal).
    taxAmountPaise = Math.round(discountedSubtotal * GST_RATE);
    totalPaise = Math.max(0, discountedSubtotal + shippingCostPaise + taxAmountPaise);
  }

  return {
    discountAmountPaise,
    shippingCostPaise,
    shippingMethod,
    subtotalPaise,
    taxAmountPaise,
    taxRate: GST_RATE,
    totalPaise,
  };
}
