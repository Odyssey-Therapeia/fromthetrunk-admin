import Image from "next/image";
import { Package, ShieldCheck, Sparkles } from "lucide-react";

import { ScrollReveal } from "@/components/animations/scroll-reveal";
import { BentoGrid } from "@/components/ui/bento-grid";
import { resolveMediaURL } from "@/lib/payload";

const steps = [
  {
    title: "Curate",
    description:
      "We source sarees from private wardrobes, couture archives, and heritage collectors.",
    icon: Sparkles,
  },
  {
    title: "Authenticate",
    description:
      "Each piece is inspected, restored, and documented with provenance.",
    icon: ShieldCheck,
  },
  {
    title: "Deliver",
    description:
      "Your saree arrives with a story card, preservation notes, and careful packaging.",
    icon: Package,
  },
];

interface HowItWorksProps {
  products: any[];
}

export function HowItWorks({ products }: HowItWorksProps) {
  return (
    <section className="mx-auto w-full max-w-6xl px-6">
      <ScrollReveal className="space-y-4 text-center">
        <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground">
          How It Works
        </p>
        <h2 className="font-serif text-3xl text-foreground md:text-4xl">
          From trunk to your wardrobe
        </h2>
      </ScrollReveal>

      <BentoGrid className="mt-10 auto-rows-[16rem] grid-cols-1 gap-5 md:grid-cols-3 md:auto-rows-[18rem]">
        {steps.map((step, index) => {
          const Icon = step.icon;
          const image = resolveMediaURL(
            products?.[index]?.images?.[0] ?? products?.[0]?.images?.[0]
          );

          return (
            <div
              key={step.title}
              className="group relative h-full overflow-hidden rounded-2xl border border-border/60 bg-card/70 shadow-soft"
            >
              {image && (
                <Image
                  src={image}
                  alt={`${step.title} saree detail`}
                  fill
                  className="object-cover opacity-70 transition duration-700 group-hover:scale-105"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-black/10" />
              <div className="relative z-10 flex h-full flex-col justify-between p-6 text-white">
                <div className="flex items-center justify-between">
                  <Icon className="h-10 w-10" />
                  <span className="text-xs uppercase tracking-[0.4em] text-white/70">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </div>
                <div>
                  <h3 className="font-serif text-2xl">{step.title}</h3>
                  <p className="mt-2 text-sm text-white/80">
                    {step.description}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </BentoGrid>
    </section>
  );
}
