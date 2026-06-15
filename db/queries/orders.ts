import { and, desc, eq, inArray, InferInsertModel, InferSelectModel, isNull, or, sql } from "drizzle-orm";

import { db, withRetry } from "@/db";
import { getFirstRow, requireFirstRow } from "@/db/results";
import { orderEvents, orderItems, orders } from "@/db/schema";

type OrderEventRecord = InferSelectModel<typeof orderEvents>;
type OrderItemRecord = InferSelectModel<typeof orderItems>;
type OrderRecord = InferSelectModel<typeof orders>;

export type OrderWithRelations = OrderRecord & {
  events: OrderEventRecord[];
  items: OrderItemRecord[];
};

export type CreateOrderInput = Omit<InferInsertModel<typeof orders>, "createdAt" | "updatedAt"> & {
  items: Array<Omit<InferInsertModel<typeof orderItems>, "createdAt" | "orderId">>;
  initialEvent?: {
    note: string;
    payload?: Record<string, unknown> | null;
    status?: OrderRecord["status"];
  };
};

const hydrateOrders = async (rows: OrderRecord[]): Promise<OrderWithRelations[]> => {
  if (rows.length === 0) return [];

  const orderIds = rows.map((row) => row.id);
  const [itemsRows, eventRows] = await withRetry(() =>
    Promise.all([
      db
        .select()
        .from(orderItems)
        .where(inArray(orderItems.orderId, orderIds)),
      db
        .select()
        .from(orderEvents)
        .where(inArray(orderEvents.orderId, orderIds))
        .orderBy(desc(orderEvents.createdAt)),
    ])
  );

  const itemsByOrderId = new Map<string, OrderItemRecord[]>();
  const eventsByOrderId = new Map<string, OrderEventRecord[]>();

  for (const item of itemsRows) {
    const existing = itemsByOrderId.get(item.orderId) ?? [];
    existing.push(item);
    itemsByOrderId.set(item.orderId, existing);
  }

  for (const event of eventRows) {
    const existing = eventsByOrderId.get(event.orderId) ?? [];
    existing.push(event);
    eventsByOrderId.set(event.orderId, existing);
  }

  return rows.map((row) => ({
    ...row,
    events: eventsByOrderId.get(row.id) ?? [],
    items: itemsByOrderId.get(row.id) ?? [],
  }));
};

export const listOrders = async (options?: {
  limit?: number;
  offset?: number;
  status?: OrderRecord["status"];
  /**
   * P6-01: When both userId and userEmail are provided, returns orders that
   * belong to the user (orders.userId = userId) UNION guest orders that were
   * placed with the same email (orders.shipping_email = userEmail). This
   * surfaces pre-claim checkout orders that were linked to the user's email
   * before they signed up (P1-07 checkout shell pattern).
   *
   * Auth-scoping: userId MUST come from the session — never from user input.
   */
  userId?: string;
  userEmail?: string;
}): Promise<OrderWithRelations[]> => {
  const {
    limit = 100,
    offset = 0,
    status,
    userId,
    userEmail,
  } = options ?? {};

  const filters = [];
  if (status) filters.push(eq(orders.status, status));

  if (userId && userEmail) {
    // Return orders owned by the user OR guest orders (userId IS NULL) with the
    // same email. The isNull guard mirrors the detail-route access rule
    // (api/hono/routes/orders.ts:91-95) and prevents surfacing an order that
    // belongs to a DIFFERENT registered user who happens to share this email in
    // shippingEmail. Without it, the list query is strictly broader than the
    // detail guard: a listed order the detail route would 403 on.
    filters.push(
      or(
        eq(orders.userId, userId),
        and(isNull(orders.userId), eq(orders.shippingEmail, userEmail.toLowerCase()))
      )
    );
  } else if (userId) {
    filters.push(eq(orders.userId, userId));
  }

  const whereClause = filters.length === 0 ? undefined : filters.length === 1 ? filters[0] : and(...filters);

  const rows = await withRetry(() =>
    db
      .select()
      .from(orders)
      .where(whereClause)
      .orderBy(desc(orders.createdAt))
      .limit(limit)
      .offset(offset)
  );

  return hydrateOrders(rows);
};

export const getOrder = async (orderId: string): Promise<OrderWithRelations | null> => {
  const [row] = await withRetry(() =>
    db.select().from(orders).where(eq(orders.id, orderId)).limit(1)
  );
  if (!row) return null;
  const [hydrated] = await hydrateOrders([row]);
  return hydrated ?? null;
};

export const createOrder = async (input: CreateOrderInput): Promise<OrderWithRelations> => {
  const {
    initialEvent,
    items,
    ...orderData
  } = input;

  const createdOrder = requireFirstRow(
    await db
      .insert(orders)
      .values({
        ...orderData,
        updatedAt: new Date(),
      })
      .returning(),
    "Failed to create order."
  );

  if (items.length > 0) {
    await db.insert(orderItems).values(
      items.map((item) => ({
        ...item,
        orderId: createdOrder.id,
      }))
    );
  }

  await db.insert(orderEvents).values({
    orderId: createdOrder.id,
    status: initialEvent?.status ?? createdOrder.status,
    note: initialEvent?.note ?? "Order created",
    payload: initialEvent?.payload ?? null,
  });

  const order = await getOrder(createdOrder.id);
  if (!order) {
    throw new Error("Failed to load created order.");
  }

  return order;
};

