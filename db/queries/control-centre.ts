import { and, count, desc, eq, gte, isNotNull, lt, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  channelMetrics,
  events,
  orderItems,
  orders,
  products,
  reservations,
} from "@/db/schema";
import type {
  GA4DataMetrics,
  SearchConsoleMetrics,
  VercelInsightsMetrics,
  MetaMarketingMetrics,
} from "@/lib/ports/channel-metrics";
import type {
  CommerceInputs,
  DiscoveryMoversInputs,
  EventCounts,
  TopFilterMover,
  TopMoversInputs,
  TopProductMover,
  TopSearchTermMover,
} from "@/lib/control-centre/compose-dashboard";

const EMPTY_GA4: GA4DataMetrics = {
  sessions: 0,
  conversions: 0,
  totalRevenuePaise: 0,
  conversionRate: 0,
  realtimeActiveUsers: 0,
};

const EMPTY_GSC: SearchConsoleMetrics = {
  indexedPageCount: 0,
  topQueries: [],
  avgCtr: 0,
};

const EMPTY_VERCEL: VercelInsightsMetrics = {
  cwv: { lcp: 0, inp: 0, cls: 0 },
  recentDeployCount: 0,
};

const EMPTY_META: MetaMarketingMetrics = {
  catalogItemCount: 0,
  catalogDisapprovals: 0,
  pixelEventCount: 0,
  capiEventCount: 0,
  parityDelta: 0,
};

const EMPTY_COMMERCE: CommerceInputs = {
  grossSalesPaise: 0,
  paidOrderCount: 0,
  pendingPaymentLinks: 0,
  abandonedPendingOrders: 0,
  soldPieces: 0,
  reservedPieces: 0,
  availablePieces: 0,
};

const EMPTY_TOP_MOVERS: TopMoversInputs = {
  viewedProducts: [],
  addedToBagProducts: [],
  wishlistedProducts: [],
  paidProducts: [],
};

const EMPTY_DISCOVERY_MOVERS: DiscoveryMoversInputs = {
  topSearchTerms: [],
  topFilters: [],
};

const TOP_MOVER_LIMIT = 5;

const PENDING_ORDER_STALE_MINUTES = 30;

function toNullableString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function fallbackProductName({
  name,
  productId,
  slug,
}: {
  name: unknown;
  productId: unknown;
  slug: unknown;
}): string {
  const explicitName = toNullableString(name);
  if (explicitName) return explicitName;

  const slugValue = toNullableString(slug);
  if (slugValue) return slugValue;

  const productIdValue = toNullableString(productId);
  if (productIdValue) return productIdValue;

  return "Unknown product";
}

function normalizeMoverRows(
  rows: Array<{
    count?: unknown;
    name?: unknown;
    productId?: unknown;
    revenuePaise?: unknown;
    slug?: unknown;
  }>,
): TopProductMover[] {
  return rows.map((row) => {
    const productId = toNullableString(row.productId);
    const slug = toNullableString(row.slug);

    return {
      productId,
      slug,
      name: fallbackProductName({
        name: row.name,
        productId,
        slug,
      }),
      count: toNumber(row.count),
      ...(row.revenuePaise == null
        ? {}
        : { revenuePaise: toNumber(row.revenuePaise) }),
    };
  });
}

function normalizeSearchTermRows(
  rows: Array<{
    avgResultCount?: unknown;
    count?: unknown;
    query?: unknown;
  }>,
): TopSearchTermMover[] {
  return rows
    .map((row) => {
      const query = toNullableString(row.query);
      if (!query) return null;

      return {
        query,
        count: toNumber(row.count),
        avgResultCount: toNumber(row.avgResultCount),
      };
    })
    .filter((row): row is TopSearchTermMover => Boolean(row));
}

function normalizeFilterRows(
  rows: Array<{
    count?: unknown;
    filterLabel?: unknown;
    filterType?: unknown;
    filterValue?: unknown;
  }>,
): TopFilterMover[] {
  return rows
    .map((row) => {
      const filterType = toNullableString(row.filterType);
      const filterValue = toNullableString(row.filterValue);

      if (!filterType || !filterValue) return null;

      return {
        filterType,
        filterValue,
        filterLabel: toNullableString(row.filterLabel) ?? filterValue,
        count: toNumber(row.count),
      };
    })
    .filter((row): row is TopFilterMover => Boolean(row));
}

