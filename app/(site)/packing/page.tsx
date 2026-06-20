import type { Metadata } from "next";
import Link from "next/link";

import { ScrollReveal } from "@/components/animations/scroll-reveal";

export const metadata: Metadata = {
  title: "Packing",
  description:
    "How From the Trunk prepares, protects, and dispatches each saree order.",
};

export default function PackingPage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 px-4 py-8 sm:space-y-10 sm:px-6 sm:py-12 lg:py-16">
      <ScrollReveal className="space-y-4">
        <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground">
          Customer Care
        </p>
        <h1 className="font-serif text-3xl text-foreground sm:text-4xl">
          Packing
        </h1>
        <p className="text-sm text-muted-foreground">
          Last updated: April 2026
        </p>
      </ScrollReveal>

      <div className="prose prose-sm max-w-none space-y-6 text-muted-foreground">
        <section className="space-y-3">
          <h2 className="font-serif text-xl text-foreground">
            Prepared With Care
          </h2>
          <p>
            Each From the Trunk saree is checked before dispatch, folded with
            care, and packed to protect the textile through the delivery
            journey. Our goal is for every piece to arrive clean, composed, and
            ready to be stored or worn.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-serif text-xl text-foreground">
            What Comes in the Box
          </h2>
          <ul className="list-disc space-y-1 pl-6">
            <li>
              Acid-free tissue around the saree to reduce direct abrasion.
            </li>
            <li>A protective muslin cloth bag for storage after unboxing.</li>
            <li>A story card with available provenance and care notes.</li>
            <li>
              A sturdy outer box selected to keep the package structured in
              transit.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="font-serif text-xl text-foreground">
            Before Dispatch
          </h2>
          <p>
            We verify the order, confirm the saree is packed in its protective
            layers, and hand it over to the shipping partner. Tracking details
            are sent once the shipment is created.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-serif text-xl text-foreground">
            Receiving Your Saree
          </h2>
          <p>
            Please inspect the outer package when it arrives. If the parcel
            appears damaged, photograph the packaging before opening it and
            contact us at{" "}
            <a
              href="mailto:hello@fromthetrunk.shop"
              className="text-primary underline"
            >
              hello@fromthetrunk.shop
            </a>{" "}
            within 48 hours.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-serif text-xl text-foreground">
            Related Support
          </h2>
          <p>
            For delivery timelines and rates, see the{" "}
            <Link href="/shipping-policy" className="text-primary underline">
              shipping policy
            </Link>
            . For return eligibility after delivery, see the{" "}
            <Link href="/return-policy" className="text-primary underline">
              return policy
            </Link>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
