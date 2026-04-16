import { count, eq, sql, sum, and, gte } from "drizzle-orm";

import { db, withRetry } from "@/db";
import { orders, products, users, orderEvents } from "@/db/schema";

export type DashboardMetricsRow = {
  revenue: { totalPaise: number; periodLabel: string };
  orders: { total: number; pending: number };
  products: { total: number; published: number; drafts: number; reserved: number };
  customers: { total: number; newThisWeek: number };
};

export async function getDashboardMetrics(): Promise<DashboardMetricsRow> {
  const [revenueResult, orderCounts, productCounts, customerCounts] =
    await Promise.all([
      // Revenue
      withRetry(() =>
        db
          .select({ total: sum(orders.totalPaise) })
          .from(orders)
      ),
      // Order counts
      withRetry(() =>
        db
          .select({
            total: count(),
            pending: count(
              sql`CASE WHEN ${orders.status} = 'pending' THEN 1 END`,
            ),
          })
          .from(orders)
      ),
      // Product counts
      withRetry(() =>
        db
          .select({
            total: count(),
            published: count(
              sql`CASE WHEN ${products.status} = 'published' THEN 1 END`,
            ),
            drafts: count(
              sql`CASE WHEN ${products.status} = 'draft' THEN 1 END`,
            ),
            reserved: count(
              sql`CASE WHEN ${products.stockStatus} = 'reserved' THEN 1 END`,
            ),
          })
          .from(products)
      ),
      // Customer counts
      withRetry(async () => {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);

        const [totalRow] = await db
          .select({ total: count() })
          .from(users)
          .where(eq(users.role, "customer"));

        const [newRow] = await db
          .select({ newThisWeek: count() })
          .from(users)
          .where(
            and(
              eq(users.role, "customer"),
              gte(users.createdAt, weekAgo),
            ),
          );

        return {
          total: totalRow?.total ?? 0,
          newThisWeek: newRow?.newThisWeek ?? 0,
        };
      }),
    ]);

  return {
    revenue: {
      totalPaise: Number(revenueResult[0]?.total ?? 0),
      periodLabel: "All time",
    },
    orders: {
      total: orderCounts[0]?.total ?? 0,
      pending: orderCounts[0]?.pending ?? 0,
    },
    products: {
      total: productCounts[0]?.total ?? 0,
      published: productCounts[0]?.published ?? 0,
      drafts: productCounts[0]?.drafts ?? 0,
      reserved: productCounts[0]?.reserved ?? 0,
    },
    customers: {
      total: customerCounts.total,
      newThisWeek: customerCounts.newThisWeek,
    },
  };
}

export type ActivityRow = {
  id: string;
  type: "order" | "product";
  description: string;
  timestamp: Date;
};

export async function getRecentActivity(
  limit = 20,
): Promise<ActivityRow[]> {
  const [recentOrders, recentProducts] = await Promise.all([
    withRetry(() =>
      db
        .select({
          id: orderEvents.id,
          note: orderEvents.note,
          createdAt: orderEvents.createdAt,
        })
        .from(orderEvents)
        .orderBy(sql`${orderEvents.createdAt} DESC`)
        .limit(limit)
    ),
    withRetry(() =>
      db
        .select({
          id: products.id,
          name: products.name,
          createdAt: products.createdAt,
        })
        .from(products)
        .orderBy(sql`${products.createdAt} DESC`)
        .limit(limit)
    ),
  ]);

  const items: ActivityRow[] = [
    ...recentOrders.map((e) => ({
      id: e.id,
      type: "order" as const,
      description: e.note,
      timestamp: e.createdAt,
    })),
    ...recentProducts.map((p) => ({
      id: p.id,
      type: "product" as const,
      description: `Product added: ${p.name}`,
      timestamp: p.createdAt,
    })),
  ];

  items.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  return items.slice(0, limit);
}