function toNumber(value: unknown): number {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

type ChannelMetricsRow = {
  source: string;
  value: Record<string, unknown>;
};

export async function getChannelMetrics(): Promise<{
  ga4: GA4DataMetrics;
  searchConsole: SearchConsoleMetrics;
  vercelInsights: VercelInsightsMetrics;
  metaMarketing: MetaMarketingMetrics;
}> {
  try {
    const rows = (await db
      .select({ source: channelMetrics.source, value: channelMetrics.value })
      .from(channelMetrics)) as ChannelMetricsRow[];

    const bySource = new Map<string, Record<string, unknown>>();
    for (const row of rows) {
      bySource.set(row.source, row.value);
    }

    const ga4Row = bySource.get("ga4-data") as
      | Partial<GA4DataMetrics>
      | undefined;
    const searchConsoleRow = bySource.get("search-console") as
      | Partial<SearchConsoleMetrics>
      | undefined;
    const vercelRow = bySource.get("vercel-insights") as
      | Partial<VercelInsightsMetrics>
      | undefined;
    const metaRow = bySource.get("meta-marketing") as
      | Partial<MetaMarketingMetrics>
      | undefined;

    return {
      ga4: {
        ...EMPTY_GA4,
        ...(ga4Row ?? {}),
      },
      searchConsole: {
        ...EMPTY_GSC,
        ...(searchConsoleRow ?? {}),
      },
      vercelInsights: {
        ...EMPTY_VERCEL,
        ...(vercelRow ?? {}),
        cwv: {
          ...EMPTY_VERCEL.cwv,
          ...(vercelRow?.cwv ?? {}),
        },
      },
      metaMarketing: {
        ...EMPTY_META,
        ...(metaRow ?? {}),
      },
    };
  } catch {
    return {
      ga4: EMPTY_GA4,
      searchConsole: EMPTY_GSC,
      vercelInsights: EMPTY_VERCEL,
      metaMarketing: EMPTY_META,
    };
  }
}

export async function getEventCounts(windowDays = 30): Promise<EventCounts> {
  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - windowDays);

  const countEvent = (type: string) =>
    db
      .select({ total: count() })
      .from(events)
      .where(and(eq(events.type, type), gte(events.occurredAt, windowStart)));

  try {
    const [
      orderCreatedRow,
      paymentCompletedRow,
      reservationExpiredRow,
      reservationsCreatedRow,
      wishlistAddedRow,
      productCardClickRow,
      productViewRow,
      addToCartRow,
      collectionViewRow,
      cartViewedRow,
      checkoutStartedRow,
    ] = await Promise.all([
      countEvent("order_created"),
      countEvent("payment_completed"),
      countEvent("reservation_expired"),
      db
        .select({ total: count() })
        .from(reservations)
        .where(gte(reservations.createdAt, windowStart)),
      countEvent("wishlist_added"),
      countEvent("product_card_click"),
      countEvent("product_view"),
      countEvent("add_to_cart"),
      countEvent("collection_view"),
      countEvent("cart_viewed"),
      countEvent("checkout_started"),
    ]);

    return {
      orderCreated: orderCreatedRow[0]?.total ?? 0,
      paymentCompleted: paymentCompletedRow[0]?.total ?? 0,
      reservationExpired: reservationExpiredRow[0]?.total ?? 0,
      reservationsCreated: reservationsCreatedRow[0]?.total ?? 0,

      wishlistAdded: wishlistAddedRow[0]?.total ?? 0,

      productCardClick: productCardClickRow[0]?.total ?? 0,
      productView: productViewRow[0]?.total ?? 0,
      addToCart: addToCartRow[0]?.total ?? 0,

      collectionView: collectionViewRow[0]?.total ?? 0,
      cartViewed: cartViewedRow[0]?.total ?? 0,
      checkoutStarted: checkoutStartedRow[0]?.total ?? 0,
    };
  } catch {
    return {
      orderCreated: 0,
      paymentCompleted: 0,
      reservationExpired: 0,
      reservationsCreated: 0,

      wishlistAdded: 0,

      productCardClick: 0,
      productView: 0,
      addToCart: 0,

      collectionView: 0,
      cartViewed: 0,
      checkoutStarted: 0,
    };
  }
}

