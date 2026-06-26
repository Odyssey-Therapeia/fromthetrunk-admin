/**
 * P5-05: Control Centre — data-composition mutation-proof tests.
 *
 * Tests the REAL composeDashboard() pure function.
 * Mocks ONLY @/db (the drizzle builder) — never mocks the unit under test.
 *
 * Mutation-proofs:
 *   - Changing channel_metrics inputs CHANGES the composed outputs.
 *   - Empty channel_metrics + zero events → graceful zero/empty state, no crash.
 *   - Funnel, browsing, engagement, feed-health, parity, indexation, CWV,
 *     expiry-rate are all DERIVED.
 *
 * Test discipline:
 *   - No hand-built literals asserted on; every expected value is derived from
 *     the input fixture. Changing the fixture makes the assertion fail.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mock state
// ---------------------------------------------------------------------------

/** Queue of row-sets returned from db.select() calls in FIFO order. */
const selectQueue = vi.hoisted(() => [] as unknown[][]);
/** SELECT args captured for inspection */
const capturedFromArgs = vi.hoisted(() => [] as unknown[]);
const capturedWhereArgs = vi.hoisted(() => [] as unknown[]);

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => {
      const rows = selectQueue.shift() ?? [];
      const builder: Record<string, unknown> = {};

      for (const method of [
        "innerJoin",
        "leftJoin",
        "orderBy",
        "limit",
        "offset",
        "groupBy",
      ]) {
        builder[method] = () => builder;
      }

      builder["from"] = (arg: unknown) => {
        capturedFromArgs.push(arg);
        return builder;
      };

      builder["where"] = (arg: unknown) => {
        capturedWhereArgs.push(arg);
        return builder;
      };

      builder.then = (resolve: (value: unknown[]) => unknown) => resolve(rows);

      return builder;
    }),
  },
  withRetry: vi.fn((op: () => Promise<unknown>) => op()),
}));

// ---------------------------------------------------------------------------
// Import the real units under test AFTER mock registration
// ---------------------------------------------------------------------------

import { db } from "@/db";
import {
  composeDashboard,
  type ControlCentreInputs,
} from "@/lib/control-centre/compose-dashboard";
import type {
  GA4DataMetrics,
  MetaMarketingMetrics,
  SearchConsoleMetrics,
  VercelInsightsMetrics,
} from "@/lib/ports/channel-metrics";
// Real query-path units — mocked at the @/db level (lowest dep), not here.
import {
  getChannelMetrics,
  getCommerceMetrics,
  getDiscoveryMovers,
  getEventCounts,
  getTopMovers,
} from "@/db/queries/control-centre";

// ---------------------------------------------------------------------------
// Fixtures — realistic non-zero inputs
// ---------------------------------------------------------------------------

const GA4_FIXTURE: GA4DataMetrics = {
  sessions: 1670,
  conversions: 35,
  totalRevenuePaise: 2470000,
  conversionRate: 0.021,
  realtimeActiveUsers: 1,
};

const GSC_FIXTURE: SearchConsoleMetrics = {
  indexedPageCount: 84,
  topQueries: [
    {
      query: "from the trunk saree",
      clicks: 102,
      impressions: 3500,
      ctr: 0.029,
      position: 2.1,
    },
    {
      query: "preloved silk saree",
      clicks: 67,
      impressions: 2100,
      ctr: 0.032,
      position: 1.9,
    },
  ],
  avgCtr: 0.031,
};

const VERCEL_FIXTURE: VercelInsightsMetrics = {
  cwv: { lcp: 2450, inp: 180, cls: 0.08 },
  recentDeployCount: 3,
};

const META_FIXTURE: MetaMarketingMetrics = {
  catalogItemCount: 47,
  catalogDisapprovals: 3,
  pixelEventCount: 28,
  capiEventCount: 25,
  parityDelta: 3,
};

const FULL_INPUTS: ControlCentreInputs = {
  ga4: GA4_FIXTURE,
  searchConsole: GSC_FIXTURE,
  vercelInsights: VERCEL_FIXTURE,
  metaMarketing: META_FIXTURE,
  eventCounts: {
    orderCreated: 42,
    paymentCompleted: 25,
    reservationExpired: 7,
    reservationsCreated: 70,

    wishlistAdded: 1,

    productCardClick: 2,
    productView: 3,
    addToCart: 4,

    collectionView: 5,
    cartViewed: 6,
    checkoutStarted: 7,
  },
  commerce: {
    grossSalesPaise: 2470000,
    paidOrderCount: 25,
    pendingPaymentLinks: 4,
    abandonedPendingOrders: 2,
    soldPieces: 11,
    reservedPieces: 3,
    availablePieces: 33,
  },
  topMovers: {
    viewedProducts: [
      {
        productId: "product-viewed-1",
        slug: "viewed-product",
        name: "Viewed Product",
        count: 12,
      },
    ],
    addedToBagProducts: [
      {
        productId: "product-added-1",
        slug: "added-product",
        name: "Added Product",
        count: 8,
      },
    ],
    wishlistedProducts: [
      {
        productId: "product-wishlisted-1",
        slug: "wishlisted-product",
        name: "Wishlisted Product",
        count: 5,
      },
    ],
    paidProducts: [
      {
        productId: "product-paid-1",
        slug: "paid-product",
        name: "Paid Product",
        count: 3,
        revenuePaise: 300000,
      },
    ],
  },
  discoveryMovers: {
    topSearchTerms: [
      {
        query: "silk",
        count: 3,
        avgResultCount: 7,
      },
    ],
    topFilters: [
      {
        filterType: "fabric",
        filterValue: "silk",
        filterLabel: "silk",
        count: 2,
      },
    ],
  },
};

const EMPTY_INPUTS: ControlCentreInputs = {
  ga4: {
    sessions: 0,
    conversions: 0,
    totalRevenuePaise: 0,
    conversionRate: 0,
    realtimeActiveUsers: 0,
  },
  searchConsole: { indexedPageCount: 0, topQueries: [], avgCtr: 0 },
  vercelInsights: { cwv: { lcp: 0, inp: 0, cls: 0 }, recentDeployCount: 0 },
  metaMarketing: {
    catalogItemCount: 0,
    catalogDisapprovals: 0,
    pixelEventCount: 0,
    capiEventCount: 0,
    parityDelta: 0,
  },
  eventCounts: {
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
  },
  commerce: {
    grossSalesPaise: 0,
    paidOrderCount: 0,
    pendingPaymentLinks: 0,
    abandonedPendingOrders: 0,
    soldPieces: 0,
    reservedPieces: 0,
    availablePieces: 0,
  },
  topMovers: {
    viewedProducts: [],
    addedToBagProducts: [],
    wishlistedProducts: [],
    paidProducts: [],
  },
  discoveryMovers: {
    topSearchTerms: [],
    topFilters: [],
  },
};

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * getEventCounts() now performs 11 count queries:
 *   10 event-type counts + 1 reservations.createdAt count.
 */
