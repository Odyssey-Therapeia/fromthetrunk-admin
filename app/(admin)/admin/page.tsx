"use client";

import Link from "next/link";
import {
  DollarSign,
  Package,
  ShoppingCart,
  Users,
} from "lucide-react";

import { ActivityFeed } from "@/components/admin/dashboard/activity-feed";
import { AppVersionBadge } from "@/components/admin/app-version-badge";
import { MetricCard } from "@/components/admin/dashboard/metric-card";
import { QuickActions } from "@/components/admin/dashboard/quick-actions";
import { StockAlerts } from "@/components/admin/dashboard/stock-alerts";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatINR } from "@/db/money";
import { currentAdminRelease } from "@/lib/admin/releases";
import { useDashboard } from "@/lib/hooks/use-dashboard";

export default function AdminDashboardPage() {
  const { metrics, activity, isLoading } = useDashboard();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">
            Live ops
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">Dashboard</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Live overview of your storefront health.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-full border border-border/70 bg-card/80 px-4 py-2 text-xs uppercase tracking-[0.25em] text-muted-foreground shadow-sm">
            {isLoading ? "Refreshing" : "Synced"}
          </div>
          <AppVersionBadge showLabel tone="outline" />
        </div>
      </div>

      <section className="overflow-hidden rounded-xl border border-border/80 bg-card/85 p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">
              Latest update
            </p>
            <h3 className="mt-2 text-xl font-semibold text-foreground">
              {currentAdminRelease.name}
            </h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {currentAdminRelease.summary}
            </p>
          </div>
          <AppVersionBadge release={currentAdminRelease} showLabel tone="dark" />
        </div>
        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          {currentAdminRelease.changes.map((group) => (
            <div
              key={group.title}
              className="rounded-xl border border-border/70 bg-background/65 p-4"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                {group.title}
              </p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {group.items[0]}
              </p>
            </div>
          ))}
        </div>
        <Button asChild variant="outline" size="sm" className="mt-4 rounded-full">
          <Link href="/admin/changelog">View full changelog</Link>
        </Button>
      </section>

      {/* Quick actions near the top for easy access */}
      <QuickActions />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {isLoading || !metrics ? (
          Array.from({ length: 4 }, (_, i) => (
            <div key={`metric-skeleton-${i}`} className="rounded-xl border border-border/70 bg-card/85 p-6">
              <Skeleton className="mb-3 h-3 w-20" />
              <Skeleton className="h-7 w-16" />
            </div>
          ))
        ) : (
          <>
            <MetricCard
              label="Revenue"
              value={formatINR(metrics.revenue.totalPaise)}
              sublabel={metrics.revenue.periodLabel}
              icon={DollarSign}
            />
            <MetricCard
              label="Orders"
              value={metrics.orders.total}
              sublabel={`${metrics.orders.pending} pending`}
              icon={ShoppingCart}
            />
            <MetricCard
              label="Products"
              value={metrics.products.total}
              sublabel={`${metrics.products.published} published`}
              icon={Package}
            />
            <MetricCard
              label="Customers"
              value={metrics.customers.total}
              sublabel={`${metrics.customers.newThisWeek} new this week`}
              icon={Users}
            />
          </>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <ActivityFeed items={activity} />
        {metrics && (
          <StockAlerts
            reservedCount={metrics.products.reserved}
            draftCount={metrics.products.drafts}
          />
        )}
      </div>
    </div>
  );
}