export const updateOrderStatus = async (
  orderId: string,
  status: OrderRecord["status"],
  note = "Order status updated",
  payload: Record<string, unknown> | null = null
): Promise<OrderWithRelations | null> => {
  const updated = getFirstRow(
    await db
      .update(orders)
      .set({
        status,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderId))
      .returning({ id: orders.id, status: orders.status })
  );

  if (!updated) return null;

  await db.insert(orderEvents).values({
    orderId,
    status,
    note,
    payload,
  });

  return getOrder(orderId);
};

export const addOrderEvent = async (
  orderId: string,
  note: string,
  status: OrderRecord["status"],
  payload: Record<string, unknown> | null = null
): Promise<OrderEventRecord> => {
  const created = requireFirstRow(
    await db
      .insert(orderEvents)
      .values({
        orderId,
        note,
        status,
        payload,
      })
      .returning(),
    "Failed to create order event."
  );

  return created;
};

export const deleteOrder = async (orderId: string): Promise<boolean> => {
  const deleted = await db
    .delete(orders)
    .where(eq(orders.id, orderId))
    .returning({ id: orders.id });

  return deleted.length > 0;
};

/**
 * P6-05 ATOMIC REFUND CLAIM — step 1 of 3.
 *
 * Performs a conditional UPDATE that atomically transitions paymentStatus from
 * "paid" → "refunded" with refundId still NULL (in-flight marker).
 * Returns the claimed row if successful, or null if the order was already
 * claimed/refunded by another request (TOCTOU guard).
 *
 * Only the winner of this claim should call the Razorpay API.
 */
export const claimOrderRefund = async (orderId: string): Promise<{ id: string } | null> => {
  const claimed = getFirstRow(
    await db
      .update(orders)
      .set({
        paymentStatus: "refunded",
        refundedAt: sql`now()`,
        updatedAt: new Date(),
      })
      .where(and(eq(orders.id, orderId), eq(orders.paymentStatus, "paid")))
      .returning({ id: orders.id })
  );
  return claimed ?? null;
};

/**
 * P6-05 ATOMIC REFUND FINALIZE — step 2 of 3.
 *
 * Called after a successful Razorpay refund. Writes refundId and amount,
 * and inserts the audit event.
 */
export const finalizeOrderRefund = async (
  orderId: string,
  refundId: string,
  refundedAmountPaise: number
): Promise<void> => {
  await db
    .update(orders)
    .set({
      refundId,
      refundedAmountPaise,
      updatedAt: new Date(),
    })
    .where(eq(orders.id, orderId));

  await db.insert(orderEvents).values({
    orderId,
    status: "pending",
    note: `Refund issued. Razorpay refund ID: ${refundId}. Amount: ${refundedAmountPaise} paise.`,
    payload: { refundId, refundedAmountPaise },
  });
};

/**
 * P6-05 ATOMIC REFUND REVERT — fallback on Razorpay failure.
 *
 * Un-does an unfinalized claim (refundId IS NULL) by setting paymentStatus
 * back to "paid". This allows a later retry to claim and attempt the refund
 * again. If Razorpay already succeeded (refundId is set), this is a no-op.
 */
export const revertOrderRefundClaim = async (orderId: string): Promise<void> => {
  await db
    .update(orders)
    .set({
      paymentStatus: "paid",
      refundedAt: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(orders.id, orderId),
        eq(orders.paymentStatus, "refunded"),
        isNull(orders.refundId)
      )
    );
};

/**
 * P6-05: Mark an order as refunded.
 * Updates paymentStatus to "refunded", sets refundId, refundedAt, refundedAmountPaise.
 * Creates an orderEvent for audit trail.
 * Does NOT modify stockStatus — restock is handled separately (one-of-one logic).
 *
 * @deprecated Use claimOrderRefund / finalizeOrderRefund / revertOrderRefundClaim instead.
 */
export const updateOrderRefund = async (
  orderId: string,
  refundId: string,
  refundedAmountPaise: number
): Promise<OrderWithRelations | null> => {
  const updated = getFirstRow(
    await db
      .update(orders)
      .set({
        paymentStatus: "refunded",
        refundId,
        refundedAmountPaise,
        refundedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderId))
      .returning({ id: orders.id })
  );

  if (!updated) return null;

  await db.insert(orderEvents).values({
    orderId,
    status: "pending",
    note: `Refund issued. Razorpay refund ID: ${refundId}. Amount: ${refundedAmountPaise} paise.`,
    payload: { refundId, refundedAmountPaise },
  });

  return getOrder(orderId);
};

/**
 * P6-05: Update shipment tracking fields.
 * Creates an orderEvent for audit trail.
 */
export const updateOrderTracking = async (
  orderId: string,
  trackingNumber: string | null,
  trackingCarrier: string | null
): Promise<OrderWithRelations | null> => {
  const updated = getFirstRow(
    await db
      .update(orders)
      .set({
        trackingNumber,
        trackingCarrier,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderId))
      .returning({ id: orders.id })
  );

  if (!updated) return null;

  await db.insert(orderEvents).values({
    orderId,
    status: "shipped",
    note: `Tracking updated: ${trackingNumber ?? "cleared"} (${trackingCarrier ?? "no carrier"})`,
    payload: { trackingNumber, trackingCarrier },
  });

  return getOrder(orderId);
};

/**
 * P6-05: Update internal admin note on an order (bounded to 500 chars at application layer).
 */
export const updateOrderNote = async (
  orderId: string,
  note: string
): Promise<OrderWithRelations | null> => {
  const updated = getFirstRow(
    await db
      .update(orders)
      .set({
        internalNote: note,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderId))
      .returning({ id: orders.id })
  );

  if (!updated) return null;

  return getOrder(orderId);
};
