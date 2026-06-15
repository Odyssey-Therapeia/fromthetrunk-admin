/**
 * Checkout display-estimate parity with the server charge.
 *
 * The bug (PR #37 review): the client computed shipping on the PRE-discount
 * subtotal, so a discount that dropped the cart below the free-shipping
 * threshold showed "complimentary" shipping + a lower total while the server
 * (calculateOrderTotals, razorpay.ts:225-227) charges shipping on the DISCOUNTED
 * subtotal → the Razorpay link was created for more than the displayed total.
 *
 * These tests pass explicit tiers/rate so they are hermetic (independent of the
 * NEXT_PUBLIC_FTT_* config env).
 */
import { describe, expect, it } from "vitest";

import {
  computeCheckoutEstimate,
  isFreeShipping,
} from "@/lib/checkout/estimate";

const TIERS = { freeThreshold: 10000, standard: 99, express: 199 };
const RATE = 0.1;

describe("computeCheckoutEstimate", () => {
  it("below free-ship threshold, no discount → charges standard shipping", () => {
    const e = computeCheckoutEstimate({
      subtotal: 5000,
      shippingMethod: "standard",
      gstRate: RATE,
      shippingTiers: TIERS,
    });
    expect(e.shippingCost).toBe(99);
    expect(e.taxAmount).toBe(500);
    expect(e.total).toBe(5599);
  });

  it("at/above free-ship threshold, no discount → free shipping", () => {
    const e = computeCheckoutEstimate({
      subtotal: 10000,
      shippingMethod: "standard",
      gstRate: RATE,
      shippingTiers: TIERS,
    });
    expect(e.shippingCost).toBe(0);
    expect(e.total).toBe(11000);
  });

  it("MUTATION PROOF: a discount that drops below the threshold RE-CHARGES shipping", () => {
    // subtotal 10500 is ABOVE the 10000 threshold; the discount drops the
    // effective subtotal to 9500, which is BELOW it. Shipping must be charged.
    const e = computeCheckoutEstimate({
      subtotal: 10500,
      shippingMethod: "standard",
      discountAmount: 1000,
      gstRate: RATE,
      shippingTiers: TIERS,
    });
    expect(e.effectiveSubtotal).toBe(9500);
    // If shipping were (incorrectly) computed on the pre-discount 10500 this
    // would be 0 and total 10450 — the exact bug this guards against.
    expect(e.shippingCost).toBe(99);
    expect(e.taxAmount).toBe(950);
    expect(e.total).toBe(10549);
  });

  it("GST is computed on the discounted subtotal", () => {
    const e = computeCheckoutEstimate({
      subtotal: 8000,
      shippingMethod: "standard",
      discountAmount: 3000,
      gstRate: RATE,
      shippingTiers: TIERS,
    });
    expect(e.effectiveSubtotal).toBe(5000);
    expect(e.taxAmount).toBe(500); // 5000 * 0.1, not 8000 * 0.1
  });

  it("clamps a discount larger than the subtotal", () => {
    const e = computeCheckoutEstimate({
      subtotal: 5000,
      shippingMethod: "standard",
      discountAmount: 9999,
      gstRate: RATE,
      shippingTiers: TIERS,
    });
    expect(e.discountAmount).toBe(5000);
    expect(e.effectiveSubtotal).toBe(0);
    expect(e.taxAmount).toBe(0);
    // Mirrors the server: shipping on a 0 discounted subtotal is still charged
    // (0 < threshold), so total === shipping.
    expect(e.total).toBe(99);
  });

  it("honours the express shipping method", () => {
    const e = computeCheckoutEstimate({
      subtotal: 5000,
      shippingMethod: "express",
      gstRate: RATE,
      shippingTiers: TIERS,
    });
    expect(e.shippingCost).toBe(199);
  });

  it("uses the real config defaults when tiers/rate are omitted", () => {
    // GST_RATE default 0.12, freeThreshold 25000, standard 500.
    const e = computeCheckoutEstimate({
      subtotal: 1000,
      shippingMethod: "standard",
    });
    expect(e.shippingCost).toBe(500);
    expect(e.taxAmount).toBe(120);
    expect(e.total).toBe(1620);
  });
});

describe("isFreeShipping", () => {
  it("is true at/above the threshold and false below it", () => {
    expect(isFreeShipping(10000, TIERS)).toBe(true);
    expect(isFreeShipping(9999, TIERS)).toBe(false);
  });
});
