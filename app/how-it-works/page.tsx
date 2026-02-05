import { ScrollReveal } from "@/components/animations/scroll-reveal";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

const steps = [
  {
    title: "Sourcing & Curation",
    description:
      "We partner with collectors, couture archives, and legacy wardrobes to source heirloom sarees.",
  },
  {
    title: "Authentication",
    description:
      "Our specialists verify weave, fabric, zari, and craftsmanship. Every piece is documented with provenance.",
  },
  {
    title: "Restoration",
    description:
      "Gentle cleaning, steaming, and preservation ensures each saree is ready to wear again.",
  },
  {
    title: "Delivery",
    description:
      "Your saree arrives in a protective muslin wrap with a story card and care notes.",
  },
];

export default function HowItWorksPage() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-12 px-6 py-16">
      <ScrollReveal className="space-y-3">
        <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground">
          How It Works
        </p>
        <h1 className="font-serif text-4xl text-foreground">
          The journey of every saree
        </h1>
        <p className="text-sm text-muted-foreground">
          From sourcing to storytelling, every piece is cared for with respect
          to its heritage.
        </p>
      </ScrollReveal>

      <div className="space-y-6">
        {steps.map((step, index) => (
          <ScrollReveal key={step.title} delay={index * 0.05}>
            <Card className="border-border/60 bg-card/80 p-6 shadow-soft">
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
          </ScrollReveal>
        ))}
      </div>
    </div>
  );
}
