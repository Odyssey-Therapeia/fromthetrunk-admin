/**
 * P2-04 + P6-02: GST-inclusive pricing feature flag tests.
 *
 * Covers:
 * - isGstInclusive() helper behaviour
 * - calculateOrderTotals flag-OFF regression lock (identical to pre-P2-04 numbers)
 * - calculateOrderTotals flag-ON inclusive math
 * - Property invariants: total >= subtotal + shippingCost, never negative
 * - FIX #4 (P6-02): GST-flag-ON + discount property tests
 *   - discountAmountPaise is clamped (never > subtotal)
 *   - GST is back-calculated from DISCOUNTED subtotal (not original)
 *   - totalPaise = discountedSubtotal + shippingCostPaise (no GST added on top)
 *   - totalPaise >= 0 for all inputs
 *   - Mutation-proof: GST on original subtotal differs from GST on discounted subtotal
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ValidatedDiscount } from "@/lib/discounts/validate";

import { GST_RATE, SHIPPING_TIERS } from "@/lib/config/order-pricing";

// calculateOrderTotals operates in PAISE (the unit the charging routes carry).
// SHIPPING_TIERS are rupee tiers, so paise equivalents are scaled by 100.
const STANDARD_PAISE = SHIPPING_TIERS.standard * 100; // 50000
const EXPRESS_PAISE = SHIPPING_TIERS.express * 100; // 120000

// ── helpers ────────────────────────────────────────────────────────────────

/**
 * Toggle FTT_FEATURE_GST_INCLUSIVE in process.env for the duration of a test.
 * Uses vi.stubEnv so Vitest restores it automatically on afterEach.
 */
function setGstFlag(value: "true" | "false" | undefined) {
  if (value === undefined) {
    vi.unstubAllEnvs();
  } else {
    vi.stubEnv("FTT_FEATURE_GST_INCLUSIVE", value);
  }
}

afterEach(() => {
  vi.unstubAllEnvs();
});

// ── isGstInclusive() ───────────────────────────────────────────────────────

describe("isGstInclusive()", () => {
  it('returns false when env var is absent (default OFF)', async () => {
    vi.unstubAllEnvs();
    delete process.env.FTT_FEATURE_GST_INCLUSIVE;
    const { isGstInclusive } = await import("@/lib/config/flags");
    expect(isGstInclusive()).toBe(false);
  });

  it('returns false when env var is "false"', async () => {
    setGstFlag("false");
    const { isGstInclusive } = await import("@/lib/config/flags");
    expect(isGstInclusive()).toBe(false);
  });

  it('returns true when env var is "true"', async () => {
    setGstFlag("true");
    const { isGstInclusive } = await import("@/lib/config/flags");
    expect(isGstInclusive()).toBe(true);
  });
});

// ── calculateOrderTotals — flag OFF (regression lock) ─────────────────────

