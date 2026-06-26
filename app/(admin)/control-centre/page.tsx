import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import {
  Activity,
  BarChart3,
  Eye,
  Globe,
  Heart,
  MousePointerClick,
  Package,
  RefreshCw,
  ShoppingBag,
  ShoppingCart,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { upsertChannelMetric } from "@/db/queries/channel-metrics";
import {
  getChannelMetrics,
  getCommerceMetrics,
  getDiscoveryMovers,
  getEventCounts,
  getTopMovers,
} from "@/db/queries/control-centre";
import { composeDashboard } from "@/lib/control-centre/compose-dashboard";
import { pullAllMetrics } from "@/lib/ports/channel-metrics";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Control Centre",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function refreshControlCentreMetrics() {
  "use server";

  const metrics = await pullAllMetrics();
  const fetchedAt = new Date();

  await Promise.allSettled([
    upsertChannelMetric({
      source: "search-console",
      metricKey: "metrics",
      value: metrics.searchConsole as unknown as Record<string, unknown>,
      fetchedAt,
    }),
    upsertChannelMetric({
      source: "ga4-data",
      metricKey: "metrics",
      value: metrics.ga4Data as unknown as Record<string, unknown>,
      fetchedAt,
    }),
    upsertChannelMetric({
      source: "vercel-insights",
      metricKey: "metrics",
      value: metrics.vercelInsights as unknown as Record<string, unknown>,
      fetchedAt,
    }),
    upsertChannelMetric({
      source: "meta-marketing",
      metricKey: "metrics",
      value: metrics.metaMarketing as unknown as Record<string, unknown>,
      fetchedAt,
    }),
  ]);

  revalidatePath("/control-centre");
}

