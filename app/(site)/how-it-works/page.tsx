import type { Metadata } from "next";
import { draftMode } from "next/headers";

import { ScrollReveal } from "@/components/animations/scroll-reveal";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getGlobals } from "@/lib/data/products";

// Use force-dynamic since Payload CMS requires a database connection.
// In production with Vercel, ISR can be enabled per-route using
// revalidate config once the database is always available at build time.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "How It Works",
  description:
    "From sourcing to storytelling — learn how every heirloom saree is curated, authenticated, restored, and delivered with care.",
};

export default async function HowItWorksPage() {
  const { isEnabled: includeDrafts } = await draftMode();
  const howItWorksPage = await getGlobals("howItWorksPage", { includeDrafts });
  const steps = [
    {
      title: howItWorksPage?.stepOneTitle ?? "Sourcing & Curation",
      description:
        howItWorksPage?.stepOneBody ??
        "We partner with collectors, couture archives, and legacy wardrobes to source heirloom sarees.",
    },
    {
      title: howItWorksPage?.stepTwoTitle ?? "Authentication",
      description:
        howItWorksPage?.stepTwoBody ??
        "Our specialists verify weave, fabric, zari, and craftsmanship. Every piece is documented with provenance.",
    },
    {
      title: howItWorksPage?.stepThreeTitle ?? "Restoration",
      description:
        howItWorksPage?.stepThreeBody ??
        "Gentle cleaning, steaming, and preservation ensures each saree is ready to wear again.",
    },
    {
      title: howItWorksPage?.stepFourTitle ?? "Delivery",
      description:
        howItWorksPage?.stepFourBody ??
        "Your saree arrives in a protective muslin wrap with a story card and care notes.",
    },
  ];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-12 px-6 py-16">
      <ScrollReveal className="space-y-3">
        <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground">
          {howItWorksPage?.eyebrow ?? "How It Works"}
        </p>
        <h1 className="font-serif text-4xl text-foreground">
          {howItWorksPage?.title ?? "The journey of every saree"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {howItWorksPage?.description ??
            "From sourcing to storytelling, every piece is cared for with respect to its heritage."}
        </p>
      </ScrollReveal>

      <div className="space-y-6">
        {steps.map((step, index) => (
          <Card
            key={step.title}
            className="border-border/60 bg-card/80 p-6 shadow-soft"
          >
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground">
                  Step {String(index + 1).padStart(2, "0")}
                </p>
                <h2 className="font-serif text-2xl text-foreground">
                  {step.title}
                </h2>
              </div>
            </div>
            <Separator className="my-4" />
            <p className="text-sm text-muted-foreground">{step.description}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
