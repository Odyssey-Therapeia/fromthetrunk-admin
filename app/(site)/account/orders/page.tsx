"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/formatters";
import type { Order, OrderItem } from "@/types/domain";

const fetchOrders = async () => {
  const response = await fetch("/api/v2/orders");
  if (!response.ok) {
    throw new Error("Unable to load orders.");
  }
  return (await response.json()) as Order[];
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

  const orders = data ?? [];

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
          {orders.map((order) => (
            <Link
              key={order.id}
              href={`/account/orders/${order.id}`}
              className="block rounded-2xl border border-border/60 bg-card/70 p-6 shadow-soft transition hover:-translate-y-0.5 hover:shadow-lift"
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
                  {formatCurrency(order.subtotalPaise / 100)}
                </p>
              </div>
              <div className="mt-4 space-y-2 text-sm text-muted-foreground">
                {order.items?.map((item: OrderItem, index: number) => (
                  <div key={`${order.id}-${index}`} className="flex justify-between">
                    <span>{item.name}</span>
                    <span>
                      {item.quantity} × {formatCurrency(item.pricePaise / 100)}
                    </span>
                  </div>
                ))}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
