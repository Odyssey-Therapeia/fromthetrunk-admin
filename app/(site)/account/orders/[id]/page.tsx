"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "@/lib/formatters";
import type { Order, OrderItem } from "@/types/domain";

const fetchOrder = async (id: string): Promise<Order> => {
  const response = await fetch(`/api/v2/orders/${id}`);
  if (!response.ok) throw new Error("Unable to load order.");
  return (await response.json()) as Order;
};

const statusSteps: Array<Order["status"]> = ["pending", "confirmed", "shipped", "delivered"];

const statusLabels: Record<string, string> = {
  pending: "Order Placed",
  confirmed: "Payment Confirmed",
  shipped: "Shipped",
  delivered: "Delivered",
};

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: session, status: authStatus } = useSession();

  const { data: order, isLoading, isError } = useQuery({
    queryKey: ["order", id],
    queryFn: () => fetchOrder(id),
    enabled: Boolean(session?.user?.id && id),
  });

  if (authStatus === "loading" || isLoading) {
    return <p className="text-sm text-muted-foreground">Loading order...</p>;
  }

  if (!session?.user?.id) {
    return (
      <div className="rounded-2xl border border-dashed border-border/70 p-6 text-sm text-muted-foreground">
        Please sign in to view this order.
        <Button asChild variant="link" className="px-0">
          <Link href="/account/sign-in">Sign in</Link>
        </Button>
      </div>
    );
  }

  if (isError || !order) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-destructive">Unable to load this order.</p>
        <Button asChild variant="outline" className="rounded-full">
          <Link href="/account/orders">Back to Orders</Link>
        </Button>
      </div>
    );
  }

  const currentStep = statusSteps.indexOf(order.status ?? "pending");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="font-serif text-2xl text-foreground">
            Order #{order.id.slice(0, 8).toUpperCase()}
          </h2>
          <p className="text-xs text-muted-foreground">
            Placed {order.placedAt ? new Date(order.placedAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : "—"}
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="rounded-full">
          <Link href="/account/orders">Back to Orders</Link>
        </Button>
      </div>

      {/* Order timeline */}
      <div className="rounded-2xl border border-border/60 bg-card/70 p-6 shadow-soft">
        <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground mb-4">
          Order Status
        </p>
        <div className="flex items-center justify-between">
          {statusSteps.map((step, index) => {
            const isActive = index <= currentStep;
            const isCurrent = index === currentStep;
            return (
              <div key={step} className="flex flex-1 items-center">
                <div className="flex flex-col items-center">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    } ${isCurrent ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""}`}
                  >
                    {index + 1}
                  </div>
                  <p
                    className={`mt-2 text-[10px] uppercase tracking-[0.2em] ${
                      isActive ? "text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {statusLabels[step]}
                  </p>
                </div>
                {index < statusSteps.length - 1 && (
                  <div
                    className={`mx-2 h-0.5 flex-1 ${
                      index < currentStep ? "bg-primary" : "bg-muted"
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Order items */}
      <div className="rounded-2xl border border-border/60 bg-card/70 p-6 shadow-soft">
        <h3 className="font-serif text-lg text-foreground">Items</h3>
        <Separator className="my-3" />
        <div className="space-y-3">
          {order.items?.map((item: OrderItem, index: number) => (
            <div key={index} className="flex items-center justify-between text-sm">
              <div>
                <p className="font-medium text-foreground">{item.name}</p>
                <p className="text-xs text-muted-foreground">Qty: {item.quantity} · One of a kind</p>
              </div>
              <p className="font-semibold text-foreground">
                {formatCurrency((item.pricePaise * item.quantity) / 100)}
              </p>
            </div>
          ))}
        </div>

        <Separator className="my-3" />

        <div className="space-y-1 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Subtotal</span>
            <span>{formatCurrency(order.subtotalPaise / 100)}</span>
          </div>
          {order.shippingCostPaise > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>Shipping</span>
              <span>{formatCurrency(order.shippingCostPaise / 100)}</span>
            </div>
          )}
          {order.taxAmountPaise > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>GST</span>
              <span>{formatCurrency(order.taxAmountPaise / 100)}</span>
            </div>
          )}
          <Separator className="my-2" />
          <div className="flex justify-between font-semibold text-foreground">
            <span>Total</span>
            <span>{formatCurrency(order.totalPaise / 100)}</span>
          </div>
        </div>
      </div>

      {/* Shipping address */}
      {order.shippingLine1 && (
        <div className="rounded-2xl border border-border/60 bg-card/70 p-6 shadow-soft">
          <h3 className="font-serif text-lg text-foreground">Shipping Address</h3>
          <Separator className="my-3" />
          <div className="text-sm text-muted-foreground space-y-0.5">
            <p className="font-medium text-foreground">{order.shippingName}</p>
            <p>{order.shippingLine1}</p>
            {order.shippingLine2 && <p>{order.shippingLine2}</p>}
            <p>
              {order.shippingCity}
              {order.shippingState ? `, ${order.shippingState}` : ""}{" "}
              {order.shippingPostalCode}
            </p>
            <p>{order.shippingCountry}</p>
            {order.shippingPhone && <p>Phone: {order.shippingPhone}</p>}
          </div>
        </div>
      )}

      {/* Payment info */}
      <div className="rounded-2xl border border-border/60 bg-card/70 p-6 shadow-soft">
        <h3 className="font-serif text-lg text-foreground">Payment</h3>
        <Separator className="my-3" />
        <div className="text-sm text-muted-foreground space-y-1">
          <div className="flex justify-between">
            <span>Status</span>
            <span className="capitalize font-medium text-foreground">{order.paymentStatus ?? "—"}</span>
          </div>
          <div className="flex justify-between">
            <span>Gateway</span>
            <span className="capitalize">{order.paymentGateway ?? "—"}</span>
          </div>
          {order.paymentId && (
            <div className="flex justify-between">
              <span>Payment ID</span>
              <span className="font-mono text-xs">{order.paymentId}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
