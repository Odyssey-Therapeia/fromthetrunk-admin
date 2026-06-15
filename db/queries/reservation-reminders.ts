/**
 * P5-07: Reservation-expiry / abandoned-checkout reminder email.
 *
 * sendReservationExpiryReminders():
 *   1. SELECT: orders with paymentStatus='pending', createdAt older than the
 *      hold window (RAZORPAY_PAYMENT_LINK_HOLD_MINUTES), and reminder_sent_at IS NULL.
 *      JOINs order_items and products to read availability columns;
 *      LEFT JOINs users to resolve the email for registered orders.
 *
 *      DURABLE ANCHOR: eligibility is gated on orders.createdAt (not the
 *      ephemeral reservations table). The release-reservations cron deletes
 *      reservation rows after expiry, so INNER JOINing reservations would
 *      silently drop orders that should still be reminded. orders.createdAt
 *      persists forever and is the reliable signal that the hold window passed.
 *
 *   2. AVAILABILITY GATE: skip any order whose product is now "sold"
 *      (quantityAvailable=0 or deriveStockStatus returns "sold").
 *   3. SEND: one transactional email per eligible order via lib/email/send.ts.
 *      Error-isolated: one failing send does NOT halt the batch.
 *      sendEmail boolean: reminderSentAt is ONLY set when sendEmail returns true.
 *   4. DEDUPE: set orders.reminder_sent_at = NOW() after each successful send.
 *
 * OUT OF SCOPE: marketing copy, win-back campaigns, control-centre display.
 */

import { and, eq, isNull, lt } from "drizzle-orm";

import { db } from "@/db";
import { deriveStockStatus } from "@/db/inventory";
import { getActiveReservationsCount } from "@/db/queries/reservations";
import { orderItems, orders, products, users } from "@/db/schema";
import { sendEmail } from "@/lib/email/send";
import { reservationExpiryReminderEmail } from "@/lib/email/templates";
import { createLogger } from "@/lib/log";
import { RAZORPAY_PAYMENT_LINK_HOLD_MINUTES } from "@/lib/payments/razorpay";

const log = createLogger("cron:reservation-expiry-reminder");

export interface ReminderResult {
  /** Number of emails successfully sent. */
  sent: number;
  /** Number of orders skipped because the item is already sold. */
  skippedSold: number;
  /** Number of orders skipped because no recipient email was resolvable. */
  skippedNoEmail: number;
  /** Number of send errors (the order was eligible but the send failed or returned false). */
  errors: number;
}

/**
 * Find expired pending orders not yet reminded, check live availability,
 * and send one transactional email per eligible order.
 *
 * Called by the /api/v2/cron/send-reservation-expiry-reminders route.
 */
