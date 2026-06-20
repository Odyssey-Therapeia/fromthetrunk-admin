/**
 * P5-06: FAQs page — emits valid schema.org FAQPage JSON-LD via the P3-08 FAQ
 * block (lib/content/blocks/faq.tsx).
 *
 * The FAQ block renders the accordion UI + the FAQPage ld+json <script> tag
 * using safeJsonLd() (</script> injection-safe, proven by block-faq-json-ld.test.ts).
 *
 * Adding real questions here rather than seeding the DB keeps the implementation
 * zero-migration, as required by the packet.
 */

import type { Metadata } from "next";

import { faqBlock } from "@/lib/content/blocks/faq";

export const metadata: Metadata = {
  title: "Frequently Asked Questions",
  description:
    "Answers to the most common questions about From the Trunk — how we source, authenticate, and ship preloved luxury sarees.",
};

const FAQ_ITEMS = [
  {
    question: "What is From the Trunk?",
    answer:
      "From the Trunk is a curated marketplace for authenticated, pre-loved luxury sarees. We source forgotten treasures from homes across India, meticulously restore them, and give them a second life with a new custodian.",
  },
  {
    question: "How do you authenticate the sarees?",
    answer:
      "Every piece undergoes a rigorous 360° condition check — we inspect for tears, stains, zari integrity, and fabric quality before listing. Only pieces that pass our quality threshold make it to the collection.",
  },
  {
    question: "Are the sarees really pre-loved?",
    answer:
      "Yes. Every saree on From the Trunk has been owned and loved before. We believe pre-loved pieces carry unique provenance and character that new sarees simply cannot replicate.",
  },
  {
    question: "Do you offer returns?",
    answer:
      "We accept returns within 7 days of delivery if the piece is significantly different from its description. Because each saree is one-of-one, we encourage you to reach out to us before initiating a return.",
  },
  {
    question: "How do you ship the sarees?",
    answer:
      "We ship all sarees carefully folded and wrapped in muslin, packed in our signature trunk-inspired box. We ship across India and offer international shipping to select countries.",
  },
  {
    question: "Can I sell my sarees through From the Trunk?",
    answer:
      "Yes! We welcome submissions from custodians who wish to pass on their sarees. Reach out to us at hello@fromthetrunk.shop with photos and provenance details.",
  },
  {
    question: "How do I care for my saree?",
    answer:
      "Dry clean only. Store in the provided muslin wrap away from direct sunlight and humidity. Avoid plastic storage as it can trap moisture and damage the fabric.",
  },
  {
    question: "What payment methods do you accept?",
    answer:
      "We accept all major credit and debit cards, UPI, net banking, and wallets via our secure payment gateway. All transactions are processed in INR.",
  },
] as const;

/** FaqRenderer is a server component — call it directly (RSC pattern). */
const FaqRenderer = faqBlock.Renderer;

export default function FaqsPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-16">
      <div className="mb-10 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Support
        </p>
        <h1 className="font-serif text-4xl text-foreground md:text-5xl">
          Frequently Asked Questions
        </h1>
      </div>

      {/* P3-08 FAQ block — renders accordion + FAQPage JSON-LD script tag */}
      <FaqRenderer
        eyebrow="Need help?"
        heading="Common questions, answered"
        items={[...FAQ_ITEMS]}
      />
    </div>
  );
}