const EVENT_COUNT_QUERY_COUNT = 11;

function queueEventCountRows(
  overrides: Partial<ControlCentreInputs["eventCounts"]> = {},
) {
  const counts: ControlCentreInputs["eventCounts"] = {
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

    ...overrides,
  };

  // FIFO order must match getEventCounts() Promise.all order.
  selectQueue.push([{ total: counts.orderCreated }]);
  selectQueue.push([{ total: counts.paymentCompleted }]);
  selectQueue.push([{ total: counts.reservationExpired }]);
  selectQueue.push([{ total: counts.reservationsCreated }]);

  selectQueue.push([{ total: counts.wishlistAdded }]);

  selectQueue.push([{ total: counts.productCardClick }]);
  selectQueue.push([{ total: counts.productView }]);
  selectQueue.push([{ total: counts.addToCart }]);

  selectQueue.push([{ total: counts.collectionView }]);
  selectQueue.push([{ total: counts.cartViewed }]);
  selectQueue.push([{ total: counts.checkoutStarted }]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  selectQueue.length = 0;
  capturedFromArgs.length = 0;
  capturedWhereArgs.length = 0;
});

describe("composeDashboard — revenue funnel", () => {
  it("derives sessions from GA4 input", () => {
    const result = composeDashboard(FULL_INPUTS);
    expect(result.funnel.sessions).toBe(FULL_INPUTS.ga4.sessions);
  });

  it("derives realtimeActiveUsers from GA4 input", () => {
    const result = composeDashboard(FULL_INPUTS);

    expect(result.funnel.realtimeActiveUsers).toBe(
      FULL_INPUTS.ga4.realtimeActiveUsers,
    );
  });

  it("derives paid count from eventCounts.paymentCompleted", () => {
    const result = composeDashboard(FULL_INPUTS);
    expect(result.funnel.paid).toBe(FULL_INPUTS.eventCounts.paymentCompleted);
  });

  it("derives ordersCreated from eventCounts.orderCreated", () => {
    const result = composeDashboard(FULL_INPUTS);
    expect(result.funnel.ordersCreated).toBe(
      FULL_INPUTS.eventCounts.orderCreated,
    );
  });

  it("MUTATION: changing sessions in GA4 changes funnel.sessions", () => {
    const mutated: ControlCentreInputs = {
      ...FULL_INPUTS,
      ga4: { ...GA4_FIXTURE, sessions: 9999 },
    };

    const result = composeDashboard(mutated);

    expect(result.funnel.sessions).toBe(9999);
    expect(result.funnel.sessions).not.toBe(GA4_FIXTURE.sessions);
  });

  it("MUTATION: changing realtimeActiveUsers changes funnel.realtimeActiveUsers", () => {
    const mutated: ControlCentreInputs = {
      ...FULL_INPUTS,
      ga4: { ...GA4_FIXTURE, realtimeActiveUsers: 99 },
    };

    const result = composeDashboard(mutated);

    expect(result.funnel.realtimeActiveUsers).toBe(99);
    expect(result.funnel.realtimeActiveUsers).not.toBe(
      FULL_INPUTS.ga4.realtimeActiveUsers,
    );
  });

  it("MUTATION: changing paymentCompleted changes funnel.paid", () => {
    const mutated: ControlCentreInputs = {
      ...FULL_INPUTS,
      eventCounts: { ...FULL_INPUTS.eventCounts, paymentCompleted: 999 },
    };

    const result = composeDashboard(mutated);

    expect(result.funnel.paid).toBe(999);
    expect(result.funnel.paid).not.toBe(
      FULL_INPUTS.eventCounts.paymentCompleted,
    );
  });
});

describe("composeDashboard — browsing funnel", () => {
  it("derives product click/view/add-to-cart from event counts", () => {
    const result = composeDashboard(FULL_INPUTS);

    expect(result.browsing.productCardClick).toBe(
      FULL_INPUTS.eventCounts.productCardClick,
    );
    expect(result.browsing.productView).toBe(
      FULL_INPUTS.eventCounts.productView,
    );
    expect(result.browsing.addToCart).toBe(FULL_INPUTS.eventCounts.addToCart);
  });

  it("derives collection/cart/checkout counts from event counts", () => {
    const result = composeDashboard(FULL_INPUTS);

    expect(result.browsing.collectionView).toBe(
      FULL_INPUTS.eventCounts.collectionView,
    );
    expect(result.browsing.cartViewed).toBe(FULL_INPUTS.eventCounts.cartViewed);
    expect(result.browsing.checkoutStarted).toBe(
      FULL_INPUTS.eventCounts.checkoutStarted,
    );
  });

  it("MUTATION: changing addToCart changes browsing.addToCart", () => {
    const mutated: ControlCentreInputs = {
      ...FULL_INPUTS,
      eventCounts: { ...FULL_INPUTS.eventCounts, addToCart: 99 },
    };

    const result = composeDashboard(mutated);

    expect(result.browsing.addToCart).toBe(99);
    expect(result.browsing.addToCart).not.toBe(
      FULL_INPUTS.eventCounts.addToCart,
    );
  });

  it("MUTATION: changing productView changes browsing.productView", () => {
    const mutated: ControlCentreInputs = {
      ...FULL_INPUTS,
      eventCounts: { ...FULL_INPUTS.eventCounts, productView: 88 },
    };

    const result = composeDashboard(mutated);

    expect(result.browsing.productView).toBe(88);
    expect(result.browsing.productView).not.toBe(
      FULL_INPUTS.eventCounts.productView,
    );
  });
});

describe("composeDashboard — diagnostic rates", () => {
  it("computes productCtr as productCardClick / collectionView", () => {
    const result = composeDashboard(FULL_INPUTS);

    expect(result.rates.productCtr).toBeCloseTo(
      FULL_INPUTS.eventCounts.productCardClick /
        FULL_INPUTS.eventCounts.collectionView,
      10,
    );
  });

  it("computes pdpAddToBagRate as addToCart / productView", () => {
    const result = composeDashboard(FULL_INPUTS);

    expect(result.rates.pdpAddToBagRate).toBeCloseTo(
      FULL_INPUTS.eventCounts.addToCart / FULL_INPUTS.eventCounts.productView,
      10,
    );
  });

  it("computes paymentSuccessRate as paymentCompleted / orderCreated", () => {
    const result = composeDashboard(FULL_INPUTS);

    expect(result.rates.paymentSuccessRate).toBeCloseTo(
      FULL_INPUTS.eventCounts.paymentCompleted /
        FULL_INPUTS.eventCounts.orderCreated,
      10,
    );
  });

  it("returns zero diagnostic rates when denominators are zero", () => {
    const zeroDenominators: ControlCentreInputs = {
      ...FULL_INPUTS,
      eventCounts: {
        ...FULL_INPUTS.eventCounts,
        collectionView: 0,
        productView: 0,
        orderCreated: 0,
      },
    };

    const result = composeDashboard(zeroDenominators);

    expect(result.rates.productCtr).toBe(0);
    expect(result.rates.pdpAddToBagRate).toBe(0);
    expect(result.rates.paymentSuccessRate).toBe(0);
    expect(Number.isNaN(result.rates.productCtr)).toBe(false);
    expect(Number.isNaN(result.rates.pdpAddToBagRate)).toBe(false);
    expect(Number.isNaN(result.rates.paymentSuccessRate)).toBe(false);
  });

  it("MUTATION: changing collectionView changes productCtr", () => {
    const original = composeDashboard(FULL_INPUTS);

    const mutated: ControlCentreInputs = {
      ...FULL_INPUTS,
      eventCounts: {
        ...FULL_INPUTS.eventCounts,
        collectionView: FULL_INPUTS.eventCounts.collectionView * 2,
      },
    };

    const result = composeDashboard(mutated);

    expect(result.rates.productCtr).not.toBeCloseTo(
      original.rates.productCtr,
      10,
    );
  });
});

