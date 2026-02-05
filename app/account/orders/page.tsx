"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/formatters";

const fetchOrders = async () => {
  const response = await fetch("/api/account/orders");
  if (!response.ok) {
    throw new Error("Unable to load orders.");
  }
  return response.json();
};

export default function OrdersPage() {
  const { data: session, status } = useSession();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["orders"],
    queryFn: fetchOrders,
    enabled: Boolean(session?.user?.id),
  });

  if (status === "loading") {
    return <p className="text-sm text-muted-foreground">Loading session...</p>;
  }

  if (!session?.user?.id) {
    return (
      <div className="rounded-2xl border border-dashed border-border/70 p-6 text-sm text-muted-foreground">
        Please sign in to view your orders.
        <Button asChild variant="link" className="px-0">
          <Link href="/account/sign-in">Sign in</Link>
        </Button>
      </div>
    );
  }

  const orders = data?.orders ?? [];

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="font-serif text-2xl text-foreground">Orders</h2>
        <p className="text-sm text-muted-foreground">
          Track past purchases and order status.
        </p>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading orders...</p>
      ) : isError ? (
        <p className="text-sm text-destructive">Unable to load orders.</p>
      ) : orders.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/70 p-6 text-sm text-muted-foreground">
          No orders yet. Your next treasure is waiting in the collection.
          <Button asChild variant="link" className="px-0">
            <Link href="/collection">Browse collection</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order: any) => (
            <div
              key={order.id}
              className="rounded-2xl border border-border/60 bg-card/70 p-6 shadow-soft"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm uppercase tracking-[0.3em] text-muted-foreground">
                  Order {order.id}
                </p>
                <span className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                  {order.status}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {order.items?.length ?? 0} items
                </p>
                <p className="text-sm font-semibold text-foreground">
                  {formatCurrency(order.subtotal ?? 0)}
                </p>
              </div>
              <div className="mt-4 space-y-2 text-sm text-muted-foreground">
                {order.items?.map((item: any, index: number) => (
                  <div key={`${order.id}-${index}`} className="flex justify-between">
                    <span>{item.name}</span>
                    <span>
                      {item.quantity} × {formatCurrency(item.price ?? 0)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
