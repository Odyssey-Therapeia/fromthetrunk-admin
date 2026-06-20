/**
 * BLOCK-11: how-it-works
 *
 * Block-CMS equivalent of the hardcoded HowItWorks homepage section
 * (components/sections/how-it-works.tsx). Renders an eyebrow + heading, then a
 * BentoGrid of 3 numbered step cards (title + description over a dark gradient).
 *
 * DELTA vs. the hardcoded section: the original overlays dynamic product images
 * (resolved from a `products` prop) inside each card. A CMS block receives only
 * its own props — it cannot fetch products — so the step images are omitted and
 * the dark gradient renders over the card background. This is the same
 * acceptable delta documented for story-editorial (homepage-blocks.test.ts
 * DELTA-4): content/markup are equivalent; dynamic images are not carried over.
 * All classes (BentoGrid sizing, gradient, numbering, typography) are preserved
 * verbatim from the original section.
 *
 * Defaults reproduce the CURRENT values in components/sections/how-it-works.tsx:
 *   eyebrow: "How It Works"
 *   heading: "From trunk to your wardrobe"
 *   steps:   Curate / Authenticate / Deliver (with original descriptions)
 *
 * propsSchema validated on SAVE and on RENDER (defense in depth via renderBlock).
 * Renderer: RSC, theme tokens only — no raw hex or arbitrary px.
 */

import { z } from "zod";

import { ScrollReveal } from "@/components/animations/scroll-reveal";
import { BentoGrid } from "@/components/ui/bento-grid";
import type { BlockRegistryEntry } from "@/lib/content/blocks/registry";

export const howItWorksStepSchema = z.object({
  title: z.string().max(80),
  description: z.string().max(400),
});

export const howItWorksPropsSchema = z.object({
  eyebrow: z.string().max(80).default("How It Works"),
  heading: z.string().max(200).default("From trunk to your wardrobe"),
  steps: z
    .array(howItWorksStepSchema)
    .min(1)
    .max(6)
    .default([
      {
        title: "Curate",
        description:
          "We source sarees from private wardrobes, couture archives, and heritage collectors.",
      },
      {
        title: "Authenticate",
        description:
          "Each piece is inspected, restored, and documented with provenance.",
      },
      {
        title: "Deliver",
        description:
          "Your saree arrives with a story card, preservation notes, and careful packaging.",
      },
    ]),
});

export type HowItWorksBlockProps = z.infer<typeof howItWorksPropsSchema>;
export type HowItWorksStep = z.infer<typeof howItWorksStepSchema>;

function HowItWorksRenderer(props: Record<string, unknown>) {
  const p = props as HowItWorksBlockProps;

  return (
    <section className="mx-auto w-full max-w-6xl px-6">
      <ScrollReveal className="space-y-4 text-center">
        <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground">
          {p.eyebrow}
        </p>
        <h2 className="font-serif text-3xl text-foreground md:text-4xl">
          {p.heading}
        </h2>
      </ScrollReveal>

      <BentoGrid className="mt-10 auto-rows-[16rem] grid-cols-1 gap-5 md:grid-cols-3 md:auto-rows-[18rem]">
        {p.steps.map((step, index) => (
          <div
            key={step.title}
            className="group relative h-full overflow-hidden rounded-2xl border border-border/60 bg-card/70 shadow-soft"
          >
            <div className="absolute inset-0 bg-linear-to-t from-black/75 via-black/25 to-black/10" />
            <div className="relative z-10 flex h-full flex-col justify-between p-6 text-white">
              <div className="flex items-center justify-end">
                <span className="text-xs uppercase tracking-[0.4em] text-white/70">
                  {String(index + 1).padStart(2, "0")}
                </span>
              </div>
              <div>
                <h3 className="font-serif text-2xl">{step.title}</h3>
                <p className="mt-2 text-sm text-white/80">{step.description}</p>
              </div>
            </div>
          </div>
        ))}
      </BentoGrid>
    </section>
  );
}

export const howItWorksBlock: BlockRegistryEntry = {
  type: "how-it-works",
  propsSchema: howItWorksPropsSchema,
  Renderer: HowItWorksRenderer,
  editorMeta: {
    label: "How It Works",
    icon: "list-ordered",
    maxPerPage: 1,
  },
};