export default async function ControlCentrePage() {
  const [
    channelData,
    eventCounts,
    commerceData,
    topMoversData,
    discoveryMoversData,
  ] = await Promise.all([
    getChannelMetrics(),
    getEventCounts(30),
    getCommerceMetrics(30),
    getTopMovers(30),
    getDiscoveryMovers(30),
  ]);

  const dashboard = composeDashboard({
    ga4: channelData.ga4,
    searchConsole: channelData.searchConsole,
    vercelInsights: channelData.vercelInsights,
    metaMarketing: channelData.metaMarketing,
    eventCounts,
    commerce: commerceData,
    topMovers: topMoversData,
    discoveryMovers: discoveryMoversData,
  });

  const {
    funnel,
    browsing,
    rates,
    commerce,
    topMovers,
    discoveryMovers,
    engagement,
    indexation,
    cwv,
    reservationExpiry,
  } = dashboard;

  const hasChannelData =
    funnel.sessions > 0 ||
    browsing.collectionView > 0 ||
    browsing.productCardClick > 0 ||
    browsing.productView > 0 ||
    browsing.addToCart > 0 ||
    browsing.cartViewed > 0 ||
    browsing.checkoutStarted > 0 ||
    engagement.wishlistAdded > 0 ||
    indexation.indexedPageCount > 0 ||
    cwv.lcp > 0 ||
    cwv.inp > 0 ||
    cwv.cls > 0 ||
    cwv.recentDeployCount > 0 ||
    funnel.ordersCreated > 0 ||
    funnel.realtimeActiveUsers > 0 ||
    commerce.grossSalesPaise > 0 ||
    commerce.pendingPaymentLinks > 0 ||
    commerce.abandonedPendingOrders > 0 ||
    commerce.soldPieces > 0 ||
    commerce.reservedPieces > 0 ||
    commerce.availablePieces > 0 ||
    topMovers.viewedProducts.length > 0 ||
    topMovers.addedToBagProducts.length > 0 ||
    topMovers.wishlistedProducts.length > 0 ||
    topMovers.paidProducts.length > 0 ||
    discoveryMovers.topSearchTerms.length > 0 ||
    discoveryMovers.topFilters.length > 0 ||
    funnel.paid > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">
            Channels
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">
            Control Centre
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Operations dashboard — funnel, commerce, movers, channel health, and
            CWV.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <RefreshMetricButton label="Refresh all Control Centre metrics" />
          <div className="rounded-full border border-border/70 bg-card/80 px-4 py-2 text-xs uppercase tracking-[0.25em] text-muted-foreground shadow-sm">
            {hasChannelData ? "Live data" : "Awaiting first cron run"}
          </div>
        </div>
      </div>

      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          Revenue Funnel
        </h3>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <RefreshableMetricCard
            label="Sessions (GA4)"
            value={
              funnel.sessions === 0
                ? "—"
                : funnel.sessions.toLocaleString("en-IN")
            }
            sublabel="30-day window"
            icon={Activity}
          />
          <RefreshableMetricCard
            label="Realtime Users"
            value={
              funnel.realtimeActiveUsers === 0
                ? "—"
                : funnel.realtimeActiveUsers.toLocaleString("en-IN")
            }
            sublabel="GA4 active users · last 30 minutes"
            icon={Activity}
          />
          <RefreshableMetricCard
            label="Orders Created"
            value={
              funnel.ordersCreated === 0
                ? "—"
                : funnel.ordersCreated.toLocaleString("en-IN")
            }
            sublabel="order_created events · 30 days"
            icon={ShoppingCart}
          />
          <RefreshableMetricCard
            label="Paid"
            value={
              funnel.paid === 0 ? "—" : funnel.paid.toLocaleString("en-IN")
            }
            sublabel="payment_completed events · 30 days"
            icon={BarChart3}
          />
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          Commerce Snapshot
        </h3>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <RefreshableMetricCard
            label="Gross Sales"
            value={formatMoneyPaise(commerce.grossSalesPaise)}
            sublabel="paid orders · 30 days"
            icon={BarChart3}
          />
          <RefreshableMetricCard
            label="Average Order Value"
            value={formatMoneyPaise(commerce.averageOrderValuePaise)}
            sublabel="gross sales / paid orders"
            icon={ShoppingBag}
          />
          <RefreshableMetricCard
            label="Pending Payment Links"
            value={formatMetricCount(commerce.pendingPaymentLinks)}
            sublabel="pending orders · 30 days"
            icon={ShoppingCart}
          />
          <RefreshableMetricCard
            label="Abandoned Pending"
            value={formatMetricCount(commerce.abandonedPendingOrders)}
            sublabel="pending for more than 30 minutes"
            icon={Zap}
          />
          <RefreshableMetricCard
            label="Sold Pieces"
            value={formatMetricCount(commerce.soldPieces)}
            sublabel="published products marked sold"
            icon={Package}
          />
          <RefreshableMetricCard
            label="Reserved Pieces"
            value={formatMetricCount(commerce.reservedPieces)}
            sublabel="published products currently reserved"
            icon={Package}
          />
          <RefreshableMetricCard
            label="Available Pieces"
            value={formatMetricCount(commerce.availablePieces)}
            sublabel="published products available"
            icon={Package}
          />
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          Browsing Funnel
        </h3>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <RefreshableMetricCard
            label="Collection Views"
            value={formatMetricCount(browsing.collectionView)}
            sublabel="collection_view events · 30 days"
            icon={Activity}
          />
          <RefreshableMetricCard
            label="Product Clicks"
            value={formatMetricCount(browsing.productCardClick)}
            sublabel="product_card_click events · 30 days"
            icon={MousePointerClick}
          />
          <RefreshableMetricCard
            label="Product Views"
            value={formatMetricCount(browsing.productView)}
            sublabel="product_view events · 30 days"
            icon={Eye}
          />
          <RefreshableMetricCard
            label="Add to Bag"
            value={formatMetricCount(browsing.addToCart)}
            sublabel="add_to_cart events · 30 days"
            icon={ShoppingBag}
          />
          <RefreshableMetricCard
            label="Cart Viewed"
            value={formatMetricCount(browsing.cartViewed)}
            sublabel="cart_viewed events · 30 days"
            icon={ShoppingCart}
          />
          <RefreshableMetricCard
            label="Checkout Started"
            value={formatMetricCount(browsing.checkoutStarted)}
            sublabel="checkout_started events · 30 days"
            icon={BarChart3}
          />
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          Diagnostic Rates
        </h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <RefreshableMetricCard
            label="Product CTR"
            value={formatMetricRate(rates.productCtr)}
            sublabel="product clicks / collection views"
            icon={MousePointerClick}
          />
          <RefreshableMetricCard
            label="PDP Add-to-Bag Rate"
            value={formatMetricRate(rates.pdpAddToBagRate)}
            sublabel="add to bag / product views"
            icon={ShoppingBag}
          />
          <RefreshableMetricCard
            label="Payment Success Rate"
            value={formatMetricRate(rates.paymentSuccessRate)}
            sublabel="paid / orders created"
            icon={BarChart3}
          />
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          Engagement
        </h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <RefreshableMetricCard
            label="Wishlist Adds"
            value={
              engagement.wishlistAdded === 0
                ? "—"
                : engagement.wishlistAdded.toLocaleString("en-IN")
            }
            sublabel="wishlist_added events · 30 days"
            icon={Heart}
          />
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          Product Movers
        </h3>
        <div className="grid gap-4 lg:grid-cols-2">
          <ProductMoverCard
            title="Top Viewed Products"
            description="product_view events · 30 days"
            items={topMovers.viewedProducts}
            countLabel="views"
          />
          <ProductMoverCard
            title="Top Added-to-Bag"
            description="add_to_cart events · 30 days"
            items={topMovers.addedToBagProducts}
            countLabel="adds"
          />
          <ProductMoverCard
            title="Top Wishlisted"
            description="wishlist_added events · 30 days"
            items={topMovers.wishlistedProducts}
            countLabel="adds"
          />
          <ProductMoverCard
            title="Top Paid Products"
            description="paid order_items · 30 days"
            items={topMovers.paidProducts}
            countLabel="sold"
            showRevenue
          />
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          Discovery Movers
        </h3>
        <div className="grid gap-4 lg:grid-cols-2">
          <SearchMoverCard items={discoveryMovers.topSearchTerms} />
          <FilterMoverCard items={discoveryMovers.topFilters} />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <SectionTitle title="Channel Roadmap" badge="Coming soon" />

          <Card className="border-dashed border-border/70 bg-muted/20 shadow-sm">
            <CardContent className="grid gap-3 pt-4 sm:grid-cols-2 xl:grid-cols-5">
              <RoadmapItem
                icon={Package}
                title="Meta Catalog"
                description="Catalog items + disapprovals"
              />
              <RoadmapItem
                icon={Activity}
                title="Meta Pixel"
                description="Browser-side event stream"
              />
              <RoadmapItem
                icon={Activity}
                title="CAPI Events"
                description="Server-side event stream"
              />
              <RoadmapItem
                icon={Zap}
                title="Pixel / CAPI Parity"
                description="Deduplication and delta check"
              />
              <RoadmapItem
                icon={Globe}
                title="Search Console"
                description="Indexation + query health"
              />
            </CardContent>
          </Card>
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <section>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Indexation (Google Search Console)
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <RefreshableMetricCard
              label="Indexed Pages"
              value={
                indexation.indexedPageCount === 0
                  ? "—"
                  : indexation.indexedPageCount.toLocaleString("en-IN")
              }
              sublabel="GSC indexed page count"
              icon={Globe}
            />
            <RefreshableMetricCard
              label="Avg CTR"
              value={
                indexation.avgCtr === 0
                  ? "—"
                  : `${(indexation.avgCtr * 100).toFixed(1)}%`
              }
              sublabel="Average click-through rate"
              icon={BarChart3}
            />
          </div>

          {indexation.topQueries.length > 0 ? (
            <Card className="mt-4 border-border/70 bg-card/85 shadow-sm">
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle className="text-base">Top Queries</CardTitle>
                    <CardDescription>
                      Highest-click queries from GSC (30 days).
                    </CardDescription>
                  </div>
                  <RefreshMetricButton label="Refresh Google Search Console metrics" />
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {indexation.topQueries.slice(0, 5).map((q) => (
                  <div
                    key={q.query}
                    className="flex items-center justify-between rounded-xl border border-border/60 bg-background/70 px-3 py-2"
                  >
                    <span className="truncate text-sm">{q.query}</span>
                    <div className="ml-4 flex shrink-0 gap-4 text-xs text-muted-foreground">
                      <span>{q.clicks} clicks</span>
                      <span>{(q.ctr * 100).toFixed(1)}% CTR</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : (
            <Card className="mt-4 border-border/70 bg-card/85 shadow-sm">
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <CardTitle className="text-base">Top Queries</CardTitle>
                  <RefreshMetricButton label="Refresh Google Search Console metrics" />
                </div>
              </CardHeader>
              <CardContent className="pb-6 text-center text-sm text-muted-foreground">
                No query data yet — GSC cron has not run or creds not
                configured.
              </CardContent>
            </Card>
          )}
        </section>

        <div className="space-y-6">
          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                Core Web Vitals (Vercel p75)
              </h3>
              <RefreshMetricButton label="Refresh Vercel metrics" />
            </div>

            <Card className="border-border/70 bg-card/85 shadow-sm">
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">LCP</span>
                  <span className="font-medium">
                    {cwv.lcp === 0
                      ? "—"
                      : `${cwv.lcp.toLocaleString("en-IN")} ms`}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">INP</span>
                  <span className="font-medium">
                    {cwv.inp === 0
                      ? "—"
                      : `${cwv.inp.toLocaleString("en-IN")} ms`}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">CLS</span>
                  <span className="font-medium">
                    {cwv.cls === 0 ? "—" : cwv.cls.toFixed(3)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm border-t border-border/60 pt-3 mt-3">
                  <span className="text-muted-foreground">Recent deploys</span>
                  <span className="font-medium">{cwv.recentDeployCount}</span>
                </div>
              </CardContent>
            </Card>
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                Reservation Expiry
              </h3>
              <RefreshMetricButton label="Refresh reservation metrics" />
            </div>

            {reservationExpiry.reservationsCreated === 0 ? (
              <Card className="border-border/70 bg-card/85 shadow-sm">
                <CardContent className="py-6 text-center text-sm text-muted-foreground">
                  No reservations in the last 30 days.
                </CardContent>
              </Card>
            ) : (
              <Card className="border-border/70 bg-card/85 shadow-sm">
                <CardContent className="pt-4 space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      Expired (30 days)
                    </span>
                    <span className="font-medium">
                      {reservationExpiry.expiredCount === 0
                        ? "—"
                        : reservationExpiry.expiredCount.toLocaleString(
                            "en-IN",
                          )}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      Created (30 days)
                    </span>
                    <span className="font-medium">
                      {reservationExpiry.reservationsCreated.toLocaleString(
                        "en-IN",
                      )}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm border-t border-border/60 pt-3 mt-3">
                    <span className="text-muted-foreground">Expiry Rate</span>
                    <span className="font-medium">
                      {(reservationExpiry.expiryRate * 100).toFixed(1)}%
                    </span>
                  </div>
                </CardContent>
              </Card>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function formatMoneyPaise(value: number) {
  return value === 0
    ? "—"
    : new Intl.NumberFormat("en-IN", {
        currency: "INR",
        maximumFractionDigits: 0,
        style: "currency",
      }).format(value / 100);
}

function formatMetricCount(value: number) {
  return value === 0 ? "—" : value.toLocaleString("en-IN");
}

function formatMetricRate(value: number) {
  return value === 0 ? "—" : `${(value * 100).toFixed(1)}%`;
}

function formatCountLabel(count: number, singular: string) {
  return `${count.toLocaleString("en-IN")} ${
    count === 1 ? singular : `${singular}s`
  }`;
}

function formatFilterType(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatFilterValue(item: {
  filterLabel: string;
  filterType: string;
  filterValue: string;
}) {
  if (item.filterType !== "price_range") return item.filterLabel;

  const [min, max] = item.filterValue.split("-");
  if (!min || !max) return item.filterLabel;

  return `${formatFilterPaise(min)} – ${formatFilterPaise(max)}`;
}

function formatFilterPaise(value: string) {
  if (value === "min") return "Min";
  if (value === "max") return "Max";

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;

  return new Intl.NumberFormat("en-IN", {
    currency: "INR",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(numeric / 100);
}

function SearchMoverCard({
  items,
}: {
  items: Array<{
    avgResultCount: number;
    count: number;
    query: string;
  }>;
}) {
  return (
    <Card className="border-border/70 bg-card/85 shadow-sm">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">Top Search Terms</CardTitle>
            <CardDescription>search_performed events · 30 days</CardDescription>
          </div>
          <RefreshMetricButton label="Refresh Top Search Terms" />
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.length > 0 ? (
          items.map((item, index) => (
            <div
              key={`${item.query}-${index}`}
              className="flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-background/70 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  &ldquo;{item.query}&rdquo;
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  avg {item.avgResultCount.toFixed(1)} results
                </p>
              </div>

              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold">
                  {formatCountLabel(item.count, "search")}
                </p>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-3 py-6 text-center text-sm text-muted-foreground">
            No search movement yet.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FilterMoverCard({
  items,
}: {
  items: Array<{
    count: number;
    filterLabel: string;
    filterType: string;
    filterValue: string;
  }>;
}) {
  return (
    <Card className="border-border/70 bg-card/85 shadow-sm">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">Top Filters Used</CardTitle>
            <CardDescription>filter_applied events · 30 days</CardDescription>
          </div>
          <RefreshMetricButton label="Refresh Top Filters Used" />
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.length > 0 ? (
          items.map((item, index) => (
            <div
              key={`${item.filterType}-${item.filterValue}-${index}`}
              className="flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-background/70 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {formatFilterType(item.filterType)}: {formatFilterValue(item)}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {item.filterValue}
                </p>
              </div>

              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold">
                  {formatCountLabel(item.count, "use")}
                </p>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-3 py-6 text-center text-sm text-muted-foreground">
            No filter movement yet.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ProductMoverCard({
  countLabel,
  description,
  items,
  showRevenue = false,
  title,
}: {
  countLabel: string;
  description: string;
  items: Array<{
    count: number;
    name: string;
    productId: string | null;
    revenuePaise?: number;
    slug: string | null;
  }>;
  showRevenue?: boolean;
  title: string;
}) {
  return (
    <Card className="border-border/70 bg-card/85 shadow-sm">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <RefreshMetricButton label={`Refresh ${title}`} />
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.length > 0 ? (
          items.map((item, index) => (
            <div
              key={`${item.productId ?? item.slug ?? item.name}-${index}`}
              className="flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-background/70 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{item.name}</p>
                {item.slug ? (
                  <p className="truncate text-xs text-muted-foreground">
                    /collection/{item.slug}
                  </p>
                ) : null}
              </div>

              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold">
                  {item.count.toLocaleString("en-IN")} {countLabel}
                </p>
                {showRevenue && item.revenuePaise ? (
                  <p className="text-xs text-muted-foreground">
                    {formatMoneyPaise(item.revenuePaise)}
                  </p>
                ) : null}
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-3 py-6 text-center text-sm text-muted-foreground">
            No product movement yet.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RoadmapItem({
  description,
  icon: Icon,
  title,
}: {
  description: string;
  icon: LucideIcon;
  title: string;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/70 px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {title}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      </div>
    </div>
  );
}

function RefreshMetricButton({ label }: { label: string }) {
  return (
    <form action={refreshControlCentreMetrics}>
      <button
        aria-label={label}
        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border/70 bg-background/70 text-muted-foreground shadow-sm transition hover:border-primary/50 hover:text-primary"
        title={label}
        type="submit"
      >
        <RefreshCw className="h-3.5 w-3.5" />
      </button>
    </form>
  );
}

function SectionTitle({ badge, title }: { badge?: string; title: string }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-muted-foreground">
        {title}
      </h3>
      {badge ? (
        <span className="rounded-full border border-dashed border-border/80 bg-muted/30 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          {badge}
        </span>
      ) : null}
    </div>
  );
}

function RefreshableMetricCard({
  badge,
  comingSoon = false,
  icon: Icon,
  label,
  sublabel,
  value,
}: {
  badge?: string;
  comingSoon?: boolean;
  icon: LucideIcon;
  label: string;
  sublabel?: string;
  value: number | string;
}) {
  return (
    <Card
      className={cn(
        "border-border/70 bg-card/85 shadow-sm",
        comingSoon && "border-dashed bg-muted/20",
      )}
    >
      <CardHeader className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
              {label}
            </p>
            {badge ? (
              <span className="inline-flex rounded-full border border-border/70 bg-background/70 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                {badge}
              </span>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Icon className="h-4 w-4 text-muted-foreground" />
            <RefreshMetricButton label={`Refresh ${label}`} />
          </div>
        </div>

        <p
          className={cn(
            "text-2xl font-semibold tracking-tight",
            comingSoon && "text-muted-foreground",
          )}
        >
          {value}
        </p>

        {sublabel ? (
          <p className="text-xs text-muted-foreground">{sublabel}</p>
        ) : null}
      </CardHeader>
    </Card>
  );
}
