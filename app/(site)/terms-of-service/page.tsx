import type { Metadata } from "next";

import { ScrollReveal } from "@/components/animations/scroll-reveal";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "Terms and conditions governing use of the From the Trunk platform.",
};

export default function TermsOfServicePage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-10 px-6 py-16">
      <ScrollReveal className="space-y-4">
        <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground">
          Legal
        </p>
        <h1 className="font-serif text-4xl text-foreground">
          Terms of Service
        </h1>
        <p className="text-sm text-muted-foreground">
          Last updated: February 2026
        </p>
      </ScrollReveal>

      <div className="prose prose-sm max-w-none space-y-6 text-muted-foreground">
        <section className="space-y-3">
          <h2 className="font-serif text-xl text-foreground">
            1. Acceptance of Terms
          </h2>
          <p>
            By accessing or using From the Trunk, you agree to be bound by these
            terms. If you do not agree, please do not use our services.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-serif text-xl text-foreground">2. Products</h2>
          <p>
            All sarees listed on From the Trunk are pre-loved, one-of-a-kind
            pieces. Product descriptions, images, and provenance details are
            provided to the best of our knowledge. Minor variations from
            descriptions are inherent to vintage and pre-loved items.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-serif text-xl text-foreground">
            3. Pricing & Payment
          </h2>
          <p>
            All prices are listed in Indian Rupees (INR) and include applicable
            taxes unless otherwise noted. Payment is processed securely through
            Razorpay. Prices are subject to change without notice, but changes
            will not affect orders already placed.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-serif text-xl text-foreground">
            4. Orders & Reservations
          </h2>
          <p>
            When you add an item to your cart, it is temporarily reserved for 30
            minutes. Orders are confirmed only upon successful payment. We
            reserve the right to cancel orders if payment verification fails.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-serif text-xl text-foreground">5. Accounts</h2>
          <p>
            You are responsible for maintaining the confidentiality of your
            account. You agree to notify us immediately of any unauthorised
            access.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-serif text-xl text-foreground">
            6. Intellectual Property
          </h2>
          <p>
            All content on this site, including product descriptions,
            photography, design, and branding, is the property of From the Trunk
            and may not be reproduced without permission.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-serif text-xl text-foreground">
            7. Limitation of Liability
          </h2>
          <p>
            From the Trunk shall not be liable for any indirect, incidental, or
            consequential damages arising from your use of our services or
            products.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-serif text-xl text-foreground">
            8. Governing Law
          </h2>
          <p>
            These terms are governed by the laws of India. Any disputes shall be
            subject to the exclusive jurisdiction of courts in Mumbai,
            Maharashtra.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-serif text-xl text-foreground">9. Contact</h2>
          <p>
            For questions about these terms, contact us at{" "}
            <a
              href="mailto:hello@fromthetrunk.shop"
              className="text-primary underline"
            >
              hello@fromthetrunk.shop
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