export async function getCommerceMetrics(
  windowDays = 30,
): Promise<CommerceInputs> {
  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - windowDays);

  const stalePendingCutoff = new Date(
    Date.now() - PENDING_ORDER_STALE_MINUTES * 60 * 1000,
  );

  try {
    const [
      paidStatsRow,
      pendingPaymentLinksRow,
      abandonedPendingOrdersRow,
      soldPiecesRow,
      reservedPiecesRow,
      availablePiecesRow,
    ] = await Promise.all([
      db
        .select({
          grossSalesPaise: sql<number>`coalesce(sum(${orders.totalPaise}), 0)`,
          paidOrderCount: count(),
        })
        .from(orders)
        .where(
          and(
            eq(orders.paymentStatus, "paid"),
            gte(orders.createdAt, windowStart),
          ),
        ),

      db
        .select({ total: count() })
        .from(orders)
        .where(
          and(
            eq(orders.paymentStatus, "pending"),
            isNotNull(orders.razorpayOrderId),
            gte(orders.createdAt, windowStart),
          ),
        ),

      db
        .select({ total: count() })
        .from(orders)
        .where(
          and(
            eq(orders.paymentStatus, "pending"),
            isNotNull(orders.razorpayOrderId),
            gte(orders.createdAt, windowStart),
            lt(orders.createdAt, stalePendingCutoff),
          ),
        ),

      db
        .select({ total: count() })
        .from(products)
        .where(
          and(
            eq(products.status, "published"),
            eq(products.stockStatus, "sold"),
          ),
        ),

      db
        .select({ total: count() })
        .from(products)
        .where(
          and(
            eq(products.status, "published"),
            eq(products.stockStatus, "reserved"),
          ),
        ),

      db
        .select({ total: count() })
        .from(products)
        .where(
          and(
            eq(products.status, "published"),
            eq(products.stockStatus, "available"),
          ),
        ),
    ]);

    return {
      grossSalesPaise: toNumber(paidStatsRow[0]?.grossSalesPaise),
      paidOrderCount: toNumber(paidStatsRow[0]?.paidOrderCount),
      pendingPaymentLinks: toNumber(pendingPaymentLinksRow[0]?.total),
      abandonedPendingOrders: toNumber(abandonedPendingOrdersRow[0]?.total),
      soldPieces: toNumber(soldPiecesRow[0]?.total),
      reservedPieces: toNumber(reservedPiecesRow[0]?.total),
      availablePieces: toNumber(availablePiecesRow[0]?.total),
    };
  } catch {
    return EMPTY_COMMERCE;
  }
}

async function getEventProductMovers(
  type: "add_to_cart" | "product_view" | "wishlist_added",
  windowStart: Date,
): Promise<TopProductMover[]> {
  const productIdExpr = sql<string | null>`${events.payload}->>'productId'`;
  const slugExpr = sql<string | null>`${events.payload}->>'slug'`;
  const payloadNameExpr = sql<string | null>`${events.payload}->>'productName'`;
  const totalExpr = sql<number>`count(*)`;

  const rows = await db
    .select({
      productId: productIdExpr,
      slug: sql<string | null>`coalesce(${products.slug}, ${slugExpr})`,
      name: sql<
        string | null
      >`coalesce(${products.name}, ${payloadNameExpr}, ${slugExpr})`,
      count: totalExpr,
    })
    .from(events)
    .innerJoin(
      products,
      sql`${products.id} = (${events.payload}->>'productId')::uuid`,
    )
    .where(
      and(
        eq(events.type, type),
        eq(products.status, "published"),
        gte(events.occurredAt, windowStart),
        sql`${events.payload}->>'productId' is not null`,
      ),
    )
    .groupBy(
      productIdExpr,
      slugExpr,
      payloadNameExpr,
      products.slug,
      products.name,
    )
    .orderBy(desc(totalExpr))
    .limit(TOP_MOVER_LIMIT);

  return normalizeMoverRows(rows);
}

