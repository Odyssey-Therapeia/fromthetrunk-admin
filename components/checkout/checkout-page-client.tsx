"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle, Circle, Truck, CreditCard, ShieldCheck, Lock, ShoppingCart, CheckCircle2 } from "lucide-react";

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
import { GST_RATE, SHIPPING_TIERS, type ShippingMethod } from "@/lib/config/order-pricing";
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
  const [shippingMethod, setShippingMethod] = useState<ShippingMethod>("standard");

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

  const shippingCost =
    subtotal >= SHIPPING_TIERS.freeThreshold ? 0 : SHIPPING_TIERS[shippingMethod];
  const taxAmount = Math.round(subtotal * GST_RATE);
  const total = subtotal + shippingCost + taxAmount;
  const taxRateLabel = new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 2,
    style: "percent",
  }).format(GST_RATE);

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
    if (!form.phone.trim()) newErrors.phone = "Phone number is required";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!canCheckout || !hasItems) return;
    if (!validateForm()) return;

    setIsSubmitting(true);
    setError(null);

    try {
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

      if (!window.Razorpay) {
        throw new Error("Payment system is loading. Please try again.");
      }

      const options: Record<string, unknown> = {
        key: orderData.razorpayKeyId,
        amount: orderData.amountPaise,
        currency: orderData.currency,
        name: "FTT Luxury Group",
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
    placeholder = "",
    span = 1
  ) => (
    <div className={`flex flex-col gap-2.5 ${span > 1 ? `md:col-span-${span}` : ""}`}>
      <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-foreground/70">
        {label}
      </label>
      <input
        id={id}
        type={type}
        placeholder={placeholder || label}
        value={value}
        onChange={(event) =>
          setForm((prev) => ({ ...prev, [id]: event.target.value }))
        }
        disabled={!canCheckout || isSubmitting}
        className={`w-full rounded-xl border border-border bg-transparent focus:ring-1 focus:ring-primary focus:border-primary transition-all p-4 text-foreground placeholder:text-foreground/30 ${errors[id] ? "border-destructive focus:ring-destructive focus:border-destructive" : ""}`}
      />
      {errors[id] && (
        <p className="text-xs text-destructive">{errors[id]}</p>
      )}
    </div>
  );

  return (
    <div className="flex flex-col min-h-screen">
      <main className="max-w-7xl mx-auto w-full px-6 py-12 lg:px-20 flex-grow">
        {!hasHydrated ? (
          <div className="rounded-[24px] border border-border/60 bg-card/70 p-8 text-center text-sm text-foreground/60 shadow-soft">
            Loading your bag...
          </div>
        ) : hasItems ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
            {/* Left Column: Checkout Form */}
            <div className="lg:col-span-7 xl:col-span-8 flex flex-col gap-10">
              
              {/* Progress Component */}
              <div className="bg-card p-8 rounded-[24px] shadow-soft border border-border/20">
                <div className="flex items-end justify-between mb-6">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold text-primary uppercase tracking-[0.15em]">Step 02 of 03</span>
                    <h2 className="text-2xl font-serif font-bold text-foreground">Shipping & Payment</h2>
                  </div>
                  <span className="text-xs text-foreground/60 font-medium italic">66% Complete</span>
                </div>
                <div className="w-full bg-border/20 h-2 rounded-full overflow-hidden">
                  <div className="bg-primary h-full w-2/3 transition-all duration-700 ease-in-out"></div>
                </div>
                <div className="flex justify-between mt-6">
                  <div className="flex items-center gap-2 text-primary">
                    <CheckCircle className="w-4 h-4" />
                    <span className="text-[11px] font-bold uppercase tracking-[0.15em]">Shipping</span>
                  </div>
                  <div className="flex items-center gap-2 text-primary">
                    <CheckCircle2 className="w-4 h-4" />
                    <span className="text-[11px] font-bold uppercase tracking-[0.15em]">Payment</span>
                  </div>
                  <div className="flex items-center gap-2 text-foreground/60">
                    <Circle className="w-4 h-4" />
                    <span className="text-[11px] font-bold uppercase tracking-[0.15em]">Review</span>
                  </div>
                </div>
              </div>

              {/* Login Warning for unauthenticated users */}
              {!canCheckout && (
                <div className="rounded-[24px] border border-dashed border-border/70 p-6 text-sm text-foreground/60 bg-card">
                  Please sign in to place an order.{" "}
                  <Button asChild variant="link" className="px-0 font-bold text-primary">
                    <Link href="/account/sign-in">Sign in</Link>
                  </Button>
                </div>
              )}

              {/* Shipping Form Section */}
              <section className="bg-card p-10 rounded-[24px] shadow-soft border border-border/20">
                <div className="flex items-center gap-3 mb-8 text-foreground">
                  <Truck className="w-6 h-6 text-accent" />
                  <h3 className="text-xl font-serif font-bold">Shipping Details</h3>
                </div>

                {savedAddresses && savedAddresses.length > 0 && (
                  <div className="mb-8 p-4 bg-accent/5 border border-accent/20 rounded-xl">
                    <Label className="text-[10px] font-bold uppercase tracking-[0.15em] text-foreground/70">
                      Pre-fill from saved address
                    </Label>
                    <Select onValueChange={handleAddressSelect}>
                      <SelectTrigger className="mt-2 bg-transparent border-border">
                        <SelectValue placeholder="Choose a saved address..." />
                      </SelectTrigger>
                      <SelectContent>
                        {savedAddresses.map((addr) => {
                          const savedAddressLabel =
                            addr.label || addr.name || addr.line1 || "Saved address";
                          return (
                            <SelectItem key={addr.id} value={addr.id}>
                              {savedAddressLabel}
                              {addr.city ? `, ${addr.city}` : ""}
                              {addr.isDefault ? " (Default)" : ""}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {renderField("firstName", "First Name", form.firstName)}
                  {renderField("lastName", "Last Name", form.lastName)}
                  {renderField("email", "Email Address", form.email, "email", "john@example.com", 2)}
                  {renderField("phone", "Phone Number", form.phone, "tel", "+91 98765 43210", 2)}
                  {renderField("address", "Address Line 1", form.address, "text", "123 Modern Way", 2)}
                  {renderField("city", "City", form.city, "text", "San Francisco")}
                  {renderField("state", "State", form.state, "text", "California")}
                  {renderField("postal", "Postal Code", form.postal, "text", "94103")}
                  {renderField("country", "Country", form.country, "text", "India")}
                </div>
              </section>

              {/* Shipping Method Section */}
               <section className="bg-card p-10 rounded-[24px] shadow-soft border border-border/20">
                <div className="flex items-center gap-3 mb-8">
                  <Truck className="w-6 h-6 text-accent" />
                  <h3 className="text-xl font-serif font-bold text-foreground">Shipping Method</h3>
                </div>
                <div className="space-y-4">
                  <label className={`flex cursor-pointer items-center justify-between rounded-xl border p-6 transition ${shippingMethod === "standard" ? "border-primary bg-primary/5" : "border-border"}`}>
                    <div className="flex items-center gap-4">
                      <input
                        type="radio"
                        name="shipping"
                        value="standard"
                        checked={shippingMethod === "standard"}
                        onChange={() => setShippingMethod("standard")}
                        className="accent-primary w-4 h-4"
                      />
                      <div>
                        <p className="text-sm font-bold text-foreground">Standard Delivery</p>
                        <p className="text-xs text-foreground/60 mt-1">5 to 7 business days</p>
                      </div>
                    </div>
                    <span className="text-sm font-bold text-foreground">
                      {subtotal >= SHIPPING_TIERS.freeThreshold ? "Complimentary" : formatCurrency(SHIPPING_TIERS.standard)}
                    </span>
                  </label>
                  <label className={`flex cursor-pointer items-center justify-between rounded-xl border p-6 transition ${shippingMethod === "express" ? "border-primary bg-primary/5" : "border-border"}`}>
                    <div className="flex items-center gap-4">
                      <input
                        type="radio"
                        name="shipping"
                        value="express"
                        checked={shippingMethod === "express"}
                        onChange={() => setShippingMethod("express")}
                        className="accent-primary w-4 h-4"
                      />
                      <div>
                        <p className="text-sm font-bold text-foreground">Express Delivery</p>
                        <p className="text-xs text-foreground/60 mt-1">2 to 3 business days</p>
                      </div>
                    </div>
                    <span className="text-sm font-bold text-foreground">
                      {subtotal >= SHIPPING_TIERS.freeThreshold ? "Complimentary" : formatCurrency(SHIPPING_TIERS.express)}
                    </span>
                  </label>
                </div>
              </section>

              {/* Payment Method Section (Replaces fake CC fields with info) */}
              <section className="bg-card p-10 rounded-[24px] shadow-soft border border-border/20">
                <div className="flex items-center gap-3 mb-8">
                  <CreditCard className="w-6 h-6 text-accent" />
                  <h3 className="text-xl font-serif font-bold text-foreground">Secure Payment</h3>
                </div>
                
                <div className="flex flex-col items-center justify-center py-10 px-6 border border-dashed border-border/60 rounded-xl bg-background/50 text-center gap-4">
                  <div className="p-4 bg-primary/5 rounded-full text-primary">
                    <ShieldCheck className="w-8 h-8" />
                  </div>
                  <h4 className="font-bold text-foreground">Payment Handled by Razorpay</h4>
                  <p className="text-sm text-foreground/60 max-w-sm">
                    You will be redirected to our secure payment gateway to complete your purchase. We support Credit Cards, UPI, Netbanking, and Wallets.
                  </p>
                </div>
              </section>

            </div>

            {/* Right Column: Order Summary */}
            <div className="lg:col-span-5 xl:col-span-4">
              <div className="sticky top-[104px] space-y-8">
                <div className="bg-card rounded-[24px] shadow-lift border border-border/20 overflow-hidden">
                  <div className="p-8 border-b border-border/40 bg-background/50">
                    <h3 className="text-2xl font-serif font-bold text-foreground">Order Summary</h3>
                  </div>
                  <div className="p-8 space-y-6">
                    {/* Cart Items */}
                    <div className="space-y-6">
                      {items.map((item) => (
                        <div key={item.id} className="flex gap-5">
                          <div className="h-24 w-24 flex-shrink-0 bg-background rounded-2xl overflow-hidden p-2 flex items-center justify-center border border-border/30">
                            {item.image ? (
                              <Image
                                src={item.image}
                                alt={item.name}
                                width={80}
                                height={80}
                                className="w-full h-full object-cover mix-blend-multiply rounded-lg"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-[8px] text-foreground/60 uppercase tracking-widest">
                                No Image
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col justify-center">
                            <p className="text-sm font-bold text-foreground">{item.name}</p>
                            <p className="text-[11px] text-foreground/50 mt-1 uppercase tracking-widest">Qty: {item.quantity}</p>
                            <p className="text-sm font-bold text-primary mt-2">
                              {formatCurrency(item.price)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    <hr className="border-border/40" />
                    
                    {/* Calculations */}
                    <div className="space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-foreground/60">Subtotal</span>
                        <span className="font-medium text-foreground">{formatCurrency(subtotal)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-foreground/60">Shipping</span>
                        <span className="font-bold text-emerald-700 tracking-wider">
                          {shippingCost === 0 ? "COMPLIMENTARY" : formatCurrency(shippingCost)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-foreground/60">
                          Estimated Tax ({taxRateLabel})
                        </span>
                        <span className="font-medium text-foreground">{formatCurrency(taxAmount)}</span>
                      </div>
                    </div>
                    
                    <hr className="border-border/40" />
                    
                    <div className="flex justify-between items-center py-2">
                      <span className="text-lg font-serif font-bold text-foreground">Total</span>
                      <span className="text-3xl font-serif font-bold text-primary">{formatCurrency(total)}</span>
                    </div>

                    {error && <p className="text-sm text-destructive font-medium bg-destructive/10 p-3 rounded-lg text-center">{error}</p>}
                    
                    <button 
                      onClick={handleSubmit}
                      disabled={!canCheckout || isSubmitting}
                      className="w-full bg-primary hover:bg-[#5a1818] text-primary-foreground font-bold py-5 rounded-full shadow-lg shadow-primary/20 transition-all transform hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-3 mt-4 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                    >
                      <span className="uppercase tracking-[0.15em] text-[10px]">
                        {isSubmitting ? "Processing..." : "Complete your order"}
                      </span>
                      <Lock className="w-4 h-4" />
                    </button>
                    
                    <p className="text-[9px] text-center text-foreground/50 mt-6 uppercase tracking-[0.2em] font-bold">
                      Secure SSL Encrypted Gateway
                    </p>
                  </div>
                </div>
                
                {/* Trust Badge */}
                <div className="bg-primary/5 border border-primary/10 rounded-[24px] p-8 flex items-start gap-6">
                  <ShieldCheck className="text-primary w-8 h-8 shrink-0" />
                  <div className="flex flex-col gap-2">
                    <h4 className="text-[11px] font-bold text-primary uppercase tracking-[0.15em]">FTT Buyer Assurance</h4>
                    <p className="text-xs text-foreground/70 leading-relaxed italic">
                      Premium protection for your acquisitions. We ensure complete satisfaction or a full reconciliation securely via our payment partners.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-10">
            <div className="rounded-[24px] border border-dashed border-border/70 bg-card/60 p-12 text-center shadow-soft max-w-2xl mx-auto">
              <p className="text-[10px] uppercase tracking-[0.2em] text-foreground/60 font-bold">
                Your bag is empty
              </p>
              <h2 className="mt-4 font-serif text-3xl text-foreground font-bold">
                Add a treasure to continue
              </h2>
              <p className="mt-4 text-sm text-foreground/70 leading-relaxed">
                Browse our curated collection of luxury items and return here to complete your acquisition.
              </p>
              <Button asChild className="mt-8 rounded-full px-10 py-6 bg-primary hover:bg-[#5a1818] text-primary-foreground">
                <Link href="/collection" className="uppercase tracking-[0.15em] text-[10px] font-bold">Explore the Collection</Link>
              </Button>
            </div>

            <section className="space-y-8 pt-10">
              <div className="space-y-3 text-center">
                <p className="text-[10px] uppercase tracking-[0.2em] text-accent font-bold">
                  Featured Picks
                </p>
                <h2 className="font-serif text-3xl text-foreground font-bold">
                  Treasures to begin with
                </h2>
              </div>
              <div className="grid gap-6 md:grid-cols-3 max-w-5xl mx-auto">
                {featuredPicks.map((product) => {
                  const imageSrc = resolveMediaURL(product.images?.[0]);
                  return (
                    <Link
                      key={product.id}
                      href={`/collection/${product.slug}`}
                      className="group flex flex-col items-center gap-5 rounded-[24px] border border-border/40 bg-card p-6 shadow-soft transition-all hover:-translate-y-1 hover:shadow-lift"
                    >
                      <div className="relative h-40 w-full overflow-hidden rounded-[16px] bg-background">
                        {imageSrc ? (
                          <Image
                            src={imageSrc}
                            alt={product.name}
                            fill
                            className="object-cover transition duration-700 group-hover:scale-105 mix-blend-multiply"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[10px] uppercase tracking-[0.2em] text-foreground/60 font-bold">
                            No image
                          </div>
                        )}
                      </div>
                      <div className="space-y-2 text-center">
                        <p className="font-serif text-lg font-bold text-foreground">
                          {product.name}
                        </p>
                        <p className="text-sm font-bold text-primary">
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
      </main>
    </div>
  );
}
