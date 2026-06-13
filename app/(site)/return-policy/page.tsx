import type { Metadata } from "next";

import { ScrollReveal } from "@/components/animations/scroll-reveal";

export const metadata: Metadata = {
  title: "Return Policy",
  description: "Return and refund policy for purchases from From the Trunk.",
};

export default function ReturnPolicyPage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 px-4 py-8 sm:space-y-10 sm:px-6 sm:py-12 lg:py-16">
      <ScrollReveal className="space-y-4">
        <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground">Legal</p>
        <h1 className="font-serif text-3xl text-foreground sm:text-4xl">Return & Refund Policy</h1>
        <p className="text-sm text-muted-foreground">Last updated: April 2026</p>
      </ScrollReveal>

      <div className="prose prose-sm max-w-none space-y-6 text-muted-foreground">
        <section className="space-y-3">
          <h2 className="font-serif text-xl text-foreground">One-of-a-Kind Pieces</h2>
          <p>
            Every saree in our collection is a unique, pre-loved piece. Because
            of the nature of these items, we encourage you to review all product
            details, images, and provenance information carefully before
            purchasing.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-serif text-xl text-foreground">Return Eligibility</h2>
          <ul className="list-disc space-y-1 pl-6">
            <li>Returns are accepted within <strong className="text-foreground">7 days</strong> of delivery.</li>
            <li>The saree must be in its original condition: unworn, unwashed, and in its original packaging.</li>
            <li>Returns are not accepted for items that have been altered, worn, or damaged after delivery.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="font-serif text-xl text-foreground">How to Initiate a Return</h2>
          <p>
            Email us at{" "}
            <a href="mailto:hello@fromthetrunk.com" className="text-primary underline">
              hello@fromthetrunk.com
            </a>{" "}
            with your order number and reason for return. Our team will review
            your request and provide instructions within 2 business days.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-serif text-xl text-foreground">Refund Process</h2>
          <ul className="list-disc space-y-1 pl-6">
            <li>Once we receive and inspect the returned item, your refund will be processed within <strong className="text-foreground">5 to 7 business days</strong>.</li>
            <li>Refunds are issued to the original payment method.</li>
            <li>Shipping costs are non-refundable unless the return is due to our error.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="font-serif text-xl text-foreground">Damaged or Incorrect Items</h2>
          <p>
            If you receive a damaged or incorrect item, please contact us within
            48 hours of delivery with photographs. We will arrange a return at
            no cost to you and issue a full refund or replacement.
          </p>
        </section>
      </div>
    </div>
  );
}
