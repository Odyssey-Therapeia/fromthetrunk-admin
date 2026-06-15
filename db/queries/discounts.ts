/**
 * P6-02: Discount code DB queries.
 *
 * All discount amount computation happens in lib/discounts/validate.ts +
 * lib/payments/razorpay.ts (calculateOrderTotals). This layer is ONLY
 * responsible for persistence: lookup, CRUD, and usage-count increment.
 */
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { InferInsertModel, InferSelectModel } from "drizzle-orm";

import { db, withRetry } from "@/db";
import { discounts } from "@/db/schema";
import type { ValidatedDiscount } from "@/lib/discounts/validate";

export type DiscountRow = InferSelectModel<typeof discounts>;
export type InsertDiscountInput = Omit<
  InferInsertModel<typeof discounts>,
  "id" | "createdAt" | "updatedAt" | "usageCount"
>;

/**
 * Look up an active discount by code (case-insensitive).
 * Returns null if the code does not exist or the discount is inactive.
 */
export async function findDiscountByCode(code: string): Promise<DiscountRow | null> {
  const [row] = await withRetry(() =>
    db
      .select()
      .from(discounts)
      .where(
        and(
          eq(sql`UPPER(${discounts.code})`, code.toUpperCase()),
          eq(discounts.active, true)
        )
      )
      .limit(1)
  );

  return row ?? null;
}

/**
 * Convert a DB row to the ValidatedDiscount shape used by the calculation layer.
 * This ensures the calculation layer never touches raw DB types.
 */
export function toValidatedDiscount(row: DiscountRow): ValidatedDiscount {
  return {
    id: row.id,
    code: row.code,
    type: row.type,
    value: row.value,
    minSubtotalPaise: row.minSubtotalPaise,
    collectionId: row.collectionId ?? null,
    startsAt: row.startsAt ?? null,
    endsAt: row.endsAt ?? null,
    usageLimit: row.usageLimit ?? null,
    usageCount: row.usageCount,
  };
}

/**
 * Increment usageCount atomically for a discount, enforcing the usage cap.
 *
 * P6-02 (MAJOR FIX): The UPDATE is conditional — it only applies when
 *   usage_count < usage_limit (or when usage_limit IS NULL for unlimited codes).
 * This closes the over-redemption hole where a code at its limit could be
 * incremented by a concurrent payment confirmation that validated the code
 * before the count reached the limit.
 *
 * Returns true when the increment succeeded, false when the code had already
 * reached its limit (caller should flag the order for review).
 *
 * Called after a successful order payment confirmation (winner branch in
 * complete-paid-order.ts), NOT at order creation time.
 */
export async function incrementDiscountUsage(discountId: string): Promise<boolean> {
  const rows = await withRetry(() =>
    db
      .update(discounts)
      .set({
        usageCount: sql`${discounts.usageCount} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(discounts.id, discountId),
          // Only increment when under the limit (or when limit is NULL = unlimited).
          or(
            isNull(discounts.usageLimit),
            lt(discounts.usageCount, discounts.usageLimit)
          )
        )
      )
      .returning({ id: discounts.id })
  );

  return rows.length > 0;
}

// ─── Admin CRUD ───────────────────────────────────────────────────────────────

export async function listDiscounts(): Promise<DiscountRow[]> {
  return withRetry(() =>
    db
      .select()
      .from(discounts)
      .orderBy(discounts.createdAt)
  );
}

export async function getDiscount(id: string): Promise<DiscountRow | null> {
  const [row] = await withRetry(() =>
    db.select().from(discounts).where(eq(discounts.id, id)).limit(1)
  );
  return row ?? null;
}

export async function createDiscount(input: InsertDiscountInput): Promise<DiscountRow> {
  const [row] = await withRetry(() =>
    db
      .insert(discounts)
      .values({
        ...input,
        // Normalise code to UPPER on insert so lookups (also UPPER) always match.
        code: input.code.toUpperCase().trim(),
        usageCount: 0,
      })
      .returning()
  );

  if (!row) throw new Error("Failed to create discount.");
  return row;
}

export type UpdateDiscountInput = Partial<Omit<InsertDiscountInput, "code">> & {
  code?: string;
  active?: boolean;
};

export async function updateDiscount(
  id: string,
  input: UpdateDiscountInput
): Promise<DiscountRow> {
  const patch: Record<string, unknown> = {
    ...input,
    updatedAt: new Date(),
  };
  if (input.code !== undefined) {
    patch.code = input.code.toUpperCase().trim();
  }

  const [row] = await withRetry(() =>
    db.update(discounts).set(patch).where(eq(discounts.id, id)).returning()
  );

  if (!row) throw new Error("Discount not found.");
  return row;
}

export async function deleteDiscount(id: string): Promise<void> {
  await withRetry(() => db.delete(discounts).where(eq(discounts.id, id)));
}

export async function setDiscountActive(id: string, active: boolean): Promise<DiscountRow> {
  const [row] = await withRetry(() =>
    db
      .update(discounts)
      .set({ active, updatedAt: new Date() })
      .where(eq(discounts.id, id))
      .returning()
  );

  if (!row) throw new Error("Discount not found.");
  return row;
}
