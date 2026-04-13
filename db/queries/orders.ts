import { and, desc, eq, inArray, InferInsertModel, InferSelectModel } from "drizzle-orm";

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
  userId?: string;
}): Promise<OrderWithRelations[]> => {
  const {
    limit = 100,
    offset = 0,
    status,
    userId,
  } = options ?? {};

  const filters = [];
  if (status) filters.push(eq(orders.status, status));
  if (userId) filters.push(eq(orders.userId, userId));

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
