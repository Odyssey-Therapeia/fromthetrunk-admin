/**
 * P2-05: Inventory v2 — reservation query helpers.
 *
 * insertReservation: conditional claim — succeeds only if quantity_available >= qty.
 *   Throws "QUANTITY_INSUFFICIENT" otherwise.
 *
 * expireReservations: deletes expired rows from the reservations table.
 *   Called by the release-reservations cron (dual-write alongside the existing
 *   stock_status reset on products).
 *
 * These functions are imported into:
 *   - api/hono/routes/payments.ts  (insertReservation, flag-gated behind isInventoryV2)
 *   - api/hono/routes/cron.ts      (expireReservations, always runs for dual-write)
 */

import { and, eq, lt } from "drizzle-orm";

import { db } from "@/db";
import { products, reservations } from "@/db/schema";

export interface InsertReservationInput {
  orderId: string;
  productId: string;
  qty: number;
  expiresAt: Date;
}

/**
 * Conditional reservation claim.
 *
 * 1. Reads quantity_available for the product.
 * 2. If quantity_available < qty → throws "QUANTITY_INSUFFICIENT".
 * 3. Otherwise inserts a reservations row and returns it.
 *
 * Note: this is NOT a single atomic SQL statement today (that requires a
 * database-level INSERT … WHERE or CTE). For the one-of-one model, the
 * upstream stockStatus atomic claim (flag OFF path) remains the primary
 * concurrency guard. The flag ON path adds the quantity check as a
 * defence-in-depth pre-check before delegating to the same stockStatus
 * update; full atomic v2 claim is a future upgrade (P4-05).
 */
export async function insertReservation(input: InsertReservationInput): Promise<{ id: string }> {
  const [row] = await db
    .select({ quantityAvailable: products.quantityAvailable })
    .from(products)
    .where(eq(products.id, input.productId))
    .limit(1);

  if (!row || row.quantityAvailable < input.qty) {
    throw new Error("QUANTITY_INSUFFICIENT");
  }

  const [inserted] = await db
    .insert(reservations)
    .values({
      expiresAt: input.expiresAt,
      orderId: input.orderId,
      productId: input.productId,
      qty: input.qty,
    })
    .returning({ id: reservations.id });

  if (!inserted) {
    throw new Error("RESERVATION_INSERT_FAILED");
  }

  return inserted;
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
