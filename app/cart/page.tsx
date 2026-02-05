"use client";

import Link from "next/link";

import { CartItem } from "@/components/cart/cart-item";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "@/lib/formatters";
import { getCartTotals, useCartStore } from "@/lib/store/cart-store";

export default function CartPage() {
  const items = useCartStore((state) => state.items);
  const { subtotal, totalItems } = getCartTotals(items);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-10 px-6 py-16">
      <div className="space-y-3">
        <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground">
          Shopping Bag
        </p>
        <h1 className="font-serif text-4xl text-foreground">Your selection</h1>
        <p className="text-sm text-muted-foreground">
          {totalItems === 0
            ? "Your bag is currently empty."
            : `${totalItems} piece${totalItems === 1 ? "" : "s"} in your bag.`}
        </p>
      </div>

      <div className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          {items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground">
              Explore the collection to add a treasure.
            </div>
          ) : (
            items.map((item) => <CartItem key={item.id} item={item} />)
          )}
        </div>

        <div className="rounded-3xl border border-border/60 bg-card/70 p-6 shadow-soft">
          <h2 className="font-serif text-2xl text-foreground">Order summary</h2>
          <Separator className="my-4" />
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="font-semibold text-foreground">
              {formatCurrency(subtotal)}
            </span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Shipping and taxes are calculated at checkout.
          </p>
          <Button
            asChild
            className="mt-6 w-full rounded-full py-6"
            disabled={items.length === 0}
          >
            <Link href="/checkout">Proceed to Checkout</Link>
          </Button>
          <Button
            asChild
            variant="outline"
            className="mt-3 w-full rounded-full"
          >
            <Link href="/collection">Continue Shopping</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
