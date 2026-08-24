/**
 * The ONE way a held product returns to AVAILABLE.
 *
 * SERVER ONLY. Never import from a client component.
 *
 * A release used to be open-coded at four call sites, and they had drifted:
 * some reset `quantity_available`, some did not; some deleted the inventory-v2
 * reservation rows, some did not. That drift is not cosmetic. `deriveStockStatus`
 * reads quantity plus the LIVE reservation-row count, so a release that clears
 * `stock_status` but leaves the reservation row behind produces a product that
 * is "available" to v1 read paths and still "reserved" to every v2 read path —
 * the PDP, the feeds, the Merchant readiness audit — until the row expires on
 * its own. With the Merchant inventory reconciler consuming the v2 view, that
 * would pin a perfectly saleable saree to OUT_OF_STOCK in Google.
 *
 * CANONICAL RELEASE, all four facts together:
 *   stock_status       = 'available'
 *   quantity_available = 1
 *   reserved_until     = NULL
 *   reservation rows   = deleted
 *
 * SAFETY: the product UPDATE is conditional on `stock_status = 'reserved'`. A
 * sold product can therefore never be resurrected by a late webhook, a retried
 * callback or an expiry sweep — which matters more than ever now that an
 * available saree is automatically re-advertised to Google.
 *
 * NOT the caller's decision to skip: refusing to release a PAID order is the
 * caller's responsibility, because only the caller knows the order's payment
 * state. `completePaidOrder` deliberately does not use this helper — a paid
 * product goes to `sold`, not back to `available`.
 */

import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import {
  releaseReservationsByOrder,
  releaseReservationsByProducts,
} from "@/db/queries/reservations";
import { products } from "@/db/schema";

export type ReleaseReservationInput = {
  /** The products to return to available. Empty is a no-op. */
  productIds: string[];
  /**
   * When present, reservation rows are cleared for the whole ORDER rather than
   * per product — the correct scope for a cancelled or failed checkout, since
   * it also removes rows for items that were never successfully claimed.
   */
  orderId?: null | string;
};

export type ReleaseReservationResult = {
  /** Rows that were actually reserved and have now been freed. */
  released: number;
};

/**
 * Return held products to canonical AVAILABLE state.
 *
 * Idempotent: a second call finds nothing in `reserved` state, releases zero
 * rows and deletes no reservation rows that are not there. Safe to call from a
 * retried webhook.
 */
export async function releaseProductReservations(
  input: ReleaseReservationInput,
): Promise<ReleaseReservationResult> {
  const productIds = Array.from(new Set(input.productIds)).filter(Boolean);

  if (productIds.length === 0) return { released: 0 };

  const releasedRows = await db
    .update(products)
    .set({
      quantityAvailable: 1,
      reservedUntil: null,
      stockStatus: "available",
      updatedAt: new Date(),
    })
    // Conditional: only a RESERVED product is releasable. Never a sold one.
    .where(
      and(
        inArray(products.id, productIds),
        eq(products.stockStatus, "reserved"),
      ),
    )
    .returning({ id: products.id });

  // Dual-write, ALWAYS — matching the release-reservations cron and
  // completePaidOrder. Leaving a stale row behind is exactly the inconsistency
  // this helper exists to prevent, and deleting one when inventory v2 is off is
  // harmless because nothing reads it then.
  if (input.orderId) {
    await releaseReservationsByOrder(input.orderId);
  } else {
    await releaseReservationsByProducts(productIds);
  }

  return { released: releasedRows.length };
}
