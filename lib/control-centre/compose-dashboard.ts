import type {
  GA4DataMetrics,
  SearchConsoleMetrics,
  VercelInsightsMetrics,
  MetaMarketingMetrics,
  TopQuery,
} from "@/lib/ports/channel-metrics";

export type EventCounts = {
  orderCreated: number;
  paymentCompleted: number;
  reservationExpired: number;
  reservationsCreated: number;

  wishlistAdded: number;

  productCardClick: number;
  productView: number;
  addToCart: number;

  // Keep these for later. They can stay 0 until website emits them.
  collectionView: number;
  cartViewed: number;
  checkoutStarted: number;
};

export type ControlCentreInputs = {
  ga4: GA4DataMetrics;
  searchConsole: SearchConsoleMetrics;
  vercelInsights: VercelInsightsMetrics;
  metaMarketing: MetaMarketingMetrics;
  eventCounts: EventCounts;
  commerce: CommerceInputs;
  topMovers: TopMoversInputs;
  discoveryMovers: DiscoveryMoversInputs;
};

export type FunnelMetrics = {
  sessions: number;
  realtimeActiveUsers: number;
  ordersCreated: number;
  paid: number;
};

export type BrowsingMetrics = {
  productCardClick: number;
  productView: number;
  addToCart: number;
  collectionView: number;
  cartViewed: number;
  checkoutStarted: number;
};

export type DiagnosticRateMetrics = {
  productCtr: number;
  pdpAddToBagRate: number;
  paymentSuccessRate: number;
};

export type CommerceInputs = {
  grossSalesPaise: number;
  paidOrderCount: number;
  pendingPaymentLinks: number;
  abandonedPendingOrders: number;
  soldPieces: number;
  reservedPieces: number;
  availablePieces: number;
};

export type CommerceMetrics = CommerceInputs & {
  averageOrderValuePaise: number;
};

export type TopProductMover = {
  productId: string | null;
  slug: string | null;
  name: string;
  count: number;
  revenuePaise?: number;
};

export type TopMoversInputs = {
  viewedProducts: TopProductMover[];
  addedToBagProducts: TopProductMover[];
  wishlistedProducts: TopProductMover[];
  paidProducts: TopProductMover[];
};

export type TopMoversMetrics = TopMoversInputs;

export type TopSearchTermMover = {
  query: string;
  count: number;
  avgResultCount: number;
};

export type TopFilterMover = {
  filterType: string;
  filterValue: string;
  filterLabel: string;
  count: number;
};

export type DiscoveryMoversInputs = {
  topSearchTerms: TopSearchTermMover[];
  topFilters: TopFilterMover[];
};

export type DiscoveryMoversMetrics = DiscoveryMoversInputs;

export type EngagementMetrics = {
  wishlistAdded: number;
};

export type FeedHealthMetrics = {
  catalogItemCount: number;
  catalogDisapprovals: number;
};

export type ParityMetrics = {
  pixelEventCount: number;
  capiEventCount: number;
  parityDelta: number;
};

export type IndexationMetrics = {
  indexedPageCount: number;
  avgCtr: number;
  topQueries: TopQuery[];
};

export type CwvComposed = {
  lcp: number;
  inp: number;
  cls: number;
  recentDeployCount: number;
};

export type ReservationExpiryMetrics = {
  expiredCount: number;
  reservationsCreated: number;
  expiryRate: number;
};

export type ControlCentreDashboard = {
  funnel: FunnelMetrics;
  browsing: BrowsingMetrics;
  rates: DiagnosticRateMetrics;
  commerce: CommerceMetrics;
  topMovers: TopMoversMetrics;
  discoveryMovers: DiscoveryMoversMetrics;
  engagement: EngagementMetrics;
  feedHealth: FeedHealthMetrics;
  parity: ParityMetrics;
  indexation: IndexationMetrics;
  cwv: CwvComposed;
  reservationExpiry: ReservationExpiryMetrics;
};

function safeRate(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

export function composeDashboard(
  inputs: ControlCentreInputs,
): ControlCentreDashboard {
  const {
    ga4,
    searchConsole,
    vercelInsights,
    metaMarketing,
    eventCounts,
    commerce: commerceInputs,
    topMovers,
    discoveryMovers,
  } = inputs;

  const funnel: FunnelMetrics = {
    sessions: ga4.sessions,
    realtimeActiveUsers: ga4.realtimeActiveUsers,
    ordersCreated: eventCounts.orderCreated,
    paid: eventCounts.paymentCompleted,
  };

  const browsing: BrowsingMetrics = {
    productCardClick: eventCounts.productCardClick,
    productView: eventCounts.productView,
    addToCart: eventCounts.addToCart,
    collectionView: eventCounts.collectionView,
    cartViewed: eventCounts.cartViewed,
    checkoutStarted: eventCounts.checkoutStarted,
  };

  const rates: DiagnosticRateMetrics = {
    productCtr: safeRate(
      eventCounts.productCardClick,
      eventCounts.collectionView,
    ),
    pdpAddToBagRate: safeRate(eventCounts.addToCart, eventCounts.productView),
    paymentSuccessRate: safeRate(
      eventCounts.paymentCompleted,
      eventCounts.orderCreated,
    ),
  };

  const commerce: CommerceMetrics = {
    ...commerceInputs,
    averageOrderValuePaise:
      commerceInputs.paidOrderCount > 0
        ? commerceInputs.grossSalesPaise / commerceInputs.paidOrderCount
        : 0,
  };

  const engagement: EngagementMetrics = {
    wishlistAdded: eventCounts.wishlistAdded,
  };

  const feedHealth: FeedHealthMetrics = {
    catalogItemCount: metaMarketing.catalogItemCount,
    catalogDisapprovals: metaMarketing.catalogDisapprovals,
  };

  const parity: ParityMetrics = {
    pixelEventCount: metaMarketing.pixelEventCount,
    capiEventCount: metaMarketing.capiEventCount,
    parityDelta: metaMarketing.pixelEventCount - metaMarketing.capiEventCount,
  };

  const indexation: IndexationMetrics = {
    indexedPageCount: searchConsole.indexedPageCount,
    avgCtr: searchConsole.avgCtr,
    topQueries: searchConsole.topQueries,
  };

  const cwv: CwvComposed = {
    lcp: vercelInsights.cwv.lcp,
    inp: vercelInsights.cwv.inp,
    cls: vercelInsights.cwv.cls,
    recentDeployCount: vercelInsights.recentDeployCount,
  };

  const { reservationExpired, reservationsCreated } = eventCounts;
  const reservationExpiry: ReservationExpiryMetrics = {
    expiredCount: reservationExpired,
    reservationsCreated,
    expiryRate:
      reservationsCreated > 0 ? reservationExpired / reservationsCreated : 0,
  };

  return {
    funnel,
    browsing,
    rates,
    commerce,
    topMovers,
    discoveryMovers,
    engagement,
    feedHealth,
    parity,
    indexation,
    cwv,
    reservationExpiry,
  };
}
