"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "@/lib/formatters";
import { resolveMediaURL } from "@/lib/media/resolve-media-url";
import { getCartTotals, useCartStore } from "@/lib/store/cart-store";
import type { Address, Product } from "@/types/domain";

const fetchAddresses = async (): Promise<Address[]> => {
  const response = await fetch("/api/v2/addresses");
  if (!response.ok) return [];
  return (await response.json()) as Address[];
};

interface CheckoutPageClientProps {
  featuredPicks: Product[];
}

interface FormErrors {
  [key: string]: string | undefined;
}

const GST_RATE = 0.12;

const SHIPPING_TIERS = {
  freeThreshold: 25000,
  standard: 500,
  express: 1200,
};

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => {
      open: () => void;
      on: (event: string, handler: (response: Record<string, unknown>) => void) => void;
    };
  }
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
  const [errors, setErrors] = useState<FormErrors>({});
  const [shippingMethod, setShippingMethod] = useState<"standard" | "express">("standard");

  // Fetch saved addresses for pre-fill
  const { data: savedAddresses } = useQuery({
    queryKey: ["checkout-addresses"],
    queryFn: fetchAddresses,
    enabled: Boolean(session?.user?.id),
  });

  const handleAddressSelect = (addressId: string) => {
    const address = savedAddresses?.find((a) => a.id === addressId);
    if (!address) return;
    setForm((prev) => ({
      ...prev,
      firstName: (address.name ?? "").split(" ")[0] ?? "",
      lastName: (address.name ?? "").split(" ").slice(1).join(" ") ?? "",
      phone: address.phone ?? "",
      address: address.line1 ?? "",
      city: address.city ?? "",
      state: address.state ?? "",
      postal: address.postalCode ?? "",
      country: address.country ?? "",
    }));
    toast("Address pre-filled from your saved addresses.");
  };

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: session?.user?.email ?? "",
    phone: "",
    address: "",
    city: "",
    state: "",
    postal: "",
    country: "India",
  });

  useEffect(() => {
    if (session?.user?.email) {
      setForm((prev) => ({ ...prev, email: session.user.email ?? "" }));
    }
  }, [session?.user?.email]);

  // Load Razorpay script
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    document.body.appendChild(script);
    return () => {
      document.body.removeChild(script);
    };
  }, []);

  const canCheckout = Boolean(session?.user?.id);

  // Client-side totals for display (server will re-calculate)
  const shippingCost =
    subtotal >= SHIPPING_TIERS.freeThreshold ? 0 : SHIPPING_TIERS[shippingMethod];
  const taxAmount = Math.round(subtotal * GST_RATE);
  const total = subtotal + shippingCost + taxAmount;

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!form.firstName.trim()) newErrors.firstName = "First name is required";
    if (!form.lastName.trim()) newErrors.lastName = "Last name is required";
    if (!form.email.trim()) newErrors.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      newErrors.email = "Invalid email address";
    if (!form.address.trim()) newErrors.address = "Street address is required";
    if (!form.city.trim()) newErrors.city = "City is required";
    if (!form.postal.trim()) newErrors.postal = "Postal code is required";
    if (!form.country.trim()) newErrors.country = "Country is required";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!canCheckout || !hasItems) return;
    if (!validateForm()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      // Step 1: Create payment order on server
      const orderPayload = {
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
        shippingMethod,
      };

      const createResponse = await fetch("/api/v2/payments/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderPayload),
      });

      if (!createResponse.ok) {
        const errorData = await createResponse.json().catch(() => null);
        throw new Error(errorData?.message || "Unable to create order.");
      }

      const orderData = await createResponse.json();

      // Step 2: Open Razorpay checkout modal
      if (!window.Razorpay) {
        throw new Error("Payment system is loading. Please try again.");
      }

      const options: Record<string, unknown> = {
        key: orderData.razorpayKeyId,
        amount: orderData.amountPaise,
        currency: orderData.currency,
        name: "From the Trunk",
        description: `Order for ${items.length} piece${items.length > 1 ? "s" : ""}`,
        order_id: orderData.razorpayOrderId,
        prefill: {
          name: `${form.firstName} ${form.lastName}`.trim(),
          email: form.email,
          contact: form.phone,
        },
        theme: {
          color: "#6B1D1D",
        },
        handler: async (response: Record<string, unknown>) => {
          // Step 3: Verify payment on server
          try {
            const verifyResponse = await fetch("/api/v2/payments/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                orderId: orderData.orderId,
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
              }),
            });

            if (!verifyResponse.ok) {
              throw new Error("Payment verification failed.");
            }

            clearCart();
            toast.success("Order placed successfully!");
            router.push(`/checkout/confirmation?orderId=${orderData.orderId}`);
          } catch {
            setError("Payment was received but verification failed. Please contact support.");
            setIsSubmitting(false);
          }
        },
        modal: {
          ondismiss: () => {
            setIsSubmitting(false);
            toast("Payment was cancelled.");
          },
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.on("payment.failed", () => {
        setError("Payment failed. Please try again.");
        setIsSubmitting(false);
      });
      rzp.open();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to process payment.");
      setIsSubmitting(false);
    }
  };

  const renderField = (
    id: string,
    label: string,
    value: string,
    type = "text",
    placeholder = ""
  ) => (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        placeholder={placeholder || label}
        value={value}
        onChange={(event) =>
          setForm((prev) => ({ ...prev, [id]: event.target.value }))
        }
        disabled={!canCheckout || isSubmitting}
        className={errors[id] ? "border-destructive" : ""}
      />
      {errors[id] && (
        <p className="text-xs text-destructive">{errors[id]}</p>
      )}
    </div>
  );

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
          Secure payment powered by Razorpay. Your details are encrypted and safe.
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
                Please sign in to place an order.{" "}
                <Button asChild variant="link" className="px-0">
                  <Link href="/account/sign-in">Sign in</Link>
                </Button>
              </div>
            )}

            {/* Saved address selector */}
            {savedAddresses && savedAddresses.length > 0 && (
              <div className="rounded-xl border border-trunk-gold/30 bg-trunk-gold/5 p-4">
                <Label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  Pre-fill from saved address
                </Label>
                <Select onValueChange={handleAddressSelect}>
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Choose a saved address..." />
                  </SelectTrigger>
                  <SelectContent>
                    {savedAddresses.map((addr) => (
                      <SelectItem key={addr.id} value={addr.id}>
                        {addr.label || addr.name || addr.line1} — {addr.city}
                        {addr.isDefault ? " (Default)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1">
              <h2 className="font-serif text-xl text-foreground">Contact Information</h2>
              <p className="text-xs text-muted-foreground">We&apos;ll send your order confirmation here.</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {renderField("firstName", "First name", form.firstName)}
              {renderField("lastName", "Last name", form.lastName)}
            </div>
            {renderField("email", "Email address", form.email, "email")}
            {renderField("phone", "Phone number", form.phone, "tel")}

            <Separator />

            <div className="space-y-1">
              <h2 className="font-serif text-xl text-foreground">Shipping Address</h2>
            </div>

            {renderField("address", "Street address", form.address)}
            <div className="grid gap-4 md:grid-cols-3">
              {renderField("city", "City", form.city)}
              {renderField("state", "State", form.state)}
              {renderField("postal", "Postal code", form.postal)}
            </div>
            {renderField("country", "Country", form.country)}

            <Separator />

            {/* Shipping method selection */}
            <div className="space-y-3">
              <h2 className="font-serif text-xl text-foreground">Shipping Method</h2>
              <div className="space-y-2">
                <label className={`flex cursor-pointer items-center justify-between rounded-xl border p-4 transition ${shippingMethod === "standard" ? "border-trunk-gold/60 bg-trunk-gold/5" : "border-border/60"}`}>
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="shipping"
                      value="standard"
                      checked={shippingMethod === "standard"}
                      onChange={() => setShippingMethod("standard")}
                      className="accent-primary"
                    />
                    <div>
                      <p className="text-sm font-medium text-foreground">Standard Delivery</p>
                      <p className="text-xs text-muted-foreground">5–7 business days</p>
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-foreground">
                    {subtotal >= SHIPPING_TIERS.freeThreshold ? "Free" : formatCurrency(SHIPPING_TIERS.standard)}
                  </span>
                </label>
                <label className={`flex cursor-pointer items-center justify-between rounded-xl border p-4 transition ${shippingMethod === "express" ? "border-trunk-gold/60 bg-trunk-gold/5" : "border-border/60"}`}>
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="shipping"
                      value="express"
                      checked={shippingMethod === "express"}
                      onChange={() => setShippingMethod("express")}
                      className="accent-primary"
                    />
                    <div>
                      <p className="text-sm font-medium text-foreground">Express Delivery</p>
                      <p className="text-xs text-muted-foreground">2–3 business days</p>
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-foreground">
                    {subtotal >= SHIPPING_TIERS.freeThreshold ? "Free" : formatCurrency(SHIPPING_TIERS.express)}
                  </span>
                </label>
              </div>
              {subtotal >= SHIPPING_TIERS.freeThreshold && (
                <p className="text-xs text-trunk-gold">
                  Free shipping on orders above {formatCurrency(SHIPPING_TIERS.freeThreshold)}
                </p>
              )}
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button
              type="submit"
              className="w-full rounded-full py-6"
              disabled={!canCheckout || isSubmitting}
            >
              {isSubmitting ? "Processing payment..." : `Pay ${formatCurrency(total)}`}
            </Button>
          </form>

          {/* Order summary sidebar */}
          <div className="space-y-6">
            <div className="rounded-3xl border border-border/60 bg-card/70 p-6 shadow-soft">
              <h2 className="font-serif text-2xl text-foreground">Order Summary</h2>
              <Separator className="my-4" />

              {/* Item list */}
              <div className="space-y-3">
                {items.map((item) => (
                  <div key={item.id} className="flex items-center gap-3">
                    <div className="relative h-14 w-12 overflow-hidden rounded-lg bg-muted">
                      {item.image ? (
                        <Image
                          src={item.image}
                          alt={item.name}
                          fill
                          className="object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[8px] text-muted-foreground">
                          —
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">{item.name}</p>
                      <p className="text-xs text-muted-foreground">One of a kind</p>
                    </div>
                    <p className="text-sm font-semibold text-foreground">
                      {formatCurrency(item.price)}
                    </p>
                  </div>
                ))}
              </div>

              <Separator className="my-4" />

              <div className="space-y-2 text-sm text-muted-foreground">
                <div className="flex items-center justify-between">
                  <span>Subtotal</span>
                  <span className="font-semibold text-foreground">
                    {formatCurrency(subtotal)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Shipping ({shippingMethod})</span>
                  <span className="text-foreground">
                    {shippingCost === 0 ? "Free" : formatCurrency(shippingCost)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>GST (12%)</span>
                  <span className="text-foreground">{formatCurrency(taxAmount)}</span>
                </div>
              </div>

              <Separator className="my-4" />

              <div className="flex items-center justify-between text-lg font-semibold text-foreground">
                <span>Total</span>
                <span>{formatCurrency(total)}</span>
              </div>
            </div>

            <div className="rounded-2xl border border-border/60 bg-card/70 p-4 text-xs text-muted-foreground">
              <p className="font-semibold text-foreground">Secure payment</p>
              <p className="mt-1">
                All transactions are encrypted and processed securely through Razorpay.
                We never store your card details.
              </p>
            </div>
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
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {featuredPicks.map((product) => {
                const image = resolveMediaURL(product.images?.[0]);
                return (
                  <Link
                    key={product.id}
                    href={`/collection/${product.slug}`}
                    className="group flex items-center gap-4 rounded-2xl border border-border/60 bg-card/70 p-4 shadow-soft transition hover:-translate-y-0.5 hover:shadow-lift"
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
                      <p className="text-sm font-semibold text-foreground">
                        {formatCurrency(product.pricePaise / 100)}
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
