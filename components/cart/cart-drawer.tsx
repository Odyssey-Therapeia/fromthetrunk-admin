"use client";

import Link from "next/link";
import { ShoppingBag } from "lucide-react";

import { CartItem } from "@/components/cart/cart-item";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { formatCurrency } from "@/lib/formatters";
import { getCartTotals, useCartStore } from "@/lib/store/cart-store";

export function CartDrawer() {
  const items = useCartStore((state) => state.items);
  const hasHydrated = useCartStore((state) => state.hasHydrated);
  const { subtotal, totalItems } = getCartTotals(items);
  const canCheckout = hasHydrated && items.length > 0;

  return (
    <Sheet>
      {/* Live region for screen readers */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {hasHydrated && totalItems > 0
          ? `${totalItems} item${totalItems !== 1 ? "s" : ""} in your bag, subtotal ${formatCurrency(subtotal)}`
          : "Your bag is empty"}
      </div>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative rounded-full"
          aria-label={`View cart${hasHydrated && totalItems > 0 ? `, ${totalItems} items` : ""}`}
        >
          <ShoppingBag className="h-5 w-5" />
          {hasHydrated && totalItems > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground" aria-hidden="true">
              {totalItems}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="flex flex-col gap-6 bg-background sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Shopping Bag</SheetTitle>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-auto pr-2">
          {!hasHydrated ? (
            <div className="rounded-2xl border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground">
              Loading your bag...
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground">
              Your bag is empty. Explore the collection to add a treasure.
            </div>
          ) : (
            items.map((item) => <CartItem key={item.id} item={item} />)
          )}
        </div>

        <div className="space-y-3 border-t border-border/60 pt-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="font-semibold text-foreground">
              {hasHydrated ? formatCurrency(subtotal) : "—"}
            </span>
          </div>
          {canCheckout ? (
            <Button asChild className="w-full rounded-full py-6">
              <Link href="/checkout">Proceed to Checkout</Link>
            </Button>
          ) : (
            <Button className="w-full rounded-full py-6" disabled>
              Proceed to Checkout
            </Button>
          )}
          <Button asChild variant="outline" className="w-full rounded-full">
            <Link href="/collection">Continue Shopping</Link>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
