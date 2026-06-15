/**
 * P5-05: Control Centre — data-composition pure function.
 *
 * composeDashboard() accepts raw channel_metrics + event-count inputs and
 * returns a single structured object suitable for rendering the operations
 * dashboard. It is deliberately pure (no I/O, no side-effects) so it can be
 * unit-tested with mutation proofs.
 *
 * Section map:
 *   funnel        — revenue funnel: sessions → ordersCreated → paid
 *   feedHealth    — Meta catalog item count + disapprovals
 *   parity        — Meta Pixel vs CAPI event-count delta
 *   indexation    — GSC indexed-page count, avgCtr, top queries
 *   cwv           — Vercel CWV p75 (LCP/INP/CLS) + recent deploy count
 *   reservationExpiry — count of reservation_expired events (30-day window)
 */

import type {
  GA4DataMetrics,
  SearchConsoleMetrics,
  VercelInsightsMetrics,
  MetaMarketingMetrics,
  TopQuery,
} from "@/lib/ports/channel-metrics";

// ---------------------------------------------------------------------------
// Input type
// ---------------------------------------------------------------------------

export type EventCounts = {
  /** order_created events in the past 30 days */
  orderCreated: number;
  /** payment_completed events in the past 30 days */
  paymentCompleted: number;
  /** reservation_expired events in the past 30 days */
  reservationExpired: number;
  /** reservations rows created in the past 30 days (from reservations.createdAt) */
  reservationsCreated: number;
};

export type ControlCentreInputs = {
  ga4: GA4DataMetrics;
  searchConsole: SearchConsoleMetrics;
  vercelInsights: VercelInsightsMetrics;
  metaMarketing: MetaMarketingMetrics;
  eventCounts: EventCounts;
};

// ---------------------------------------------------------------------------
// Output type
// ---------------------------------------------------------------------------

export type FunnelMetrics = {
  /** GA4 sessions over past 30 days */
  sessions: number;
  /** Internal order_created events over past 30 days */
  ordersCreated: number;
  /** Internal payment_completed events over past 30 days */
  paid: number;
};

export type FeedHealthMetrics = {
  /** Meta catalog item count */
  catalogItemCount: number;
  /** Meta catalog disapprovals */
  catalogDisapprovals: number;
};

export type ParityMetrics = {
  /** Meta Pixel event count */
  pixelEventCount: number;
  /** Internal CAPI (payment_completed) event count */
  capiEventCount: number;
  /** pixel - capi: positive = pixel over-counts, negative = under-counts */
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
  /** reservationsCreated count in the same window (denominator for expiryRate) */
  reservationsCreated: number;
  /**
   * Fraction of reservations that expired: expiredCount / reservationsCreated.
   * 0 when reservationsCreated === 0 (guards divide-by-zero — never NaN).
   */
  expiryRate: number;
};

export type ControlCentreDashboard = {
  funnel: FunnelMetrics;
  feedHealth: FeedHealthMetrics;
  parity: ParityMetrics;
  indexation: IndexationMetrics;
  cwv: CwvComposed;
  reservationExpiry: ReservationExpiryMetrics;
};

// ---------------------------------------------------------------------------
// Pure composition function
// ---------------------------------------------------------------------------

/**
 * Compose a ControlCentreDashboard from raw channel-metric + event-count inputs.
 *
 * Pure function — no I/O. Every output value is strictly derived from the
 * input arguments. Mutation of any input field must change the relevant output.
 */
export function composeDashboard(inputs: ControlCentreInputs): ControlCentreDashboard {
  const { ga4, searchConsole, vercelInsights, metaMarketing, eventCounts } = inputs;

  const funnel: FunnelMetrics = {
    sessions: ga4.sessions,
    ordersCreated: eventCounts.orderCreated,
    paid: eventCounts.paymentCompleted,
  };

  const feedHealth: FeedHealthMetrics = {
    catalogItemCount: metaMarketing.catalogItemCount,
    catalogDisapprovals: metaMarketing.catalogDisapprovals,
  };

  const parity: ParityMetrics = {
    pixelEventCount: metaMarketing.pixelEventCount,
    capiEventCount: metaMarketing.capiEventCount,
    // Re-compute rather than trust the stored parityDelta so the test can
    // verify this is derived (mutation-proof: change pixel/capi → delta changes).
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
    // Guard divide-by-zero: 0 when denominator is 0, never NaN.
    expiryRate: reservationsCreated > 0 ? reservationExpired / reservationsCreated : 0,
  };

  return { funnel, feedHealth, parity, indexation, cwv, reservationExpiry };
}
