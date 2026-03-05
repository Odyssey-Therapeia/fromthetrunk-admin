"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

  useEffect(() => {
    const load = async () => {
      const [ordersResponse, productsResponse] = await Promise.all([
        fetch("/api/v2/orders"),
        fetch("/api/v2/products?includeDrafts=true&limit=12"),
      ]);

      const [ordersData, productsData] = await Promise.all([
        ordersResponse.json(),
        productsResponse.json(),
      ]);

      setOrders(ordersData as DashboardOrder[]);
      setProducts(productsData as DashboardProduct[]);
    };

    void load();
  }, []);

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
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Dashboard</h2>
        <p className="text-sm text-muted-foreground">Live overview of your storefront health.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Total Orders</CardDescription>
            <CardTitle>{orders.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Published Products</CardDescription>
            <CardTitle>{publishedCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Revenue</CardDescription>
            <CardTitle>{formatINR(revenuePaise)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Products</CardTitle>
          <CardDescription>Latest additions to your catalog.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {products.slice(0, 6).map((product) => (
            <div className="flex items-center justify-between rounded-md border p-3" key={product.id}>
              <div>
                <p className="text-sm font-medium">{product.storyTitle}</p>
                <p className="text-xs text-muted-foreground">{product.status}</p>
              </div>
              <Link className="text-xs text-primary underline-offset-4 hover:underline" href={`/admin/products/${product.id}`}>
                Open
              </Link>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Link className="text-sm font-medium text-primary underline-offset-4 hover:underline" href="/admin/products">
          Manage products
        </Link>
        <Link className="text-sm font-medium text-primary underline-offset-4 hover:underline" href="/admin/orders">
          Review orders
        </Link>
        <Link className="text-sm font-medium text-primary underline-offset-4 hover:underline" href="/admin/media">
          Open media library
        </Link>
      </div>
    </div>
  );
}