describe("calculateOrderTotals — flag OFF (regression lock, exclusive pricing)", () => {
  beforeEach(() => {
    setGstFlag("false");
  });

  it("standard shipping + GST for small order — numbers must match pre-P2-04 exactly", async () => {
    const { calculateOrderTotals } = await import("@/lib/payments/razorpay");
    const subtotalPaise = 1_500_000; // 15000 INR
    const result = calculateOrderTotals(subtotalPaise, "standard");

    // Locked values (paise): subtotal=1500000, shipping=50000, tax=180000, total=1730000
    expect(result.subtotalPaise).toBe(1_500_000);
    expect(result.shippingCostPaise).toBe(STANDARD_PAISE); // 50000
    expect(result.shippingMethod).toBe("standard");
    expect(result.taxRate).toBe(GST_RATE);
    expect(result.taxAmountPaise).toBe(Math.round(subtotalPaise * GST_RATE)); // 180000
    expect(result.totalPaise).toBe(
      subtotalPaise + STANDARD_PAISE + Math.round(subtotalPaise * GST_RATE)
    ); // 1730000
  });

  it("free shipping above threshold — numbers must match pre-P2-04 exactly", async () => {
    const { calculateOrderTotals } = await import("@/lib/payments/razorpay");
    const subtotalPaise = 3_000_000; // 30000 INR
    const result = calculateOrderTotals(subtotalPaise, "standard");

    expect(result.shippingCostPaise).toBe(0);
    expect(result.taxAmountPaise).toBe(Math.round(subtotalPaise * GST_RATE)); // 360000
    expect(result.totalPaise).toBe(subtotalPaise + Math.round(subtotalPaise * GST_RATE)); // 3360000
  });

  it("express shipping for small order — numbers must match pre-P2-04 exactly", async () => {
    const { calculateOrderTotals } = await import("@/lib/payments/razorpay");
    const subtotalPaise = 1_000_000; // 10000 INR
    const result = calculateOrderTotals(subtotalPaise, "express");

    expect(result.shippingCostPaise).toBe(EXPRESS_PAISE); // 120000
    expect(result.taxAmountPaise).toBe(Math.round(subtotalPaise * GST_RATE)); // 120000
    expect(result.totalPaise).toBe(
      subtotalPaise + EXPRESS_PAISE + Math.round(subtotalPaise * GST_RATE)
    ); // 1240000
  });

  it("zero subtotal — numbers must match pre-P2-04 exactly", async () => {
    const { calculateOrderTotals } = await import("@/lib/payments/razorpay");
    const result = calculateOrderTotals(0, "standard");

    expect(result.subtotalPaise).toBe(0);
    expect(result.taxAmountPaise).toBe(0);
    expect(result.shippingCostPaise).toBe(STANDARD_PAISE); // 50000
    expect(result.totalPaise).toBe(STANDARD_PAISE); // 50000
  });

  it("exact free-threshold amount — numbers must match pre-P2-04 exactly", async () => {
    const { calculateOrderTotals } = await import("@/lib/payments/razorpay");
    const subtotalPaise = SHIPPING_TIERS.freeThreshold * 100; // 2500000 paise (25000 INR)
    const result = calculateOrderTotals(subtotalPaise, "standard");

    expect(result.shippingCostPaise).toBe(0);
    expect(result.taxAmountPaise).toBe(Math.round(subtotalPaise * GST_RATE)); // 300000
    expect(result.totalPaise).toBe(subtotalPaise + Math.round(subtotalPaise * GST_RATE)); // 2800000
  });

  it("free express shipping above threshold — numbers must match pre-P2-04 exactly", async () => {
    const { calculateOrderTotals } = await import("@/lib/payments/razorpay");
    const result = calculateOrderTotals(3_000_000, "express");

    expect(result.shippingCostPaise).toBe(0);
  });
});

// ── calculateOrderTotals — flag ON (inclusive math) ───────────────────────

describe("calculateOrderTotals — flag ON (GST-inclusive pricing)", () => {
  beforeEach(() => {
    setGstFlag("true");
  });

  it("does NOT add GST on top — total = subtotal + shipping only", async () => {
    const { calculateOrderTotals } = await import("@/lib/payments/razorpay");
    const subtotalPaise = 1_500_000; // 15000 INR
    const result = calculateOrderTotals(subtotalPaise, "standard");

    // GST component back-calculated for transparency: round(price * rate / (1 + rate))
    const expectedGstComponent = Math.round((subtotalPaise * GST_RATE) / (1 + GST_RATE));
    const expectedTotal = subtotalPaise + STANDARD_PAISE;

    expect(result.taxAmountPaise).toBe(expectedGstComponent);
    expect(result.totalPaise).toBe(expectedTotal);
    // total must be LESS than flag-OFF total (no tax added on top)
    expect(result.totalPaise).toBeLessThan(
      subtotalPaise + STANDARD_PAISE + Math.round(subtotalPaise * GST_RATE)
    );
  });

  it("back-calculates GST component: round(subtotal * rate / (1 + rate))", async () => {
    const { calculateOrderTotals } = await import("@/lib/payments/razorpay");
    const subtotalPaise = 3_000_000; // 30000 INR
    const result = calculateOrderTotals(subtotalPaise, "standard");

    const expectedGstComponent = Math.round((subtotalPaise * GST_RATE) / (1 + GST_RATE));
    expect(result.taxAmountPaise).toBe(expectedGstComponent); // ~321429 for 3000000 @ 12%
  });

  it("shipping tiers are unchanged — free above threshold", async () => {
    const { calculateOrderTotals } = await import("@/lib/payments/razorpay");
    const result = calculateOrderTotals(3_000_000, "standard");

    expect(result.shippingCostPaise).toBe(0);
    expect(result.totalPaise).toBe(3_000_000); // no GST added, shipping free
  });

  it("shipping tiers are unchanged — standard paid below threshold", async () => {
    const { calculateOrderTotals } = await import("@/lib/payments/razorpay");
    const result = calculateOrderTotals(1_000_000, "express");

    expect(result.shippingCostPaise).toBe(EXPRESS_PAISE); // 120000
    expect(result.totalPaise).toBe(1_000_000 + EXPRESS_PAISE); // 1120000, no added tax
  });

  it("zero subtotal — total equals shipping only, no negative values", async () => {
    const { calculateOrderTotals } = await import("@/lib/payments/razorpay");
    const result = calculateOrderTotals(0, "standard");

    expect(result.taxAmountPaise).toBe(0);
    expect(result.totalPaise).toBe(STANDARD_PAISE);
    expect(result.totalPaise).toBeGreaterThan(0);
  });
});

