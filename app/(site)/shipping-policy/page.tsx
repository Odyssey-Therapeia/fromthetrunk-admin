import type { Metadata } from "next";

import { ScrollReveal } from "@/components/animations/scroll-reveal";
import { formatCurrency } from "@/lib/formatters";

export const metadata: Metadata = {
  title: "Shipping Policy",
  description: "Shipping rates, delivery timelines, and packaging details for From the Trunk orders.",
};

export default function ShippingPolicyPage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-10 px-6 py-16">
      <ScrollReveal className="space-y-4">
        <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground">Legal</p>
        <h1 className="font-serif text-4xl text-foreground">Shipping Policy</h1>
        <p className="text-sm text-muted-foreground">Last updated: February 2026</p>
      </ScrollReveal>

      <div className="prose prose-sm max-w-none space-y-6 text-muted-foreground">
        <section className="space-y-3">
          <h2 className="font-serif text-xl text-foreground">Domestic Shipping (India)</h2>
          <div className="rounded-xl border border-border/60 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-muted-foreground">Method</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-muted-foreground">Delivery Time</th>
                  <th className="px-4 py-3 text-right text-xs uppercase tracking-wider text-muted-foreground">Cost</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-border/40">
                  <td className="px-4 py-3 text-foreground font-medium">Standard</td>
                  <td className="px-4 py-3">5–7 business days</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(500)}</td>
                </tr>
                <tr className="border-t border-border/40">
                  <td className="px-4 py-3 text-foreground font-medium">Express</td>
                  <td className="px-4 py-3">2–3 business days</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(1200)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-trunk-gold">
            Free shipping on all orders above {formatCurrency(25000)}.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-serif text-xl text-foreground">Packaging</h2>
          <p>Every saree is carefully packaged to preserve its condition:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Wrapped in acid-free tissue paper</li>
            <li>Placed in a protective muslin cloth bag</li>
            <li>Accompanied by a story card and care instructions</li>
            <li>Shipped in a sturdy branded box</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="font-serif text-xl text-foreground">Tracking</h2>
          <p>Once your order ships, you will receive a tracking number via email. You can also check your order status from your account dashboard.</p>
        </section>

        <section className="space-y-3">
          <h2 className="font-serif text-xl text-foreground">International Shipping</h2>
          <p>We currently ship within India. International shipping will be available soon. Contact us at <a href="mailto:hello@fromthetrunk.com" className="text-primary underline">hello@fromthetrunk.com</a> for special requests.</p>
        </section>
      </div>
    </div>
  );
}
