"use client";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "@/lib/formatters";
import { getCartTotals, useCartStore } from "@/lib/store/cart-store";

export default function CheckoutPage() {
  const router = useRouter();
  const items = useCartStore((state) => state.items);
  const clearCart = useCartStore((state) => state.clearCart);
  const { subtotal } = getCartTotals(items);

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

      <div className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr]">
        <form className="space-y-6 rounded-3xl border border-border/60 bg-card/70 p-6 shadow-soft">
          <div className="grid gap-4 md:grid-cols-2">
            <Input placeholder="First name" />
            <Input placeholder="Last name" />
          </div>
          <Input placeholder="Email address" type="email" />
          <Input placeholder="Phone number" />
          <Input placeholder="Street address" />
          <div className="grid gap-4 md:grid-cols-3">
            <Input placeholder="City" />
            <Input placeholder="State" />
            <Input placeholder="Postal code" />
          </div>
          <Input placeholder="Country" />
          <Button
            type="button"
            className="w-full rounded-full py-6"
            onClick={() => {
              clearCart();
              router.push("/checkout/confirmation");
            }}
          >
            Place order (simulated)
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
    </div>
  );
}