// ── Property invariants (both flag states) ─────────────────────────────────

describe("calculateOrderTotals — property invariants", () => {
  const cases: Array<[number, "standard" | "express", string]> = [
    [0, "standard", "zero subtotal standard"],
    [5000, "standard", "small subtotal standard"],
    [5000, "express", "small subtotal express"],
    [25000, "standard", "threshold standard"],
    [50000, "express", "large subtotal express"],
  ];

  for (const flagValue of ["false", "true"] as const) {
    describe(`flag ${flagValue}`, () => {
      beforeEach(() => setGstFlag(flagValue));

      for (const [subtotal, method, label] of cases) {
        it(`total is never negative and total >= subtotal + shippingCost [${label}]`, async () => {
          const { calculateOrderTotals } = await import("@/lib/payments/razorpay");
          const result = calculateOrderTotals(subtotal, method);

          expect(result.totalPaise).toBeGreaterThanOrEqual(0);
          expect(result.subtotalPaise).toBeGreaterThanOrEqual(0);
          expect(result.taxAmountPaise).toBeGreaterThanOrEqual(0);
          expect(result.shippingCostPaise).toBeGreaterThanOrEqual(0);
          // total must cover at minimum subtotal + shipping (tax is always >= 0)
          expect(result.totalPaise).toBeGreaterThanOrEqual(
            result.subtotalPaise + result.shippingCostPaise
          );
        });
      }
    });
  }
});

// ── FIX #4 (P6-02): GST-inclusive flag ON + discount property tests ───────────
//
// These tests verify the discount + GST-inclusive interaction:
//
//   Flag ON (GST-inclusive):
//     1. discountAmountPaise = applyDiscountToPaise(discountableBase, discount) [clamped]
//     2. discountedSubtotal = subtotalPaise - discountAmountPaise
//     3. shippingCostPaise = toShippingCostPaise(discountedSubtotal, method)
//     4. taxAmountPaise = round(discountedSubtotal * GST_RATE / (1 + GST_RATE))
//        ← backed out of the discounted all-in price for display; NOT added to total
//     5. totalPaise = max(0, discountedSubtotal + shippingCostPaise)
//        ← NO GST added on top; the all-in price is already GST-inclusive
//
// Mutation-proof: computing GST on the ORIGINAL subtotal (not discounted) gives a
// different taxAmountPaise — and the total would be wrong if tax were added on top.

