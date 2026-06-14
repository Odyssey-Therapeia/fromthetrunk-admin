/**
 * P2-05 / P4-05: Inventory v2 — reservation query helpers.
 *
 * insertReservation: ATOMIC single-statement quantity pre-check — a single SQL round-trip:
 *   INSERT INTO reservations (...) SELECT ... FROM products
 *   WHERE id = $productId AND quantity_available >= $qty
 *   RETURNING id
 *
 *   If the WHERE predicate fails (qty=0 or product not found), the INSERT
 *   produces no rows and the function throws "QUANTITY_INSUFFICIENT".
 *   Because the quantity check and the row insertion are in the same SQL statement,
 *   this eliminates the P2-05 read-then-insert race window.
 *
 *   NOTE: insertReservation is a quantity pre-check, NOT the authoritative oversell
 *   guard. It does NOT decrement quantity_available, and the reservations table has no
 *   unique constraint on product_id. Therefore two concurrent callers can both insert
 *   reservation rows if quantity_available is still >= qty for both (e.g. the first
 *   insert does not decrement the count). The authoritative concurrency guard is the
 *   atomic UPDATE products SET stock_status='reserved' ... WHERE stock_status='available'
 *   (or expired-reserved) RETURNING id in api/hono/routes/payments.ts, which runs in
 *   both flag states and is the single serialization point for oversell prevention.
 *   (P4-05: replaces the non-atomic read-then-insert from P2-05.)
 *
 * expireReservations: deletes expired rows from the reservations table.
 *   Called by the release-reservations cron (dual-write alongside the existing
 *   stock_status reset on products).
 *
 * These functions are imported into:
 *   - api/hono/routes/payments.ts  (insertReservation, flag-gated behind isInventoryV2)
 *   - api/hono/routes/cron.ts      (expireReservations, always runs for dual-write)
 */

import { and, count, eq, gt, inArray, lt } from "drizzle-orm";

import { db, rawSql } from "@/db";
import { products, reservations } from "@/db/schema";

export interface InsertReservationInput {
  orderId: string;
  productId: string;
  qty: number;
  expiresAt: Date;
}

/**
 * Atomic single-statement quantity pre-check (P4-05).
 *
 * Uses a single INSERT ... SELECT ... WHERE statement so the quantity check
 * and the reservation row insertion happen in one DB round-trip, eliminating
 * the P2-05 read-then-insert race window.
 *
 * This function is a pre-check, NOT the authoritative oversell guard.
 * quantity_available is not decremented by this INSERT, and there is no unique
 * constraint on product_id in reservations, so two concurrent callers can both
 * succeed if both find quantity_available >= qty at evaluation time.
 * The authoritative concurrency guard is the atomic UPDATE products
 * SET stock_status='reserved' ... WHERE stock_status='available' (or
 * expired-reserved) RETURNING id in api/hono/routes/payments.ts; that UPDATE
 * runs in both flag states and is the single serialization point.
 *
 * Returns { id } of the inserted reservation row.
 * Throws "QUANTITY_INSUFFICIENT" if no row was inserted (qty=0 or product not found).
 */
export async function insertReservation(input: InsertReservationInput): Promise<{ id: string }> {
  // Single round-trip: INSERT only if quantity_available >= qty.
  // rawSql is the Neon sql tag (neon<false, false>) that executes raw SQL
  // and returns an array of typed rows.
  const rows = (await rawSql`
    INSERT INTO reservations (order_id, product_id, qty, expires_at)
    SELECT
      ${input.orderId}::uuid,
      ${input.productId}::uuid,
      ${input.qty}::integer,
      ${input.expiresAt}::timestamptz
    FROM products
    WHERE id = ${input.productId}::uuid
      AND quantity_available >= ${input.qty}::integer
    RETURNING id
  `) as Array<{ id: string }>;

  if (!rows[0]) {
    throw new Error("QUANTITY_INSUFFICIENT");
  }

  return { id: rows[0].id };
}

/**
 * Expire reservation rows whose expiresAt is before `asOf`.
 *
 * Called by the release-reservations cron alongside the existing stock_status
 * reset on products. Returns the number of rows deleted.
 */
export async function expireReservations(asOf: Date): Promise<{ deleted: number }> {
  const result = await db
    .delete(reservations)
    .where(lt(reservations.expiresAt, asOf));

  // Drizzle's pg driver exposes rowCount on the raw result; fall back to 0.
  const deleted = (result as unknown as { rowCount?: number }).rowCount ?? 0;
  return { deleted };
}

/**
 * Release (delete) all reservation rows for a given order.
 * Called in the sold path to clean up the hold after payment completes.
 */
export async function releaseReservationsByOrder(orderId: string): Promise<void> {
  await db
    .delete(reservations)
    .where(and(eq(reservations.orderId, orderId)));
}

/**
 * Release (delete) all reservation rows for a given set of product IDs.
 * Used in the rollback path when the stockStatus atomic claim fails.
 */
export async function releaseReservationsByProducts(productIds: string[]): Promise<void> {
  if (productIds.length === 0) return;

  // Import inArray lazily to keep the module's top-level imports clean.
  const { inArray } = await import("drizzle-orm");
  await db
    .delete(reservations)
    .where(inArray(reservations.productId, productIds));
}

/**
 * P4-05: Count non-expired reservation rows for a product.
 *
 * Used by the PDP when isInventoryV2() is ON to derive availability via
 * deriveStockStatus(quantityAvailable, activeReservationsCount).
 * When the flag is OFF this function is NOT called — the PDP reads stockStatus directly.
 *
 * NOTE (P5 feeds mapping): lib/ports/catalog-search.ts availability filter
 * currently reads stockStatus directly. When P5 wires feeds, availability
 * counts should call this function (or a batch variant) to stay consistent
 * with the v2 source of truth.
 */
export async function getActiveReservationsCount(
  productId: string,
  asOf: Date = new Date()
): Promise<number> {
  const [result] = await db
    .select({ total: count() })
    .from(reservations)
    .where(
      and(
        eq(reservations.productId, productId),
        gt(reservations.expiresAt, asOf)
      )
    );
  return result?.total ?? 0;
}

/**
 * P5-01: Batch variant of getActiveReservationsCount.
 *
 * Fetches non-expired reservation counts for a set of product IDs in ONE
 * query (one round-trip, not N). Used by the Google Merchant feed and the
 * Meta catalog feed so that availability can be derived via deriveStockStatus
 * for ALL eligible products without N+1 queries.
 *
 * Returns a Map<productId, activeReservationCount>.
 * Products with zero reservations are NOT present in the map
 * (callers should default to 0 for missing keys).
 */
export async function getBatchActiveReservationsCounts(
  productIds: string[],
  asOf: Date = new Date()
): Promise<Map<string, number>> {
  if (productIds.length === 0) return new Map();

  const rows = await db
    .select({ productId: reservations.productId, total: count() })
    .from(reservations)
    .where(
      and(
        inArray(reservations.productId, productIds),
        gt(reservations.expiresAt, asOf)
      )
    )
    .groupBy(reservations.productId);

  const result = new Map<string, number>();
  for (const row of rows) {
    result.set(row.productId, row.total);
  }
  return result;
}