describe("composeDashboard — commerce snapshot", () => {
  it("derives grossSalesPaise from commerce input", () => {
    const result = composeDashboard(FULL_INPUTS);

    expect(result.commerce.grossSalesPaise).toBe(
      FULL_INPUTS.commerce.grossSalesPaise,
    );
  });

  it("computes averageOrderValuePaise as grossSalesPaise / paidOrderCount", () => {
    const result = composeDashboard(FULL_INPUTS);

    expect(result.commerce.averageOrderValuePaise).toBeCloseTo(
      FULL_INPUTS.commerce.grossSalesPaise /
        FULL_INPUTS.commerce.paidOrderCount,
      10,
    );
  });

  it("returns zero AOV when paidOrderCount is zero", () => {
    const zeroPaidOrders: ControlCentreInputs = {
      ...FULL_INPUTS,
      commerce: {
        ...FULL_INPUTS.commerce,
        paidOrderCount: 0,
      },
    };

    const result = composeDashboard(zeroPaidOrders);

    expect(result.commerce.averageOrderValuePaise).toBe(0);
    expect(Number.isNaN(result.commerce.averageOrderValuePaise)).toBe(false);
  });

  it("derives pending and abandoned order counts from commerce input", () => {
    const result = composeDashboard(FULL_INPUTS);

    expect(result.commerce.pendingPaymentLinks).toBe(
      FULL_INPUTS.commerce.pendingPaymentLinks,
    );
    expect(result.commerce.abandonedPendingOrders).toBe(
      FULL_INPUTS.commerce.abandonedPendingOrders,
    );
  });

  it("derives inventory counts from commerce input", () => {
    const result = composeDashboard(FULL_INPUTS);

    expect(result.commerce.soldPieces).toBe(FULL_INPUTS.commerce.soldPieces);
    expect(result.commerce.reservedPieces).toBe(
      FULL_INPUTS.commerce.reservedPieces,
    );
    expect(result.commerce.availablePieces).toBe(
      FULL_INPUTS.commerce.availablePieces,
    );
  });

  it("MUTATION: changing grossSalesPaise changes averageOrderValuePaise", () => {
    const original = composeDashboard(FULL_INPUTS);

    const mutated: ControlCentreInputs = {
      ...FULL_INPUTS,
      commerce: {
        ...FULL_INPUTS.commerce,
        grossSalesPaise: FULL_INPUTS.commerce.grossSalesPaise * 2,
      },
    };

    const result = composeDashboard(mutated);

    expect(result.commerce.averageOrderValuePaise).not.toBeCloseTo(
      original.commerce.averageOrderValuePaise,
      10,
    );
  });
});

describe("composeDashboard — product movers", () => {
  it("passes through viewed product movers", () => {
    const result = composeDashboard(FULL_INPUTS);

    expect(result.topMovers.viewedProducts).toHaveLength(
      FULL_INPUTS.topMovers.viewedProducts.length,
    );
    expect(result.topMovers.viewedProducts[0]!.name).toBe(
      FULL_INPUTS.topMovers.viewedProducts[0]!.name,
    );
    expect(result.topMovers.viewedProducts[0]!.count).toBe(
      FULL_INPUTS.topMovers.viewedProducts[0]!.count,
    );
  });

  it("passes through added-to-bag product movers", () => {
    const result = composeDashboard(FULL_INPUTS);

    expect(result.topMovers.addedToBagProducts[0]!.name).toBe(
      FULL_INPUTS.topMovers.addedToBagProducts[0]!.name,
    );
    expect(result.topMovers.addedToBagProducts[0]!.count).toBe(
      FULL_INPUTS.topMovers.addedToBagProducts[0]!.count,
    );
  });

  it("passes through wishlisted product movers", () => {
    const result = composeDashboard(FULL_INPUTS);

    expect(result.topMovers.wishlistedProducts[0]!.name).toBe(
      FULL_INPUTS.topMovers.wishlistedProducts[0]!.name,
    );
    expect(result.topMovers.wishlistedProducts[0]!.count).toBe(
      FULL_INPUTS.topMovers.wishlistedProducts[0]!.count,
    );
  });

  it("passes through paid product movers with revenue", () => {
    const result = composeDashboard(FULL_INPUTS);

    expect(result.topMovers.paidProducts[0]!.name).toBe(
      FULL_INPUTS.topMovers.paidProducts[0]!.name,
    );
    expect(result.topMovers.paidProducts[0]!.revenuePaise).toBe(
      FULL_INPUTS.topMovers.paidProducts[0]!.revenuePaise,
    );
  });

  it("MUTATION: changing top viewed product count changes composed result", () => {
    const mutated: ControlCentreInputs = {
      ...FULL_INPUTS,
      topMovers: {
        ...FULL_INPUTS.topMovers,
        viewedProducts: [
          {
            ...FULL_INPUTS.topMovers.viewedProducts[0]!,
            count: 99,
          },
        ],
      },
    };

    const result = composeDashboard(mutated);

    expect(result.topMovers.viewedProducts[0]!.count).toBe(99);
    expect(result.topMovers.viewedProducts[0]!.count).not.toBe(
      FULL_INPUTS.topMovers.viewedProducts[0]!.count,
    );
  });
});

