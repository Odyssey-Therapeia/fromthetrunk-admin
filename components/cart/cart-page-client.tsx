"use client";

import Link from "next/link";
import Image from "next/image";

import { CartItem } from "@/components/cart/cart-item";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "@/lib/formatters";
import { resolveMediaURL } from "@/lib/media/resolve-media-url";
import { getCartTotals, useCartStore } from "@/lib/store/cart-store";
import type { Product } from "@/types/payload-types";

interface CartPageClientProps {
  featuredPicks: Product[];
}

export function CartPageClient({ featuredPicks }: CartPageClientProps) {
  const items = useCartStore((state) => state.items);
  const hasHydrated = useCartStore((state) => state.hasHydrated);
  const { subtotal, totalItems } = getCartTotals(items);
  const canCheckout = hasHydrated && items.length > 0;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-10 px-6 py-16">
      <div className="space-y-3">
        <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground">
          Shopping Bag
        </p>
        <h1 className="font-serif text-4xl text-foreground">Your selection</h1>
        <p className="text-sm text-muted-foreground">
          {!hasHydrated
            ? "Loading your bag..."
            : totalItems === 0
            ? "Your bag is currently empty."
            : `${totalItems} piece${totalItems === 1 ? "" : "s"} in your bag.`}
        </p>
      </div>

      <div className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          {!hasHydrated ? (
            <div className="rounded-2xl border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground">
              Loading your bag...
            </div>
          ) : items.length === 0 ? (
            <>
              <div className="rounded-2xl border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground">
                Explore the collection to add a treasure.
              </div>
              <section className="space-y-4">
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground">
                    Featured Picks
                  </p>
                  <h2 className="font-serif text-2xl text-foreground">
                    Begin with something rare
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Handpicked pieces to start your collection.
                  </p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  {featuredPicks.map((product) => {
                    const image = resolveMediaURL(product.images?.[0]);
                    return (
                      <Link
                        key={product.id}
                        href={`/collection/${product.slug}`}
                        className="group flex items-center gap-4 rounded-2xl border border-border/60 bg-card/70 p-4 shadow-soft transition hover:-translate-y-0.5 hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-trunk-gold/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                      >
                        <div className="relative h-20 w-16 overflow-hidden rounded-xl bg-muted">
                          {image ? (
                            <Image
                              src={image}
                              alt={product.name}
                              fill
                              className="object-cover transition duration-500 group-hover:scale-105"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                              No image
                            </div>
                          )}
                        </div>
                        <div className="space-y-1">
                          <p className="font-serif text-base text-foreground">
                            {product.name}
                          </p>
                          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                            {product.details?.fabric ?? "Heirloom"}
                          </p>
                          <p className="text-sm font-semibold text-foreground">
                            {formatCurrency(product.price ?? 0)}
                          </p>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>
            </>
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
              {hasHydrated ? formatCurrency(subtotal) : "—"}
            </span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Shipping and taxes are calculated at checkout.
          </p>
          {canCheckout ? (
            <Button asChild className="mt-6 w-full rounded-full py-6">
              <Link href="/checkout">Proceed to Checkout</Link>
            </Button>
          ) : (
            <Button className="mt-6 w-full rounded-full py-6" disabled>
              Proceed to Checkout
            </Button>
          )}
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
