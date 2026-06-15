/**
 * P6-02: Server-side discount validation and application.
 *
 * ARCHITECTURE NOTE:
 * - This module is the ONLY place discount amounts are computed.
 * - The client sends only the discount CODE; the server looks up the discount,
 *   validates all constraints, and computes the authoritative discount amount.
 * - No client-supplied monetary amount is ever trusted.
 *
 * GST ORDER (P6-02 design decision, flagged and documented):
 *   Flag OFF (default / GST-exclusive):
 *     1. Compute rawSubtotal from item prices.
 *     2. Apply discount → discountedSubtotal = clamp(rawSubtotal - discountAmount, 0).
 *     3. Compute GST on discountedSubtotal (not on rawSubtotal).
 *     4. total = discountedSubtotal + shipping + GST(discountedSubtotal)
 *
 *   Flag ON (GST-inclusive):
 *     1. rawSubtotal is already all-in (prices include GST).
 *     2. Apply discount → discountedSubtotal = clamp(rawSubtotal - discountAmount, 0).
 *     3. Back-calculate taxAmountPaise from discountedSubtotal for display only.
 *     4. total = discountedSubtotal + shipping (no GST added; already included).
 *
 * "Discount reduces the all-in number" (packet spec): the discount is applied
 * to the product subtotal before any additional tax computation. In exclusive
 * mode, tax is then computed on the reduced base. In inclusive mode, the
 * all-in price is already the base, so the discount simply reduces it.
 */

export type DiscountType = "percent" | "fixed";

/**
 * The validated discount row, ready for application in calculateOrderTotals.
 * This is the shape returned from the DB query and passed to the calculation path.
 */
export type ValidatedDiscount = {
  id: string;
  code: string;
  type: DiscountType;
  /** For percent: 0–100 (percent points). For fixed: paise amount. */
  value: number;
  minSubtotalPaise: number;
  collectionId: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  usageLimit: number | null;
  usageCount: number;
};

export type DiscountValidationInput = {
  subtotalPaise: number;
  itemProductIds: string[];
  /** Required when discount.collectionId is set; list of product IDs in that collection. */
  collectionProductIds?: string[];
  now: Date;
  usageCount: number;
};

export type DiscountValidationResult =
  | { valid: true }
  | { valid: false; error: string };

/**
 * Validate all business constraints for a discount code.
 * Returns { valid: true } if all constraints pass, or { valid: false, error } otherwise.
 *
 * Constraints checked (each mutation-proven in tests):
 *   1. Validity window: startsAt ≤ now ≤ endsAt
 *   2. Min subtotal: subtotalPaise ≥ minSubtotalPaise
 *   3. Usage limit: usageCount < usageLimit (if limit is set)
 *   4. Collection scope: at least one item is in the required collection (if collectionId is set)
 */
export function validateDiscountCode(
  discount: ValidatedDiscount,
  input: DiscountValidationInput
): DiscountValidationResult {
  const { subtotalPaise, itemProductIds, collectionProductIds, now, usageCount } = input;

  // 1. Validity window — startsAt
  if (discount.startsAt !== null && now < discount.startsAt) {
    return { valid: false, error: "Discount code is not yet active." };
  }

  // 1. Validity window — endsAt
  if (discount.endsAt !== null && now > discount.endsAt) {
    return { valid: false, error: "Discount code has expired." };
  }

  // 2. Min subtotal
  if (subtotalPaise < discount.minSubtotalPaise) {
    return {
      valid: false,
      error: `Discount requires a minimum order of ₹${Math.round(discount.minSubtotalPaise / 100).toLocaleString("en-IN")}.`,
    };
  }

  // 3. Usage limit
  if (discount.usageLimit !== null && usageCount >= discount.usageLimit) {
    return { valid: false, error: "Discount code has reached its usage limit." };
  }

  // 4. Collection scope
  if (discount.collectionId !== null) {
    const collectionSet = new Set(collectionProductIds ?? []);
    const hasCollectionItem = itemProductIds.some((id) => collectionSet.has(id));
    if (!hasCollectionItem) {
      return {
        valid: false,
        error: "Discount code is not applicable to the items in your order.",
      };
    }
  }

  return { valid: true };
}

/**
 * Compute the raw discount amount in paise for the given subtotal.
 *
 * CLAMP: The returned value is clamped to [0, subtotalPaise] so the
 * discounted subtotal never goes negative.
 *
 * For percent: amount = round(subtotalPaise × value / 100), clamped to subtotalPaise.
 * For fixed: amount = min(value, subtotalPaise).
 */
export function applyDiscountToPaise(
  subtotalPaise: number,
  discount: Pick<ValidatedDiscount, "type" | "value">
): number {
  if (subtotalPaise <= 0) return 0;

  if (discount.type === "percent") {
    const raw = Math.round(subtotalPaise * (discount.value / 100));
    return Math.min(raw, subtotalPaise);
  }

  // fixed
  return Math.min(discount.value, subtotalPaise);
}