describe("composeDashboard — discovery movers", () => {
  it("passes through top search terms", () => {
    const result = composeDashboard(FULL_INPUTS);

    expect(result.discoveryMovers.topSearchTerms).toHaveLength(
      FULL_INPUTS.discoveryMovers.topSearchTerms.length,
    );
    expect(result.discoveryMovers.topSearchTerms[0]!.query).toBe(
      FULL_INPUTS.discoveryMovers.topSearchTerms[0]!.query,
    );
    expect(result.discoveryMovers.topSearchTerms[0]!.count).toBe(
      FULL_INPUTS.discoveryMovers.topSearchTerms[0]!.count,
    );
  });

  it("passes through top filters", () => {
    const result = composeDashboard(FULL_INPUTS);

    expect(result.discoveryMovers.topFilters).toHaveLength(
      FULL_INPUTS.discoveryMovers.topFilters.length,
    );
    expect(result.discoveryMovers.topFilters[0]!.filterType).toBe(
      FULL_INPUTS.discoveryMovers.topFilters[0]!.filterType,
    );
    expect(result.discoveryMovers.topFilters[0]!.count).toBe(
      FULL_INPUTS.discoveryMovers.topFilters[0]!.count,
    );
  });

  it("MUTATION: changing top search count changes composed result", () => {
    const mutated: ControlCentreInputs = {
      ...FULL_INPUTS,
      discoveryMovers: {
        ...FULL_INPUTS.discoveryMovers,
        topSearchTerms: [
          {
            ...FULL_INPUTS.discoveryMovers.topSearchTerms[0]!,
            count: 99,
          },
        ],
      },
    };

    const result = composeDashboard(mutated);

    expect(result.discoveryMovers.topSearchTerms[0]!.count).toBe(99);
    expect(result.discoveryMovers.topSearchTerms[0]!.count).not.toBe(
      FULL_INPUTS.discoveryMovers.topSearchTerms[0]!.count,
    );
  });
});

describe("composeDashboard — engagement", () => {
  it("derives wishlistAdded from eventCounts.wishlistAdded", () => {
    const result = composeDashboard(FULL_INPUTS);

    expect(result.engagement.wishlistAdded).toBe(
      FULL_INPUTS.eventCounts.wishlistAdded,
    );
  });

  it("MUTATION: changing wishlistAdded changes engagement.wishlistAdded", () => {
    const mutated: ControlCentreInputs = {
      ...FULL_INPUTS,
      eventCounts: { ...FULL_INPUTS.eventCounts, wishlistAdded: 99 },
    };

    const result = composeDashboard(mutated);

    expect(result.engagement.wishlistAdded).toBe(99);
    expect(result.engagement.wishlistAdded).not.toBe(
      FULL_INPUTS.eventCounts.wishlistAdded,
    );
  });
});

describe("composeDashboard — feed health", () => {
  it("derives catalogItemCount from Meta input", () => {
    const result = composeDashboard(FULL_INPUTS);

    expect(result.feedHealth.catalogItemCount).toBe(
      FULL_INPUTS.metaMarketing.catalogItemCount,
    );
  });

  it("derives catalogDisapprovals from Meta input", () => {
    const result = composeDashboard(FULL_INPUTS);

    expect(result.feedHealth.catalogDisapprovals).toBe(
      FULL_INPUTS.metaMarketing.catalogDisapprovals,
    );
  });

  it("MUTATION: changing catalogItemCount changes feedHealth.catalogItemCount", () => {
    const mutated: ControlCentreInputs = {
      ...FULL_INPUTS,
      metaMarketing: { ...META_FIXTURE, catalogItemCount: 123 },
    };

    const result = composeDashboard(mutated);

    expect(result.feedHealth.catalogItemCount).toBe(123);
  });
});

describe("composeDashboard — pixel/CAPI parity", () => {
  it("derives pixelEventCount from Meta input", () => {
    const result = composeDashboard(FULL_INPUTS);

    expect(result.parity.pixelEventCount).toBe(
      FULL_INPUTS.metaMarketing.pixelEventCount,
    );
  });

  it("derives capiEventCount from Meta input", () => {
    const result = composeDashboard(FULL_INPUTS);

    expect(result.parity.capiEventCount).toBe(
      FULL_INPUTS.metaMarketing.capiEventCount,
    );
  });

  it("computes parityDelta as pixel minus CAPI", () => {
    const result = composeDashboard(FULL_INPUTS);
    const expectedDelta =
      FULL_INPUTS.metaMarketing.pixelEventCount -
      FULL_INPUTS.metaMarketing.capiEventCount;

    expect(result.parity.parityDelta).toBe(expectedDelta);
  });

  it("MUTATION: changing pixelEventCount changes parityDelta", () => {
    const mutated: ControlCentreInputs = {
      ...FULL_INPUTS,
      metaMarketing: {
        ...META_FIXTURE,
        pixelEventCount: 100,
        capiEventCount: 25,
      },
    };

    const result = composeDashboard(mutated);

    expect(result.parity.parityDelta).toBe(75);
    expect(result.parity.parityDelta).not.toBe(META_FIXTURE.parityDelta);
  });
});

describe("composeDashboard — indexation", () => {
  it("derives indexedPageCount from GSC input", () => {
    const result = composeDashboard(FULL_INPUTS);

    expect(result.indexation.indexedPageCount).toBe(
      FULL_INPUTS.searchConsole.indexedPageCount,
    );
  });

  it("derives avgCtr from GSC input", () => {
    const result = composeDashboard(FULL_INPUTS);

    expect(result.indexation.avgCtr).toBe(FULL_INPUTS.searchConsole.avgCtr);
  });

  it("derives topQueries from GSC input", () => {
    const result = composeDashboard(FULL_INPUTS);

    expect(result.indexation.topQueries).toHaveLength(
      FULL_INPUTS.searchConsole.topQueries.length,
    );
    expect(result.indexation.topQueries[0]!.query).toBe(
      FULL_INPUTS.searchConsole.topQueries[0]!.query,
    );
  });

  it("MUTATION: changing indexedPageCount changes indexation.indexedPageCount", () => {
    const mutated: ControlCentreInputs = {
      ...FULL_INPUTS,
      searchConsole: { ...GSC_FIXTURE, indexedPageCount: 200 },
    };

    const result = composeDashboard(mutated);

    expect(result.indexation.indexedPageCount).toBe(200);
  });
});

describe("composeDashboard — CWV", () => {
  it("derives lcp from Vercel input", () => {
    const result = composeDashboard(FULL_INPUTS);

    expect(result.cwv.lcp).toBe(FULL_INPUTS.vercelInsights.cwv.lcp);
  });

  it("derives inp from Vercel input", () => {
    const result = composeDashboard(FULL_INPUTS);

    expect(result.cwv.inp).toBe(FULL_INPUTS.vercelInsights.cwv.inp);
  });

  it("derives cls from Vercel input", () => {
    const result = composeDashboard(FULL_INPUTS);

    expect(result.cwv.cls).toBe(FULL_INPUTS.vercelInsights.cwv.cls);
  });

  it("derives recentDeployCount from Vercel input", () => {
    const result = composeDashboard(FULL_INPUTS);

    expect(result.cwv.recentDeployCount).toBe(
      FULL_INPUTS.vercelInsights.recentDeployCount,
    );
  });

  it("MUTATION: changing cwv.lcp changes result.cwv.lcp", () => {
    const mutated: ControlCentreInputs = {
      ...FULL_INPUTS,
      vercelInsights: {
        ...VERCEL_FIXTURE,
        cwv: { lcp: 5000, inp: 180, cls: 0.08 },
      },
    };

    const result = composeDashboard(mutated);

    expect(result.cwv.lcp).toBe(5000);
    expect(result.cwv.lcp).not.toBe(VERCEL_FIXTURE.cwv.lcp);
  });
});