async function getPaidProductMovers(
  windowStart: Date,
): Promise<TopProductMover[]> {
  const quantityExpr = sql<number>`coalesce(sum(${orderItems.quantity}), 0)`;
  const revenueExpr = sql<number>`coalesce(sum(${orderItems.pricePaise} * ${orderItems.quantity}), 0)`;

  const rows = await db
    .select({
      productId: orderItems.productId,
      slug: products.slug,
      name: orderItems.name,
      count: quantityExpr,
      revenuePaise: revenueExpr,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .innerJoin(products, eq(orderItems.productId, products.id))
    .where(
      and(
        eq(orders.paymentStatus, "paid"),
        eq(products.status, "published"),
        gte(orders.createdAt, windowStart),
      ),
    )
    .groupBy(orderItems.productId, orderItems.name, products.slug)
    .orderBy(desc(quantityExpr))
    .limit(TOP_MOVER_LIMIT);

  return normalizeMoverRows(rows);
}

export async function getTopMovers(windowDays = 30): Promise<TopMoversInputs> {
  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - windowDays);

  try {
    const [
      viewedProducts,
      addedToBagProducts,
      wishlistedProducts,
      paidProducts,
    ] = await Promise.all([
      getEventProductMovers("product_view", windowStart),
      getEventProductMovers("add_to_cart", windowStart),
      getEventProductMovers("wishlist_added", windowStart),
      getPaidProductMovers(windowStart),
    ]);

    return {
      viewedProducts,
      addedToBagProducts,
      wishlistedProducts,
      paidProducts,
    };
  } catch {
    return EMPTY_TOP_MOVERS;
  }
}

export async function getDiscoveryMovers(
  windowDays = 30,
): Promise<DiscoveryMoversInputs> {
  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - windowDays);

  try {
    const queryExpr = sql<
      string | null
    >`lower(trim(${events.payload}->>'query'))`;
    const searchCountExpr = sql<number>`count(*)`;
    const avgResultCountExpr = sql<number>`coalesce(avg(nullif(${events.payload}->>'resultCount', '')::numeric), 0)`;

    const filterTypeExpr = sql<string | null>`${events.payload}->>'filterType'`;
    const filterValueExpr = sql<
      string | null
    >`${events.payload}->>'filterValue'`;
    const filterLabelExpr = sql<
      string | null
    >`coalesce(${events.payload}->>'filterLabel', ${events.payload}->>'filterValue')`;
    const filterCountExpr = sql<number>`count(*)`;

    const [searchRows, filterRows] = await Promise.all([
      db
        .select({
          query: queryExpr,
          count: searchCountExpr,
          avgResultCount: avgResultCountExpr,
        })
        .from(events)
        .where(
          and(
            eq(events.type, "search_performed"),
            gte(events.occurredAt, windowStart),
            sql`${events.payload}->>'query' is not null`,
            sql`length(trim(${events.payload}->>'query')) > 0`,
          ),
        )
        .groupBy(queryExpr)
        .orderBy(desc(searchCountExpr))
        .limit(TOP_MOVER_LIMIT),

      db
        .select({
          filterType: filterTypeExpr,
          filterValue: filterValueExpr,
          filterLabel: filterLabelExpr,
          count: filterCountExpr,
        })
        .from(events)
        .where(
          and(
            eq(events.type, "filter_applied"),
            gte(events.occurredAt, windowStart),
            sql`${events.payload}->>'filterType' is not null`,
            sql`${events.payload}->>'filterValue' is not null`,
          ),
        )
        .groupBy(filterTypeExpr, filterValueExpr, filterLabelExpr)
        .orderBy(desc(filterCountExpr))
        .limit(TOP_MOVER_LIMIT),
    ]);

    return {
      topSearchTerms: normalizeSearchTermRows(searchRows),
      topFilters: normalizeFilterRows(filterRows),
    };
  } catch {
    return EMPTY_DISCOVERY_MOVERS;
  }
}
