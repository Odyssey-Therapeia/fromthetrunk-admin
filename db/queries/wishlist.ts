/**
 * P6-04: Wishlist DB queries — auth-scoped per user.
 *
 * All mutations include userId in the WHERE / VALUES so a user cannot
 * read or modify another user's wishlist (no IDOR).
 *
 * mergeGuestWishlist: called on login to fold a guest (cookie-backed)
 * wishlist into the account row. De-duplicated via onConflictDoNothing.
 */

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { restockNotifyRequests, wishlistItems } from "@/db/schema";

// ── Read ─────────────────────────────────────────────────────────────────────

/**
 * Return all product IDs in a user's wishlist.
 * Auth-scoped: WHERE user_id = :userId.
 */
export async function listWishlistProductIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({ productId: wishlistItems.productId })
    .from(wishlistItems)
    .where(eq(wishlistItems.userId, userId));

  return rows.map((row) => row.productId);
}

// ── Mutations ─────────────────────────────────────────────────────────────────

/**
 * Add a product to a user's wishlist. Idempotent — duplicate inserts
 * are silently ignored via ON CONFLICT DO NOTHING.
 */
export async function addToWishlist(userId: string, productId: string): Promise<void> {
  await db
    .insert(wishlistItems)
    .values({ userId, productId })
    .onConflictDoNothing();
}

/**
 * Remove a product from a user's wishlist.
 * Auth-scoped: WHERE user_id = :userId AND product_id = :productId.
 * A user cannot remove items from another user's list.
 */
export async function removeFromWishlist(userId: string, productId: string): Promise<void> {
  await db
    .delete(wishlistItems)
    .where(
      and(
        eq(wishlistItems.userId, userId),
        eq(wishlistItems.productId, productId)
      )
    );
}

/**
 * Merge a guest (cookie-backed) wishlist into a user account on login.
 * De-duplicated — any productId already in the account wishlist is skipped.
 * No data is lost and no cross-user merge can occur (userId is fixed).
 */
export async function mergeGuestWishlist(
  userId: string,
  guestProductIds: string[]
): Promise<void> {
  if (guestProductIds.length === 0) return;

  const values = guestProductIds.map((productId) => ({ userId, productId }));
  await db.insert(wishlistItems).values(values).onConflictDoNothing();
}

// ── Restock notify ────────────────────────────────────────────────────────────

/**
 * Record a restock-notify intent for a sold/reserved item.
 * Composite PK (product_id, email) ensures at-most-one request per email per product.
 * userId is nullable — guests identify by email only.
 */
export async function upsertRestockNotifyRequest(
  productId: string,
  email: string,
  userId?: string
): Promise<void> {
  await db
    .insert(restockNotifyRequests)
    .values({ productId, email, userId: userId ?? null })
    .onConflictDoNothing();
}