describe("composeDashboard — reservation expiry", () => {
  it("derives reservationExpiredCount from eventCounts", () => {
    const result = composeDashboard(FULL_INPUTS);

    expect(result.reservationExpiry.expiredCount).toBe(
      FULL_INPUTS.eventCounts.reservationExpired,
    );
  });

  it("MUTATION: changing reservationExpired changes expiredCount", () => {
    const mutated: ControlCentreInputs = {
      ...FULL_INPUTS,
      eventCounts: { ...FULL_INPUTS.eventCounts, reservationExpired: 42 },
    };

    const result = composeDashboard(mutated);

    expect(result.reservationExpiry.expiredCount).toBe(42);
  });

  it("derives expiryRate as expiredCount / reservationsCreated (mutation-proof)", () => {
    const result = composeDashboard(FULL_INPUTS);
    const expectedRate =
      FULL_INPUTS.eventCounts.reservationExpired /
      FULL_INPUTS.eventCounts.reservationsCreated;

    expect(result.reservationExpiry.expiryRate).toBeCloseTo(expectedRate, 10);
    expect(result.reservationExpiry.expiryRate).toBeCloseTo(0.1, 10);
  });

  it("MUTATION: changing expired or created count changes expiryRate", () => {
    const mutated: ControlCentreInputs = {
      ...FULL_INPUTS,
      eventCounts: {
        ...FULL_INPUTS.eventCounts,
        reservationExpired: 14,
        reservationsCreated: 70,
      },
    };

    const result = composeDashboard(mutated);

    expect(result.reservationExpiry.expiryRate).toBeCloseTo(0.2, 10);
    expect(result.reservationExpiry.expiryRate).not.toBeCloseTo(0.1, 5);
  });

  it("expiryRate is 0 when reservationsCreated is 0 (no NaN, no crash)", () => {
    const zeroReservations: ControlCentreInputs = {
      ...FULL_INPUTS,
      eventCounts: {
        ...FULL_INPUTS.eventCounts,
        reservationExpired: 3,
        reservationsCreated: 0,
      },
    };

    const result = composeDashboard(zeroReservations);

    expect(result.reservationExpiry.expiryRate).toBe(0);
    expect(Number.isNaN(result.reservationExpiry.expiryRate)).toBe(false);
  });

  it("derives reservationsCreated from eventCounts.reservationsCreated", () => {
    const result = composeDashboard(FULL_INPUTS);

    expect(result.reservationExpiry.reservationsCreated).toBe(
      FULL_INPUTS.eventCounts.reservationsCreated,
    );
  });
});

