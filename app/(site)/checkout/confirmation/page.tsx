import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "@/lib/formatters";
import { getServerAuthSession } from "@/lib/auth/get-session";
import { getOrder } from "@/db/queries/orders";
import type { Order, OrderItem } from "@/types/domain";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Order Confirmed",
  robots: { index: false, follow: false },
};

type ConfirmationPageProps = {
  searchParams: Promise<{ orderId?: string }> | { orderId?: string };
};

export default async function ConfirmationPage({
  searchParams,
}: ConfirmationPageProps) {
  const resolvedParams = await Promise.resolve(searchParams);
  const orderId = resolvedParams?.orderId;

  // If no order ID, show generic confirmation
  if (!orderId) {
    return <GenericConfirmation />;
  }

  try {
    const session = await getServerAuthSession();
    if (!session?.user?.id) {
      redirect("/account/sign-in");
    }

    const rawOrder = await getOrder(orderId);
    if (!rawOrder) {
      return <GenericConfirmation />;
    }

    const order: Order = rawOrder;

    // Verify the order belongs to the current user
    const orderUserId = order.userId;
    if (orderUserId !== session.user.id) {
      return <GenericConfirmation />;
    }

    return (
      <div className="mx-auto w-full max-w-3xl space-y-8 px-6 py-20">
        <div className="text-center space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <svg
              className="h-8 w-8 text-green-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground">
            Order Confirmed
          </p>
          <h1 className="font-serif text-4xl text-foreground">
            Your treasure is on its way
          </h1>
          <p className="text-sm text-muted-foreground">
            Order #{order.id.slice(0, 8).toUpperCase()} has been placed successfully.
            You will receive a confirmation email shortly.
          </p>
        </div>

        <div className="rounded-2xl border border-border/60 bg-card/70 p-6 shadow-soft">
          <h2 className="font-serif text-xl text-foreground">Order Details</h2>
          <Separator className="my-4" />

          <div className="space-y-3">
            {order.items?.map((item: OrderItem, index: number) => (
              <div key={index} className="flex items-center justify-between text-sm">
                <div>
                  <p className="font-medium text-foreground">{item.name}</p>
                  <p className="text-xs text-muted-foreground">Qty: {item.quantity}</p>
                </div>
                <p className="font-semibold text-foreground">
                  {formatCurrency((item.pricePaise * item.quantity) / 100)}
                </p>
              </div>
            ))}
          </div>

          <Separator className="my-4" />

          <div className="space-y-2 text-sm">
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
            <div className="flex justify-between text-base font-semibold text-foreground">
              <span>Total</span>
              <span>{formatCurrency(order.totalPaise / 100)}</span>
            </div>
          </div>

          {order.shippingLine1 && (
            <>
              <Separator className="my-4" />
              <div className="text-sm text-muted-foreground">
                <p className="font-semibold text-foreground">Shipping to</p>
                <p className="mt-1">{order.shippingName}</p>
                <p>{order.shippingLine1}</p>
                {order.shippingLine2 && <p>{order.shippingLine2}</p>}
                <p>
                  {order.shippingCity}
                  {order.shippingState ? `, ${order.shippingState}` : ""}{" "}
                  {order.shippingPostalCode}
                </p>
                <p>{order.shippingCountry}</p>
              </div>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button asChild className="rounded-full px-8">
            <Link href="/account/orders">View Orders</Link>
          </Button>
          <Button asChild variant="outline" className="rounded-full px-8">
            <Link href="/collection">Continue Shopping</Link>
          </Button>
        </div>
      </div>
    );
  } catch {
    return <GenericConfirmation />;
  }
}

function GenericConfirmation() {
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-3xl flex-col items-center justify-center gap-6 px-6 py-20 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
        <svg
          className="h-8 w-8 text-green-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 13l4 4L19 7"
          />
        </svg>
      </div>
      <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground">
        Order Confirmed
      </p>
      <h1 className="font-serif text-4xl text-foreground">
        Your treasure is reserved
      </h1>
      <p className="text-sm text-muted-foreground">
        A confirmation email with tracking details will follow shortly.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button asChild className="rounded-full px-8">
          <Link href="/account/orders">View Orders</Link>
        </Button>
        <Button asChild variant="outline" className="rounded-full px-8">
          <Link href="/collection">Continue Shopping</Link>
        </Button>
      </div>
    </div>
  );
}
