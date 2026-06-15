/**
 * Client-side checkout ESTIMATE (display only).
 *
 * The authoritative charge is always `calculateOrderTotals` in
 * lib/payments/razorpay.ts, computed server-side at order-creation time. This
 * helper exists so the displayed summary matches the amount the Razorpay link is
 * created for — in particular it mirrors the server's ORDER OF OPERATIONS:
 *
 *   1. effectiveSubtotal = subtotal − discount        (discount applied first)
 *   2. shipping is evaluated on the DISCOUNTED subtotal — the free-shipping
 *      threshold is checked post-discount (razorpay.ts:225-227). Previously the
 *      client computed shipping on the PRE-discount subtotal, so a discount that
 *      dropped the cart below the free-ship threshold showed "complimentary"
 *      shipping + a lower total while the server charged shipping → the Razorpay
 *      link was for MORE than the displayed total.
 *   3. GST is computed on the discounted subtotal (razorpay.ts:228-229).
 *
 * All inputs/outputs are in RUPEES (the cart store's unit), not paise.
 */

import {
  GST_RATE,
  SHIPPING_TIERS,
  type ShippingMethod,
} from "@/lib/config/order-pricing";

export type CheckoutEstimate = {
  /** subtotal − discount, clamped at 0. */
  effectiveSubtotal: number;
  /** Discount applied (clamped to [0, subtotal]). */
  discountAmount: number;
  /** Shipping, evaluated on the DISCOUNTED subtotal. */
  shippingCost: number;
  /** GST on the discounted subtotal. */
  taxAmount: number;
  /** effectiveSubtotal + shippingCost + taxAmount, clamped at 0. */
  total: number;
};

type ShippingTiers = {
  freeThreshold: number;
  standard: number;
  express: number;
};

export function computeCheckoutEstimate(input: {
  subtotal: number;
  shippingMethod: ShippingMethod;
  /** Server-returned discount amount in rupees (0 when no discount). */
  discountAmount?: number;
  gstRate?: number;
  shippingTiers?: ShippingTiers;
}): CheckoutEstimate {
  const gstRate = input.gstRate ?? GST_RATE;
  const tiers = input.shippingTiers ?? SHIPPING_TIERS;

  // Clamp the discount so it can never exceed the subtotal or go negative.
  const discountAmount = Math.min(
    Math.max(0, input.discountAmount ?? 0),
    Math.max(0, input.subtotal),
  );
  const effectiveSubtotal = Math.max(0, input.subtotal - discountAmount);

  // Shipping on the DISCOUNTED subtotal — mirrors the server.
  const shippingCost = isFreeShipping(effectiveSubtotal, tiers)
    ? 0
    : tiers[input.shippingMethod];

  const taxAmount = Math.round(effectiveSubtotal * gstRate);
  const total = Math.max(0, effectiveSubtotal + shippingCost + taxAmount);

  return { effectiveSubtotal, discountAmount, shippingCost, taxAmount, total };
}

/** Shared free-shipping predicate so the summary + method labels never diverge. */
export function isFreeShipping(
  subtotalForShipping: number,
  tiers: ShippingTiers = SHIPPING_TIERS,
): boolean {
  return subtotalForShipping >= tiers.freeThreshold;
}
