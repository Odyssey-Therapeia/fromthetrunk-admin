/**
 * P2-05: Inventory v2 compat layer.
 *
 * All existing UI/feed code continues to read stockStatus directly from the
 * products table (unchanged). This pure helper makes stockStatus derivable from
 * the new quantity_available + active-reservations-count columns so that the two
 * representations stay consistent and can be cross-validated.
 *
 * No database I/O — intentionally pure so it can be unit-tested without mocks.
 */

export type StockStatus = "available" | "reserved" | "sold";

export interface InventoryState {
  /** products.quantity_available — the new v2 column */
  quantityAvailable: number;
  /** count of non-expired rows in the reservations table for this product */
  activeReservationsCount: number;
}

/**
 * Derive the canonical stockStatus value from inventory v2 state.
 *
 * Rules (one-of-one model):
 *   - qty = 0                      → "sold"  (physically gone, reservations irrelevant)
 *   - qty >= 1 and reservations > 0 → "reserved"  (someone holds it)
 *   - qty >= 1 and reservations = 0 → "available"
 *
 * This function is the bridge between the new (quantity + reservations) world
 * and the existing stockStatus enum that all read paths consume.
 */
export function deriveStockStatus({
  quantityAvailable,
  activeReservationsCount,
}: InventoryState): StockStatus {
  if (quantityAvailable <= 0) {
    return "sold";
  }
  if (activeReservationsCount > 0) {
    return "reserved";
  }
  return "available";
}
