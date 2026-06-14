/**
 * P5-05: Control Centre — admin operations dashboard.
 *
 * Server Component (RSC) that reads channel_metrics + events and composes
 * the metrics via composeDashboard() before rendering.
 *
 * Auth: protected at the admin layout level (session.user.role === "admin").
 *
 * Sections:
 *   Revenue Funnel    — GA4 sessions → orders created → paid
 *   Feed Health       — Meta catalog item count + disapprovals
 *   Pixel/CAPI Parity — pixel vs internal CAPI event-count delta
 *   Indexation        — GSC indexed pages, avgCtr, top queries
 *   CWV               — Vercel p75 LCP / INP / CLS + recent deploys
 *   Reservation Expiry — count of reservation_expired events (30 days)
 *
 * When channel_metrics is empty (cron has not run yet), all sections render
 * zero / "No data yet" states gracefully — no crash.
 */

import type { Metadata } from "next";
import {
  Activity,
  BarChart3,
  Globe,
  Package,
  ShoppingCart,
  Zap,
} from "lucide-react";

import { MetricCard } from "@/components/admin/dashboard/metric-card";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { getChannelMetrics, getEventCounts } from "@/db/queries/control-centre";
import { composeDashboard } from "@/lib/control-centre/compose-dashboard";

export const metadata: Metadata = {
  title: "Control Centre",
};

// Revalidate at most once per minute — keeps the page fresh without hammering DB.
export const revalidate = 60;

export default async function ControlCentrePage() {
  // Read real channel_metrics + events from DB
  const [channelData, eventCounts] = await Promise.all([
    getChannelMetrics(),
    getEventCounts(30),
  ]);

  // Compose via the pure function — all displayed numbers are derived here.
  const dashboard = composeDashboard({
    ga4: channelData.ga4,
    searchConsole: channelData.searchConsole,
    vercelInsights: channelData.vercelInsights,
    metaMarketing: channelData.metaMarketing,
    eventCounts,
  });

  const { funnel, feedHealth, parity, indexation, cwv, reservationExpiry } = dashboard;

  // "Live data" when channel_metrics has been populated OR when event-derived
  // funnel numbers show real activity — distinguishes "no cron yet" from "no data".
  const hasChannelData =
    funnel.sessions > 0 ||
    feedHealth.catalogItemCount > 0 ||
    indexation.indexedPageCount > 0 ||
    cwv.lcp > 0 ||
    funnel.ordersCreated > 0 ||
    funnel.paid > 0;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">
            Channels
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">Control Centre</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Operations dashboard — channel health, feed, indexation, and CWV.
          </p>
        </div>
        <div className="rounded-full border border-border/70 bg-card/80 px-4 py-2 text-xs uppercase tracking-[0.25em] text-muted-foreground shadow-sm">
          {hasChannelData ? "Live data" : "Awaiting first cron run"}
        </div>
      </div>

      {/* ── Revenue Funnel ─────────────────────────────────────────────────── */}
      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          Revenue Funnel
        </h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <MetricCard
            label="Sessions (GA4)"
            value={funnel.sessions === 0 ? "—" : funnel.sessions.toLocaleString("en-IN")}
            sublabel="30-day window"
            icon={Activity}
          />
          <MetricCard
            label="Orders Created"
            value={funnel.ordersCreated === 0 ? "—" : funnel.ordersCreated.toLocaleString("en-IN")}
            sublabel="order_created events · 30 days"
            icon={ShoppingCart}
          />
          <MetricCard
            label="Paid"
            value={funnel.paid === 0 ? "—" : funnel.paid.toLocaleString("en-IN")}
            sublabel="payment_completed events · 30 days"
            icon={BarChart3}
          />
        </div>
      </section>

      {/* ── Feed Health + Pixel/CAPI Parity ────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Feed Health */}
        <section>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Feed Health (Meta)
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <MetricCard
              label="Catalog Items"
              value={feedHealth.catalogItemCount === 0 ? "—" : feedHealth.catalogItemCount.toLocaleString("en-IN")}
              sublabel="Meta catalog count"
              icon={Package}
            />
            <MetricCard
              label="Disapprovals"
              value={feedHealth.catalogDisapprovals === 0 ? "—" : feedHealth.catalogDisapprovals.toLocaleString("en-IN")}
              sublabel="Meta catalog disapprovals"
              icon={Package}
            />
          </div>
        </section>

        {/* Pixel/CAPI Parity */}
        <section>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Pixel / CAPI Parity
          </h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <MetricCard
              label="Pixel Events"
              value={parity.pixelEventCount === 0 ? "—" : parity.pixelEventCount.toLocaleString("en-IN")}
              sublabel="Meta Pixel · 30 days"
              icon={Activity}
            />
            <MetricCard
              label="CAPI Events"
              value={parity.capiEventCount === 0 ? "—" : parity.capiEventCount.toLocaleString("en-IN")}
              sublabel="Internal CAPI · 30 days"
              icon={Activity}
            />
            <MetricCard
              label="Parity Delta"
              value={
                parity.pixelEventCount === 0 && parity.capiEventCount === 0
                  ? "—"
                  : parity.parityDelta > 0
                  ? `+${parity.parityDelta}`
                  : String(parity.parityDelta)
              }
              sublabel="pixel − CAPI (0 = perfect)"
              icon={Zap}
            />
          </div>
        </section>
      </div>

      {/* ── Indexation (GSC) ───────────────────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <section>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Indexation (Google Search Console)
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <MetricCard
              label="Indexed Pages"
              value={indexation.indexedPageCount === 0 ? "—" : indexation.indexedPageCount.toLocaleString("en-IN")}
              sublabel="GSC indexed page count"
              icon={Globe}
            />
            <MetricCard
              label="Avg CTR"
              value={indexation.avgCtr === 0 ? "—" : `${(indexation.avgCtr * 100).toFixed(1)}%`}
              sublabel="Average click-through rate"
              icon={BarChart3}
            />
          </div>

          {/* Top Queries */}
          {indexation.topQueries.length > 0 ? (
            <Card className="mt-4 border-border/70 bg-card/85 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Top Queries</CardTitle>
                <CardDescription>Highest-click queries from GSC (30 days).</CardDescription>
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
              <CardContent className="py-6 text-center text-sm text-muted-foreground">
                No query data yet — GSC cron has not run or creds not configured.
              </CardContent>
            </Card>
          )}
        </section>

        {/* ── Right column: CWV + Reservation Expiry ────────────────────────── */}
        <div className="space-y-6">
          {/* CWV */}
          <section>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Core Web Vitals (Vercel p75)
            </h3>
            <Card className="border-border/70 bg-card/85 shadow-sm">
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">LCP</span>
                  <span className="font-medium">
                    {cwv.lcp === 0 ? "—" : `${cwv.lcp.toLocaleString("en-IN")} ms`}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">INP</span>
                  <span className="font-medium">
                    {cwv.inp === 0 ? "—" : `${cwv.inp.toLocaleString("en-IN")} ms`}
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

          {/* Reservation Expiry */}
          <section>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Reservation Expiry
            </h3>
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
                    <span className="text-muted-foreground">Expired (30 days)</span>
                    <span className="font-medium">
                      {reservationExpiry.expiredCount === 0
                        ? "—"
                        : reservationExpiry.expiredCount.toLocaleString("en-IN")}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Created (30 days)</span>
                    <span className="font-medium">
                      {reservationExpiry.reservationsCreated.toLocaleString("en-IN")}
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
