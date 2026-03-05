"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatINR } from "@/db/money";

type DashboardOrder = {
  id: string;
  totalPaise: number;
};

type DashboardProduct = {
  id: string;
  status: "draft" | "published";
  storyTitle: string;
};

export default function AdminDashboardPage() {
  const [orders, setOrders] = useState<DashboardOrder[]>([]);
  const [products, setProducts] = useState<DashboardProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const [ordersResponse, productsResponse] = await Promise.all([
        fetch("/api/v2/orders"),
        fetch("/api/v2/products?includeDrafts=true&limit=12"),
      ]);

      if (!ordersResponse.ok || !productsResponse.ok) {
        throw new Error("Unable to load dashboard data right now.");
      }

      const [ordersData, productsData] = await Promise.all([
        ordersResponse.json(),
        productsResponse.json(),
      ]);

      setOrders(ordersData as DashboardOrder[]);
      setProducts(productsData as DashboardProduct[]);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to load dashboard data right now.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const revenuePaise = useMemo(
    () => orders.reduce((sum, order) => sum + order.totalPaise, 0),
    [orders]
  );
  const publishedCount = useMemo(
    () => products.filter((product) => product.status === "published").length,
    [products]
  );

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
        <div className="rounded-full border border-border/70 bg-card/80 px-4 py-2 text-xs uppercase tracking-[0.25em] text-muted-foreground shadow-sm">
          {isLoading ? "Refreshing" : "Synced"}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-border/70 bg-card/85 shadow-sm">
          <CardHeader className="space-y-3">
            <CardDescription>Total Orders</CardDescription>
            <CardTitle>{isLoading ? <Skeleton className="h-8 w-14" /> : orders.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-border/70 bg-card/85 shadow-sm">
          <CardHeader className="space-y-3">
            <CardDescription>Published Products</CardDescription>
            <CardTitle>{isLoading ? <Skeleton className="h-8 w-16" /> : publishedCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-border/70 bg-card/85 shadow-sm">
          <CardHeader className="space-y-3">
            <CardDescription>Revenue</CardDescription>
            <CardTitle>{isLoading ? <Skeleton className="h-8 w-24" /> : formatINR(revenuePaise)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card className="border-border/70 bg-card/85 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Recent Products</CardTitle>
          <CardDescription>Latest additions to your catalog.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            Array.from({ length: 4 }, (_, index) => (
              <div
                className="rounded-xl border border-border/60 bg-background/70 p-4"
                key={`dashboard-skeleton-${index}`}
              >
                <Skeleton className="h-4 w-48" />
                <Skeleton className="mt-3 h-3 w-20" />
              </div>
            ))
          ) : loadError ? (
            <div className="rounded-xl border border-dashed border-destructive/40 bg-destructive/5 p-4">
              <p className="text-sm font-medium text-foreground">{loadError}</p>
              <button
                className="mt-3 text-sm font-medium text-primary underline-offset-4 hover:underline"
                onClick={() => void load()}
                type="button"
              >
                Retry dashboard load
              </button>
            </div>
          ) : products.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/70 bg-background/70 p-4 text-sm text-muted-foreground">
              No published or draft products yet. Add your first product to populate the dashboard.
            </div>
          ) : (
            products.slice(0, 6).map((product) => (
              <div
                className="flex items-center justify-between rounded-xl border border-border/60 bg-background/70 p-4"
                key={product.id}
              >
                <div>
                  <p className="text-sm font-medium">{product.storyTitle}</p>
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    {product.status}
                  </p>
                </div>
                <Link
                  className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                  href={`/admin/products/${product.id}`}
                >
                  Open
                </Link>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Link
          className="rounded-full border border-border/70 bg-card/85 px-4 py-2 text-sm font-medium text-foreground shadow-sm transition hover:border-primary/30 hover:text-primary"
          href="/admin/products"
        >
          Manage products
        </Link>
        <Link
          className="rounded-full border border-border/70 bg-card/85 px-4 py-2 text-sm font-medium text-foreground shadow-sm transition hover:border-primary/30 hover:text-primary"
          href="/admin/orders"
        >
          Review orders
        </Link>
        <Link
          className="rounded-full border border-border/70 bg-card/85 px-4 py-2 text-sm font-medium text-foreground shadow-sm transition hover:border-primary/30 hover:text-primary"
          href="/admin/media"
        >
          Open media library
        </Link>
      </div>
    </div>
  );
}
