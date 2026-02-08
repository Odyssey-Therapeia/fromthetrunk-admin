"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useSession } from "next-auth/react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "@/lib/formatters";
import { resolveMediaURL } from "@/lib/media/resolve-media-url";
import { getCartTotals, useCartStore } from "@/lib/store/cart-store";

interface CheckoutPageClientProps {
  featuredPicks: any[];
}

export function CheckoutPageClient({ featuredPicks }: CheckoutPageClientProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const items = useCartStore((state) => state.items);
  const hasHydrated = useCartStore((state) => state.hasHydrated);
  const clearCart = useCartStore((state) => state.clearCart);
  const { subtotal } = getCartTotals(items);
  const hasItems = hasHydrated && items.length > 0;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: session?.user?.email ?? "",
    phone: "",
    address: "",
    city: "",
    state: "",
    postal: "",
    country: "",
  });

  useEffect(() => {
    if (session?.user?.email) {
      setForm((prev) => ({ ...prev, email: session.user.email ?? "" }));
    }
  }, [session?.user?.email]);

  const canCheckout = Boolean(session?.user?.id);

  const orderPayload = useMemo(() => {
    return {
      items: items.map((item) => ({
        productId: item.id,
        quantity: item.quantity,
      })),
      shippingAddress: {
        name: `${form.firstName} ${form.lastName}`.trim(),
        line1: form.address,
        city: form.city,
        state: form.state,
        postalCode: form.postal,
        country: form.country,
        phone: form.phone,
        email: form.email,
      },
    };
  }, [form, items]);

  const handleSubmit = async () => {
    if (!canCheckout || !hasItems) return;
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderPayload),
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Unable to place order.");
      }

      clearCart();
      router.push("/checkout/confirmation");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to place order.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-10 px-6 py-16">
      <div className="space-y-3">
        <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground">
          Checkout
        </p>
        <h1 className="font-serif text-4xl text-foreground">
          Complete your order
        </h1>
        <p className="text-sm text-muted-foreground">
          This is a simulated checkout for presentation purposes.
        </p>
      </div>

      {!hasHydrated ? (
        <div className="rounded-3xl border border-border/60 bg-card/70 p-8 text-center text-sm text-muted-foreground shadow-soft">
          Loading your bag...
        </div>
      ) : hasItems ? (
        <div className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr]">
          <form
            className="space-y-6 rounded-3xl border border-border/60 bg-card/70 p-6 shadow-soft"
            onSubmit={(event) => {
              event.preventDefault();
              handleSubmit();
            }}
          >
            {!canCheckout && (
              <div className="rounded-2xl border border-dashed border-border/70 p-4 text-sm text-muted-foreground">
                Please sign in to place an order.
                <Button asChild variant="link" className="px-0">
                  <Link href="/account/sign-in">Sign in</Link>
                </Button>
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="firstName">First name</Label>
                <Input
                  id="firstName"
                  placeholder="First name"
                  value={form.firstName}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, firstName: event.target.value }))
                  }
                  disabled={!canCheckout || isSubmitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last name</Label>
                <Input
                  id="lastName"
                  placeholder="Last name"
                  value={form.lastName}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, lastName: event.target.value }))
                  }
                  disabled={!canCheckout || isSubmitting}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                placeholder="Email address"
                type="email"
                value={form.email}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, email: event.target.value }))
                }
                disabled={!canCheckout || isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone number</Label>
              <Input
                id="phone"
                placeholder="Phone number"
                value={form.phone}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, phone: event.target.value }))
                }
                disabled={!canCheckout || isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Street address</Label>
              <Input
                id="address"
                placeholder="Street address"
                value={form.address}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, address: event.target.value }))
                }
                disabled={!canCheckout || isSubmitting}
              />
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  placeholder="City"
                  value={form.city}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, city: event.target.value }))
                  }
                  disabled={!canCheckout || isSubmitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="state">State</Label>
                <Input
                  id="state"
                  placeholder="State"
                  value={form.state}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, state: event.target.value }))
                  }
                  disabled={!canCheckout || isSubmitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="postal">Postal code</Label>
                <Input
                  id="postal"
                  placeholder="Postal code"
                  value={form.postal}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, postal: event.target.value }))
                  }
                  disabled={!canCheckout || isSubmitting}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="country">Country</Label>
              <Input
                id="country"
                placeholder="Country"
                value={form.country}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, country: event.target.value }))
                }
                disabled={!canCheckout || isSubmitting}
              />
            </div>
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            <Button
              type="submit"
              className="w-full rounded-full py-6"
              disabled={!canCheckout || isSubmitting}
            >
              {isSubmitting ? "Placing order..." : "Place order (simulated)"}
            </Button>
          </form>

          <div className="rounded-3xl border border-border/60 bg-card/70 p-6 shadow-soft">
            <h2 className="font-serif text-2xl text-foreground">Order summary</h2>
            <Separator className="my-4" />
            <div className="space-y-3 text-sm text-muted-foreground">
              <div className="flex items-center justify-between">
                <span>Subtotal</span>
                <span className="font-semibold text-foreground">
                  {formatCurrency(subtotal)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Shipping</span>
                <span className="text-foreground">Calculated at delivery</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Taxes</span>
                <span className="text-foreground">Included</span>
              </div>
            </div>
            <Separator className="my-4" />
            <div className="flex items-center justify-between text-lg font-semibold text-foreground">
              <span>Total</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Payment is simulated for demo purposes only.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-10">
          <div className="rounded-3xl border border-dashed border-border/70 bg-card/60 p-8 text-center shadow-soft">
            <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground">
              Your bag is empty
            </p>
            <h2 className="mt-3 font-serif text-2xl text-foreground">
              Add a treasure to continue
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Browse the collection and return here to complete your order.
            </p>
            <Button asChild className="mt-6 rounded-full px-8">
              <Link href="/collection">Explore the Collection</Link>
            </Button>
          </div>

          <section className="space-y-4">
            <div className="space-y-2 text-center">
              <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground">
                Featured Picks
              </p>
              <h2 className="font-serif text-2xl text-foreground">
                Treasures to begin with
              </h2>
              <p className="text-sm text-muted-foreground">
                A small selection chosen for their rarity and timeless appeal.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
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
        </div>
      )}
    </div>
  );
}