describe("calculateOrderTotals — flag ON + discount (FIX #4)", () => {
  beforeEach(() => {
    setGstFlag("true");
  });

  function makeDiscount(overrides: Partial<ValidatedDiscount> = {}): ValidatedDiscount {
    return {
      id: "disc-gst-001",
      code: "SAVE10",
      type: "percent",
      value: 10,
      minSubtotalPaise: 0,
      collectionId: null,
      startsAt: null,
      endsAt: null,
      usageLimit: null,
      usageCount: 0,
      ...overrides,
    };
  }

  it("totalPaise = discountedSubtotal + shippingCost (no GST added on top)", async () => {
    const { calculateOrderTotals } = await import("@/lib/payments/razorpay");
    const subtotal = 1_500_000; // ₹15,000
    const discount = makeDiscount({ type: "percent", value: 10 }); // 10% off

    const result = calculateOrderTotals(subtotal, "standard", discount);

    const discountAmount = Math.round(subtotal * 0.10); // 150_000
    const discountedSubtotal = subtotal - discountAmount; // 1_350_000
    // Shipping on discountedSubtotal: ₹13,500 < ₹25,000 threshold → paid standard
    const expectedShipping = STANDARD_PAISE; // 50_000
    // GST backed out: round(1_350_000 * 0.12 / 1.12) for display only
    const expectedTax = Math.round((discountedSubtotal * GST_RATE) / (1 + GST_RATE));
    // Total = discountedSubtotal + shipping ONLY (no GST on top)
    const expectedTotal = discountedSubtotal + expectedShipping;

    expect(result.discountAmountPaise).toBe(discountAmount);
    expect(result.taxAmountPaise).toBe(expectedTax);
    expect(result.totalPaise).toBe(expectedTotal);
    // Critical: total must NOT include the tax amount (it's backed out for display)
    expect(result.totalPaise).not.toBe(discountedSubtotal + expectedShipping + expectedTax);
  });

  it("taxAmountPaise is backed out of the DISCOUNTED subtotal (not the original)", async () => {
    const { calculateOrderTotals } = await import("@/lib/payments/razorpay");
    const subtotal = 2_000_000; // ₹20,000
    const discount = makeDiscount({ type: "fixed", value: 200_000 }); // ₹2,000 off

    const result = calculateOrderTotals(subtotal, "standard", discount);

    const discountedSubtotal = subtotal - 200_000; // 1_800_000
    const taxOnDiscounted = Math.round((discountedSubtotal * GST_RATE) / (1 + GST_RATE));
    const taxOnOriginal = Math.round((subtotal * GST_RATE) / (1 + GST_RATE));

    // The two tax amounts differ — confirming the test is mutation-meaningful.
    expect(taxOnDiscounted).not.toBe(taxOnOriginal);

    // The implementation must back out GST from the DISCOUNTED subtotal.
    expect(result.taxAmountPaise).toBe(taxOnDiscounted);
    expect(result.taxAmountPaise).not.toBe(taxOnOriginal);
  });

  it("discountAmountPaise is clamped — never exceeds subtotal (flag ON)", async () => {
    const { calculateOrderTotals } = await import("@/lib/payments/razorpay");
    const subtotal = 500_000; // ₹5,000
    // Fixed discount larger than the subtotal
    const discount = makeDiscount({ type: "fixed", value: 10_000_000 }); // ₹100,000 — way above subtotal

    const result = calculateOrderTotals(subtotal, "standard", discount);

    // Clamped: discount cannot exceed the subtotal
    expect(result.discountAmountPaise).toBe(subtotal); // clamped to 500_000
    expect(result.discountAmountPaise).toBeLessThanOrEqual(subtotal);
    // totalPaise >= 0 even with full discount applied
    expect(result.totalPaise).toBeGreaterThanOrEqual(0);
    // discountedSubtotal = 0 → shipping might still apply (below free threshold)
    // total = 0 + shippingCostPaise ≥ 0
    expect(result.totalPaise).toBeGreaterThanOrEqual(0);
  });

  it("totalPaise is never negative for generated (subtotal, discount) pairs — flag ON property", async () => {
    const { calculateOrderTotals } = await import("@/lib/payments/razorpay");
    const subtotals = [0, 1, 100, 10_000, 100_000, 500_000, 1_000_000, 5_000_000];
    const discounts: ValidatedDiscount[] = [
      makeDiscount({ type: "percent", value: 0 }),
      makeDiscount({ type: "percent", value: 10 }),
      makeDiscount({ type: "percent", value: 50 }),
      makeDiscount({ type: "percent", value: 100 }),
      makeDiscount({ type: "percent", value: 110 }), // over 100% — clamped
      makeDiscount({ type: "fixed", value: 0 }),
      makeDiscount({ type: "fixed", value: 50_000 }),
      makeDiscount({ type: "fixed", value: 99_999_999 }), // way above any subtotal
    ];

    for (const subtotal of subtotals) {
      for (const discount of discounts) {
        const result = calculateOrderTotals(subtotal, "standard", discount);
        expect(
          result.totalPaise,
          `totalPaise must be >= 0 for subtotal=${subtotal} discount=${JSON.stringify({ type: discount.type, value: discount.value })}`
        ).toBeGreaterThanOrEqual(0);
        expect(
          result.discountAmountPaise,
          `discountAmountPaise must be >= 0 (subtotal=${subtotal})`
        ).toBeGreaterThanOrEqual(0);
        expect(
          result.taxAmountPaise,
          `taxAmountPaise must be >= 0 (subtotal=${subtotal})`
        ).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("mutation-proof: computing GST on the original subtotal (not discounted) gives wrong tax — flag ON", async () => {
    const { calculateOrderTotals } = await import("@/lib/payments/razorpay");
    // Only meaningful when discount > 0 so the two subtotals differ.
    const subtotal = 1_000_000; // ₹10,000
    const discount = makeDiscount({ type: "fixed", value: 300_000 }); // ₹3,000 off

    const result = calculateOrderTotals(subtotal, "standard", discount);

    const discountedSubtotal = subtotal - 300_000; // 700_000
    const correctTax = Math.round((discountedSubtotal * GST_RATE) / (1 + GST_RATE));
    const wrongTax = Math.round((subtotal * GST_RATE) / (1 + GST_RATE));

    // The two values are different (sanity — confirms the mutation is detectable).
    expect(correctTax).not.toBe(wrongTax);

    // The implementation must use the discounted subtotal.
    expect(result.taxAmountPaise).toBe(correctTax);
    // If it had used the original subtotal, this would differ.
    expect(result.taxAmountPaise).not.toBe(wrongTax);

    // Total formula (flag ON): discountedSubtotal + shipping (no GST on top)
    const expectedTotal = discountedSubtotal + result.shippingCostPaise;
    expect(result.totalPaise).toBe(expectedTotal);
    // A wrong implementation that adds GST would produce a higher total.
    const wrongTotal = discountedSubtotal + result.shippingCostPaise + wrongTax;
    expect(result.totalPaise).not.toBe(wrongTotal);
  });

  it("percent discount with flag ON: formula is correct end-to-end for several inputs", async () => {
    const { calculateOrderTotals } = await import("@/lib/payments/razorpay");
    const inputs: Array<{ subtotal: number; pct: number }> = [
      { subtotal: 500_000, pct: 5 },
      { subtotal: 1_000_000, pct: 15 },
      { subtotal: 2_000_000, pct: 20 },
      { subtotal: 3_000_000, pct: 10 }, // above free-shipping threshold
    ];

    for (const { subtotal, pct } of inputs) {
      const discount = makeDiscount({ type: "percent", value: pct });
      const result = calculateOrderTotals(subtotal, "standard", discount);

      const discountAmount = Math.round(subtotal * (pct / 100));
      const discountedSubtotal = subtotal - discountAmount;
      const expectedTax = Math.round((discountedSubtotal * GST_RATE) / (1 + GST_RATE));
      const expectedTotal = discountedSubtotal + result.shippingCostPaise; // no GST on top

      expect(result.discountAmountPaise, `pct=${pct} subtotal=${subtotal}`).toBe(discountAmount);
      expect(result.taxAmountPaise, `pct=${pct} subtotal=${subtotal}`).toBe(expectedTax);
      expect(result.totalPaise, `pct=${pct} subtotal=${subtotal}`).toBe(expectedTotal);
      expect(result.totalPaise).toBeGreaterThanOrEqual(0);
    }
  });
});
