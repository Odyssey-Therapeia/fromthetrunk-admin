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
    "Give your saree a second story. From sourcing to doorstep delivery, every piece is cared for with love and respect for its heritage.",
};

export default async function HowItWorksPage() {
  const { isEnabled: includeDrafts } = await draftMode();
  const howItWorksPage = await getGlobals("howItWorksPage", { includeDrafts });
  const textOrFallback = (value: unknown, fallback: string) =>
    typeof value === "string" && value.trim().length > 0 ? value : fallback;
  const steps = [
    {
      title: textOrFallback(howItWorksPage?.stepOneTitle, "Sourcing"),
      description:
        textOrFallback(
          howItWorksPage?.stepOneBody,
          "We give new life to preloved sarees sourced directly from homes."
        ),
    },
    {
      title: textOrFallback(howItWorksPage?.stepTwoTitle, "Quality Control"),
      description:
        textOrFallback(
          howItWorksPage?.stepTwoBody,
          "A rigorous 360\u00B0 check for tears, spills, and material integrity."
        ),
    },
    {
      title: textOrFallback(howItWorksPage?.stepThreeTitle, "Eco-Restoration"),
      description:
        textOrFallback(
          howItWorksPage?.stepThreeBody,
          "Conscious cleaning and artisanal mending that respects the fabric."
        ),
    },
    {
      title: textOrFallback(howItWorksPage?.stepFourTitle, "Sustainable Packaging"),
      description:
        textOrFallback(
          howItWorksPage?.stepFourBody,
          "Zero-plastic. We use reusable paper bags and natural scents."
        ),
    },
    {
      title: "Doorstep Magic",
      description: "Safe, carbon-conscious delivery to your wardrobe.",
    },
  ];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-12 px-6 py-16">
      <ScrollReveal className="space-y-3">
        <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground">
          {textOrFallback(howItWorksPage?.eyebrow, "How It Works")}
        </p>
        <h1 className="font-serif text-4xl text-foreground">
          {textOrFallback(howItWorksPage?.title, "Give your saree a second story")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {textOrFallback(
            howItWorksPage?.description,
            "Have a pre-loved saree you\u2019re ready to part with? We\u2019d love to give it a new life. Each piece will be thoughtfully curated, and you will be compensated fairly based on its value and condition."
          )}
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