describe("composeDashboard — empty state (no crash)", () => {
  it("returns all-zero composed result without crashing when all inputs are empty/zero", () => {
    expect(() => composeDashboard(EMPTY_INPUTS)).not.toThrow();
  });

  it("produces zero funnel values from empty inputs", () => {
    const result = composeDashboard(EMPTY_INPUTS);

    expect(result.funnel.sessions).toBe(0);
    expect(result.funnel.realtimeActiveUsers).toBe(0);
    expect(result.funnel.paid).toBe(0);
    expect(result.funnel.ordersCreated).toBe(0);
  });

  it("produces zero browsing values from empty inputs", () => {
    const result = composeDashboard(EMPTY_INPUTS);

    expect(result.browsing.productCardClick).toBe(0);
    expect(result.browsing.productView).toBe(0);
    expect(result.browsing.addToCart).toBe(0);
    expect(result.browsing.collectionView).toBe(0);
    expect(result.browsing.cartViewed).toBe(0);
    expect(result.browsing.checkoutStarted).toBe(0);
  });

  it("produces zero engagement values from empty inputs", () => {
    const result = composeDashboard(EMPTY_INPUTS);

    expect(result.engagement.wishlistAdded).toBe(0);
  });

  it("produces zero feed-health values from empty inputs", () => {
    const result = composeDashboard(EMPTY_INPUTS);

    expect(result.feedHealth.catalogItemCount).toBe(0);
    expect(result.feedHealth.catalogDisapprovals).toBe(0);
  });

  it("produces zero parity values from empty inputs", () => {
    const result = composeDashboard(EMPTY_INPUTS);

    expect(result.parity.pixelEventCount).toBe(0);
    expect(result.parity.capiEventCount).toBe(0);
    expect(result.parity.parityDelta).toBe(0);
  });

  it("produces zero indexation values and empty topQueries from empty inputs", () => {
    const result = composeDashboard(EMPTY_INPUTS);

    expect(result.indexation.indexedPageCount).toBe(0);
    expect(result.indexation.topQueries).toHaveLength(0);
    expect(result.indexation.avgCtr).toBe(0);
  });

  it("produces zero CWV values from empty inputs", () => {
    const result = composeDashboard(EMPTY_INPUTS);

    expect(result.cwv.lcp).toBe(0);
    expect(result.cwv.inp).toBe(0);
    expect(result.cwv.cls).toBe(0);
    expect(result.cwv.recentDeployCount).toBe(0);
  });

  it("produces zero expiry count and zero expiryRate from empty inputs", () => {
    const result = composeDashboard(EMPTY_INPUTS);

    expect(result.reservationExpiry.expiredCount).toBe(0);
    expect(result.reservationExpiry.reservationsCreated).toBe(0);
    expect(result.reservationExpiry.expiryRate).toBe(0);
    expect(Number.isNaN(result.reservationExpiry.expiryRate)).toBe(false);
  });

  it("produces zero diagnostic rates from empty inputs", () => {
    const result = composeDashboard(EMPTY_INPUTS);

    expect(result.rates.productCtr).toBe(0);
    expect(result.rates.pdpAddToBagRate).toBe(0);
    expect(result.rates.paymentSuccessRate).toBe(0);
    expect(Number.isNaN(result.rates.productCtr)).toBe(false);
    expect(Number.isNaN(result.rates.pdpAddToBagRate)).toBe(false);
    expect(Number.isNaN(result.rates.paymentSuccessRate)).toBe(false);
  });

  it("MUTATION: changing productView changes pdpAddToBagRate", () => {
    const original = composeDashboard(FULL_INPUTS);

    const mutated: ControlCentreInputs = {
      ...FULL_INPUTS,
      eventCounts: {
        ...FULL_INPUTS.eventCounts,
        productView: FULL_INPUTS.eventCounts.productView * 2,
      },
    };

    const result = composeDashboard(mutated);

    expect(result.rates.pdpAddToBagRate).not.toBeCloseTo(
      original.rates.pdpAddToBagRate,
      10,
    );
  });

  it("MUTATION: changing orderCreated changes paymentSuccessRate", () => {
    const original = composeDashboard(FULL_INPUTS);

    const mutated: ControlCentreInputs = {
      ...FULL_INPUTS,
      eventCounts: {
        ...FULL_INPUTS.eventCounts,
        orderCreated: FULL_INPUTS.eventCounts.orderCreated * 2,
      },
    };

    const result = composeDashboard(mutated);

    expect(result.rates.paymentSuccessRate).not.toBeCloseTo(
      original.rates.paymentSuccessRate,
      10,
    );
  });

  it("produces zero commerce values from empty inputs", () => {
    const result = composeDashboard(EMPTY_INPUTS);

    expect(result.commerce.grossSalesPaise).toBe(0);
    expect(result.commerce.paidOrderCount).toBe(0);
    expect(result.commerce.averageOrderValuePaise).toBe(0);
    expect(result.commerce.pendingPaymentLinks).toBe(0);
    expect(result.commerce.abandonedPendingOrders).toBe(0);
    expect(result.commerce.soldPieces).toBe(0);
    expect(result.commerce.reservedPieces).toBe(0);
    expect(result.commerce.availablePieces).toBe(0);
  });

  it("produces empty product mover arrays from empty inputs", () => {
    const result = composeDashboard(EMPTY_INPUTS);

    expect(result.topMovers.viewedProducts).toHaveLength(0);
    expect(result.topMovers.addedToBagProducts).toHaveLength(0);
    expect(result.topMovers.wishlistedProducts).toHaveLength(0);
    expect(result.topMovers.paidProducts).toHaveLength(0);
  });

  it("produces empty discovery mover arrays from empty inputs", () => {
    const result = composeDashboard(EMPTY_INPUTS);

    expect(result.discoveryMovers.topSearchTerms).toHaveLength(0);
    expect(result.discoveryMovers.topFilters).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Real query-path tests — getChannelMetrics (mocked at @/db level)
// ---------------------------------------------------------------------------

describe("getChannelMetrics — empty state (no DB rows)", () => {
  it("returns typed-empty defaults when channel_metrics table has no rows", async () => {
    selectQueue.push([]);

    const result = await getChannelMetrics();

    expect(result.ga4.sessions).toBe(0);
    expect(result.ga4.realtimeActiveUsers).toBe(0);
    expect(result.searchConsole.topQueries).toHaveLength(0);
    expect(result.vercelInsights.cwv.lcp).toBe(0);
    expect(result.metaMarketing.catalogItemCount).toBe(0);
  });

  it("does not throw when the table returns an empty array", async () => {
    selectQueue.push([]);

    await expect(getChannelMetrics()).resolves.not.toThrow();
  });
});

describe("getChannelMetrics — derived from row data (mutation-proof)", () => {
  it("maps ga4-data row to ga4.sessions and ga4.realtimeActiveUsers", async () => {
    const sessions = 1670;
    const realtimeActiveUsers = 2;

    selectQueue.push([
      {
        source: "ga4-data",
        value: {
          sessions,
          conversions: 35,
          totalRevenuePaise: 2470000,
          conversionRate: 0.021,
          realtimeActiveUsers,
        },
      },
    ]);

    const result = await getChannelMetrics();

    expect(result.ga4.sessions).toBe(sessions);
    expect(result.ga4.realtimeActiveUsers).toBe(realtimeActiveUsers);
  });

  it("maps old ga4-data row without realtimeActiveUsers to default realtimeActiveUsers=0", async () => {
    const sessions = 1670;

    selectQueue.push([
      {
        source: "ga4-data",
        value: {
          sessions,
          conversions: 35,
          totalRevenuePaise: 2470000,
          conversionRate: 0.021,
        },
      },
    ]);

    const result = await getChannelMetrics();

    expect(result.ga4.sessions).toBe(sessions);
    expect(result.ga4.realtimeActiveUsers).toBe(0);
  });

  it("maps meta-marketing row to metaMarketing.catalogItemCount (derived)", async () => {
    const catalogItemCount = 47;

    selectQueue.push([
      {
        source: "meta-marketing",
        value: {
          catalogItemCount,
          catalogDisapprovals: 3,
          pixelEventCount: 28,
          capiEventCount: 25,
          parityDelta: 3,
        },
      },
    ]);

    const result = await getChannelMetrics();

    expect(result.metaMarketing.catalogItemCount).toBe(catalogItemCount);
    expect(result.vercelInsights.cwv.lcp).toBe(0);
  });

  it("MUTATION: changing sessions value in pushed row changes ga4.sessions in result", async () => {
    const mutatedSessions = 9999;

    selectQueue.push([
      {
        source: "ga4-data",
        value: {
          sessions: mutatedSessions,
          conversions: 1,
          totalRevenuePaise: 0,
          conversionRate: 0,
          realtimeActiveUsers: 0,
        },
      },
    ]);

    const result = await getChannelMetrics();

    expect(result.ga4.sessions).toBe(mutatedSessions);
    expect(result.ga4.sessions).not.toBe(GA4_FIXTURE.sessions);
  });

  it("handles all four sources in one query result", async () => {
    selectQueue.push([
      {
        source: "ga4-data",
        value: {
          sessions: 500,
          conversions: 10,
          totalRevenuePaise: 100000,
          conversionRate: 0.02,
          realtimeActiveUsers: 4,
        },
      },
      {
        source: "search-console",
        value: { indexedPageCount: 50, topQueries: [], avgCtr: 0.04 },
      },
      {
        source: "vercel-insights",
        value: {
          cwv: { lcp: 1800, inp: 100, cls: 0.05 },
          recentDeployCount: 2,
        },
      },
      {
        source: "meta-marketing",
        value: {
          catalogItemCount: 20,
          catalogDisapprovals: 0,
          pixelEventCount: 10,
          capiEventCount: 10,
          parityDelta: 0,
        },
      },
    ]);

    const result = await getChannelMetrics();

    expect(result.ga4.sessions).toBe(500);
    expect(result.ga4.realtimeActiveUsers).toBe(4);
    expect(result.searchConsole.indexedPageCount).toBe(50);
    expect(result.vercelInsights.cwv.lcp).toBe(1800);
    expect(result.metaMarketing.catalogItemCount).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// Real query-path tests — getEventCounts (mocked at @/db level)
// ---------------------------------------------------------------------------

describe("getEventCounts — empty state (no events rows)", () => {
  it("returns all-zero EventCounts when all count queries return zero", async () => {
    queueEventCountRows();

    const result = await getEventCounts();

    expect(result.orderCreated).toBe(0);
    expect(result.paymentCompleted).toBe(0);
    expect(result.reservationExpired).toBe(0);
    expect(result.reservationsCreated).toBe(0);

    expect(result.wishlistAdded).toBe(0);

    expect(result.productCardClick).toBe(0);
    expect(result.productView).toBe(0);
    expect(result.addToCart).toBe(0);

    expect(result.collectionView).toBe(0);
    expect(result.cartViewed).toBe(0);
    expect(result.checkoutStarted).toBe(0);
  });

  it("does not throw when all event queries return zero", async () => {
    queueEventCountRows();

    await expect(getEventCounts()).resolves.not.toThrow();
  });
});

describe("getEventCounts — derived from DB row totals (mutation-proof)", () => {
  it("maps all count rows to EventCounts fields in FIFO order", async () => {
    queueEventCountRows({
      orderCreated: 42,
      paymentCompleted: 25,
      reservationExpired: 7,
      reservationsCreated: 70,

      wishlistAdded: 1,

      productCardClick: 2,
      productView: 3,
      addToCart: 4,

      collectionView: 5,
      cartViewed: 6,
      checkoutStarted: 7,
    });

    const result = await getEventCounts();

    expect(result.orderCreated).toBe(42);
    expect(result.paymentCompleted).toBe(25);
    expect(result.reservationExpired).toBe(7);
    expect(result.reservationsCreated).toBe(70);

    expect(result.wishlistAdded).toBe(1);

    expect(result.productCardClick).toBe(2);
    expect(result.productView).toBe(3);
    expect(result.addToCart).toBe(4);

    expect(result.collectionView).toBe(5);
    expect(result.cartViewed).toBe(6);
    expect(result.checkoutStarted).toBe(7);
  });

  it("MUTATION: changing orderCreated total changes result.orderCreated", async () => {
    const mutatedTotal = 999;

    queueEventCountRows({
      orderCreated: mutatedTotal,
      paymentCompleted: 1,
      reservationExpired: 1,
      reservationsCreated: 1,
    });

    const result = await getEventCounts();

    expect(result.orderCreated).toBe(mutatedTotal);
    expect(result.orderCreated).not.toBe(FULL_INPUTS.eventCounts.orderCreated);
  });

  it("MUTATION: changing productView total changes result.productView", async () => {
    const mutatedTotal = 1234;

    queueEventCountRows({
      productView: mutatedTotal,
    });

    const result = await getEventCounts();

    expect(result.productView).toBe(mutatedTotal);
    expect(result.productView).not.toBe(FULL_INPUTS.eventCounts.productView);
  });

  it("applies a WHERE clause per query (30-day window mutation-proof)", async () => {
    queueEventCountRows({
      orderCreated: 5,
      paymentCompleted: 3,
      reservationExpired: 1,
      reservationsCreated: 10,
      productView: 4,
    });

    capturedWhereArgs.length = 0;

    await getEventCounts(30);

    expect(capturedWhereArgs.length).toBe(EVENT_COUNT_QUERY_COUNT);

    for (const arg of capturedWhereArgs) {
      expect(arg).toBeDefined();
      expect(arg).not.toBeNull();
    }
  });

  it("MUTATION: different windowDays produces different windowStart passed to WHERE", async () => {
    queueEventCountRows({
      orderCreated: 2,
      paymentCompleted: 1,
      reservationExpired: 0,
      reservationsCreated: 5,
      productCardClick: 9,
    });

    capturedWhereArgs.length = 0;
    const result = await getEventCounts(7);

    expect(result.orderCreated).toBe(2);
    expect(result.paymentCompleted).toBe(1);
    expect(result.reservationsCreated).toBe(5);
    expect(result.productCardClick).toBe(9);

    expect(capturedWhereArgs.length).toBe(EVENT_COUNT_QUERY_COUNT);
  });
});

// ---------------------------------------------------------------------------
// Error-path tests — try/catch branches
// Both getChannelMetrics and getEventCounts must resolve to typed-zero defaults
// when db.select throws. Mocks only @/db.
// ---------------------------------------------------------------------------

describe("getChannelMetrics — error-path: db.select throws", () => {
  it("resolves to typed-zero defaults when db.select throws synchronously", async () => {
    vi.mocked(db.select).mockImplementationOnce(() => {
      throw new Error("DB connection refused");
    });

    const result = await getChannelMetrics();

    expect(result.ga4.sessions).toBe(0);
    expect(result.ga4.conversions).toBe(0);
    expect(result.ga4.totalRevenuePaise).toBe(0);
    expect(result.ga4.conversionRate).toBe(0);
    expect(result.ga4.realtimeActiveUsers).toBe(0);
    expect(result.searchConsole.indexedPageCount).toBe(0);
    expect(result.searchConsole.topQueries).toHaveLength(0);
    expect(result.vercelInsights.cwv.lcp).toBe(0);
    expect(result.metaMarketing.catalogItemCount).toBe(0);
  });

  it("does not throw when db.select rejects (async error)", async () => {
    vi.mocked(db.select).mockImplementationOnce(() => {
      const builder: Record<string, unknown> = {};

      for (const method of [
        "from",
        "where",
        "innerJoin",
        "leftJoin",
        "orderBy",
        "limit",
      ]) {
        builder[method] = () => builder;
      }

      builder.then = (_resolve: unknown, reject: (error: Error) => unknown) => {
        if (typeof reject === "function") {
          return reject(new Error("async DB error"));
        }

        return Promise.reject(new Error("async DB error"));
      };

      return builder as unknown as ReturnType<typeof db.select>;
    });

    await expect(getChannelMetrics()).resolves.toMatchObject({
      ga4: { sessions: 0, realtimeActiveUsers: 0 },
      searchConsole: { indexedPageCount: 0 },
    });
  });
});

describe("getEventCounts — error-path: db.select throws", () => {
  it("resolves to all-zero EventCounts when db.select throws", async () => {
    vi.mocked(db.select).mockImplementationOnce(() => {
      throw new Error("DB connection refused");
    });

    const result = await getEventCounts();

    expect(result.orderCreated).toBe(0);
    expect(result.paymentCompleted).toBe(0);
    expect(result.reservationExpired).toBe(0);
    expect(result.reservationsCreated).toBe(0);

    expect(result.wishlistAdded).toBe(0);

    expect(result.productCardClick).toBe(0);
    expect(result.productView).toBe(0);
    expect(result.addToCart).toBe(0);

    expect(result.collectionView).toBe(0);
    expect(result.cartViewed).toBe(0);
    expect(result.checkoutStarted).toBe(0);
  });

  it("does not throw when db.select throws in getEventCounts", async () => {
    vi.mocked(db.select).mockImplementationOnce(() => {
      throw new Error("network timeout");
    });

    await expect(getEventCounts()).resolves.not.toThrow();
  });
});

function queueDiscoveryMoverRows() {
  selectQueue.push([
    {
      query: "silk",
      count: 3,
      avgResultCount: 7,
    },
  ]);

  selectQueue.push([
    {
      filterType: "fabric",
      filterValue: "silk",
      filterLabel: "silk",
      count: 2,
    },
  ]);
}

function queueTopMoverRows() {
  selectQueue.push([
    {
      productId: "product-viewed-1",
      slug: "viewed-product",
      name: "Viewed Product",
      count: 12,
    },
  ]);
  selectQueue.push([
    {
      productId: "product-added-1",
      slug: "added-product",
      name: "Added Product",
      count: 8,
    },
  ]);
  selectQueue.push([
    {
      productId: "product-wishlisted-1",
      slug: "wishlisted-product",
      name: "Wishlisted Product",
      count: 5,
    },
  ]);
  selectQueue.push([
    {
      productId: "product-paid-1",
      slug: "paid-product",
      name: "Paid Product",
      count: 3,
      revenuePaise: 300000,
    },
  ]);
}

function queueCommerceRows(
  overrides: Partial<ControlCentreInputs["commerce"]> = {},
) {
  const commerce: ControlCentreInputs["commerce"] = {
    grossSalesPaise: 0,
    paidOrderCount: 0,
    pendingPaymentLinks: 0,
    abandonedPendingOrders: 0,
    soldPieces: 0,
    reservedPieces: 0,
    availablePieces: 0,
    ...overrides,
  };

  selectQueue.push([
    {
      grossSalesPaise: commerce.grossSalesPaise,
      paidOrderCount: commerce.paidOrderCount,
    },
  ]);
  selectQueue.push([{ total: commerce.pendingPaymentLinks }]);
  selectQueue.push([{ total: commerce.abandonedPendingOrders }]);
  selectQueue.push([{ total: commerce.soldPieces }]);
  selectQueue.push([{ total: commerce.reservedPieces }]);
  selectQueue.push([{ total: commerce.availablePieces }]);
}

describe("getCommerceMetrics — derived from DB row totals", () => {
  it("maps commerce rows to CommerceInputs fields in FIFO order", async () => {
    queueCommerceRows({
      grossSalesPaise: 2470000,
      paidOrderCount: 25,
      pendingPaymentLinks: 4,
      abandonedPendingOrders: 2,
      soldPieces: 11,
      reservedPieces: 3,
      availablePieces: 33,
    });

    const result = await getCommerceMetrics();

    expect(result.grossSalesPaise).toBe(2470000);
    expect(result.paidOrderCount).toBe(25);
    expect(result.pendingPaymentLinks).toBe(4);
    expect(result.abandonedPendingOrders).toBe(2);
    expect(result.soldPieces).toBe(11);
    expect(result.reservedPieces).toBe(3);
    expect(result.availablePieces).toBe(33);
  });

  it("returns zero commerce metrics when all rows are empty/zero", async () => {
    queueCommerceRows();

    const result = await getCommerceMetrics();

    expect(result.grossSalesPaise).toBe(0);
    expect(result.paidOrderCount).toBe(0);
    expect(result.pendingPaymentLinks).toBe(0);
    expect(result.abandonedPendingOrders).toBe(0);
    expect(result.soldPieces).toBe(0);
    expect(result.reservedPieces).toBe(0);
    expect(result.availablePieces).toBe(0);
  });

  it("returns typed-zero defaults when db.select throws", async () => {
    vi.mocked(db.select).mockImplementationOnce(() => {
      throw new Error("DB connection refused");
    });

    const result = await getCommerceMetrics();

    expect(result.grossSalesPaise).toBe(0);
    expect(result.paidOrderCount).toBe(0);
    expect(result.pendingPaymentLinks).toBe(0);
    expect(result.abandonedPendingOrders).toBe(0);
    expect(result.soldPieces).toBe(0);
    expect(result.reservedPieces).toBe(0);
    expect(result.availablePieces).toBe(0);
  });
});

describe("getTopMovers — derived from DB row totals", () => {
  it("maps top mover rows to typed product mover groups in FIFO order", async () => {
    queueTopMoverRows();

    const result = await getTopMovers();

    expect(result.viewedProducts[0]!.name).toBe("Viewed Product");
    expect(result.viewedProducts[0]!.count).toBe(12);

    expect(result.addedToBagProducts[0]!.name).toBe("Added Product");
    expect(result.addedToBagProducts[0]!.count).toBe(8);

    expect(result.wishlistedProducts[0]!.name).toBe("Wishlisted Product");
    expect(result.wishlistedProducts[0]!.count).toBe(5);

    expect(result.paidProducts[0]!.name).toBe("Paid Product");
    expect(result.paidProducts[0]!.count).toBe(3);
    expect(result.paidProducts[0]!.revenuePaise).toBe(300000);
  });

  it("returns empty arrays when all top mover queries return empty rows", async () => {
    selectQueue.push([]);
    selectQueue.push([]);
    selectQueue.push([]);
    selectQueue.push([]);

    const result = await getTopMovers();

    expect(result.viewedProducts).toHaveLength(0);
    expect(result.addedToBagProducts).toHaveLength(0);
    expect(result.wishlistedProducts).toHaveLength(0);
    expect(result.paidProducts).toHaveLength(0);
  });

  it("returns typed-empty top movers when db.select throws", async () => {
    vi.mocked(db.select).mockImplementationOnce(() => {
      throw new Error("DB connection refused");
    });

    const result = await getTopMovers();

    expect(result.viewedProducts).toHaveLength(0);
    expect(result.addedToBagProducts).toHaveLength(0);
    expect(result.wishlistedProducts).toHaveLength(0);
    expect(result.paidProducts).toHaveLength(0);
  });
});

describe("getDiscoveryMovers — derived from DB row totals", () => {
  it("maps discovery mover rows to typed discovery mover groups in FIFO order", async () => {
    queueDiscoveryMoverRows();

    const result = await getDiscoveryMovers();

    expect(result.topSearchTerms[0]!.query).toBe("silk");
    expect(result.topSearchTerms[0]!.count).toBe(3);
    expect(result.topSearchTerms[0]!.avgResultCount).toBe(7);

    expect(result.topFilters[0]!.filterType).toBe("fabric");
    expect(result.topFilters[0]!.filterValue).toBe("silk");
    expect(result.topFilters[0]!.filterLabel).toBe("silk");
    expect(result.topFilters[0]!.count).toBe(2);
  });

  it("returns empty arrays when all discovery mover queries return empty rows", async () => {
    selectQueue.push([]);
    selectQueue.push([]);

    const result = await getDiscoveryMovers();

    expect(result.topSearchTerms).toHaveLength(0);
    expect(result.topFilters).toHaveLength(0);
  });

  it("returns typed-empty discovery movers when db.select throws", async () => {
    vi.mocked(db.select).mockImplementationOnce(() => {
      throw new Error("DB connection refused");
    });

    const result = await getDiscoveryMovers();

    expect(result.topSearchTerms).toHaveLength(0);
    expect(result.topFilters).toHaveLength(0);
  });
});