export async function sendReservationExpiryReminders(): Promise<ReminderResult> {
  const now = new Date();

  // The hold-window cutoff: orders created before this timestamp have had their
  // payment window expire. Using orders.createdAt is DURABLE — it persists even
  // after the release-reservations cron deletes the corresponding reservation rows.
  const holdWindowMs = RAZORPAY_PAYMENT_LINK_HOLD_MINUTES * 60 * 1000;
  const windowCutoff = new Date(now.getTime() - holdWindowMs);

  // ── QUERY ─────────────────────────────────────────────────────────────────
  //
  // WHERE:
  //   paymentStatus = 'pending'                         (only abandoned / not-yet-paid)
  //   orders.createdAt < (now - hold_window_minutes)    (payment window has elapsed)
  //   orders.reminder_sent_at IS NULL                   (not yet reminded — dedupe guard)
  //
  // JOIN strategy:
  //   INNER JOIN orderItems  — every pending order must have items
  //   INNER JOIN products    — to read quantityAvailable for the availability gate
  //   LEFT  JOIN users       — to resolve email for registered orders
  //
  // NO JOIN on reservations: reservation rows are deleted by the release-reservations
  // cron BEFORE this cron runs. Joining on reservations would exclude orders whose
  // reservation was already swept, causing them to never receive a reminder.
  //
  // One order may have multiple items. We select the first item per order;
  // per-orderId de-duplication below handles the JOIN fan-out.

  const rows = await db
    .select({
      orderId: orders.id,
      shippingEmail: orders.shippingEmail,
      userId: orders.userId,
      userEmail: users.email,
      productId: products.id,
      itemName: orderItems.name,
      productName: products.name,
      quantityAvailable: products.quantityAvailable,
    })
    .from(orders)
    .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
    .innerJoin(products, eq(products.id, orderItems.productId))
    .leftJoin(users, eq(users.id, orders.userId))
    .where(
      and(
        eq(orders.paymentStatus, "pending"),
        lt(orders.createdAt, windowCutoff),
        isNull(orders.reminderSentAt)
      )
    );

  if (rows.length === 0) {
    return { sent: 0, skippedSold: 0, skippedNoEmail: 0, errors: 0 };
  }

  // De-duplicate: keep only the first row per orderId (JOIN multiplies rows
  // when an order has multiple items).
  const seenOrderIds = new Set<string>();
  const uniqueRows = rows.filter((row) => {
    if (seenOrderIds.has(row.orderId)) return false;
    seenOrderIds.add(row.orderId);
    return true;
  });

  const result: ReminderResult = { sent: 0, skippedSold: 0, skippedNoEmail: 0, errors: 0 };

  // Process orders one-by-one so each failure is isolated.
  for (const row of uniqueRows) {
    // ── RECIPIENT RESOLUTION ───────────────────────────────────────────────
    const recipientEmail = row.shippingEmail ?? row.userEmail ?? null;
    if (!recipientEmail) {
      log.warn("[reservation-reminder] no recipient email for order", { orderId: row.orderId });
      result.skippedNoEmail++;
      continue;
    }

    // ── LIVE AVAILABILITY GATE ────────────────────────────────────────────
    // Only email if the item is STILL available. A sold item must be skipped.
    // (The message says "may still be available" — mailing about a sold piece
    // would be misleading and contradict the transactional-only constraint.)
    try {
      const activeReservationsCount = await getActiveReservationsCount(row.productId, now);
      const liveStatus = deriveStockStatus({
        quantityAvailable: row.quantityAvailable,
        activeReservationsCount,
      });

      if (liveStatus === "sold") {
        log.info("[reservation-reminder] skipping — item sold", {
          orderId: row.orderId,
          productId: row.productId,
        });
        result.skippedSold++;
        continue;
      }
    } catch (err) {
      // If we can't determine availability, err on the side of NOT emailing.
      log.error("[reservation-reminder] availability check failed — skipping order", {
        orderId: row.orderId,
        err: err as Record<string, unknown>,
      });
      result.errors++;
      continue;
    }

    // ── SEND ──────────────────────────────────────────────────────────────
    try {
      const { subject, html } = reservationExpiryReminderEmail({
        itemName: row.itemName,
        orderId: row.orderId,
      });

      const ok = await sendEmail({ to: recipientEmail, subject, html });

      if (ok !== true) {
        // sendEmail returned false — transport-level failure (e.g. Resend API error).
        // Do NOT set reminderSentAt so the order remains retryable on the next run.
        log.error("[reservation-reminder] sendEmail returned false — order stays retryable", {
          orderId: row.orderId,
        });
        result.errors++;
        continue;
      }

      // ── DEDUPE: mark as reminded AFTER confirmed successful send ──────────
      await db
        .update(orders)
        .set({ reminderSentAt: new Date() })
        .where(eq(orders.id, row.orderId))
        .returning({ id: orders.id });

      result.sent++;
      log.info("[reservation-reminder] sent", { orderId: row.orderId, to: recipientEmail });
    } catch (err) {
      // Error-isolated: one failure must NOT block other reminders.
      log.error("[reservation-reminder] send failed", {
        orderId: row.orderId,
        err: err as Record<string, unknown>,
      });
      result.errors++;
    }
  }

  return result;
}
