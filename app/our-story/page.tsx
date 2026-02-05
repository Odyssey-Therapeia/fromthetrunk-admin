import Image from "next/image";

import { ScrollReveal } from "@/components/animations/scroll-reveal";
import { Card } from "@/components/ui/card";

const storyHero =
  "https://images.unsplash.com/photo-1727430228383-aa1fb59db8bf?q=80&w=2200&auto=format&fit=crop";

export default function OurStoryPage() {
  return (
    <div className="space-y-16 pb-20">
      <section className="relative min-h-[60vh] overflow-hidden">
        <Image
          src={storyHero}
          alt="Heirloom sarees folded inside a trunk"
          fill
          className="object-cover"
        />
        <div className="absolute inset-0 bg-luxury-fade" />
        <div className="absolute inset-0 bg-black/35" />
        <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-4 px-6 pb-16 pt-32 text-white">
          <ScrollReveal>
            <p className="text-xs uppercase tracking-[0.5em] text-amber-100/70">
              Our Story
            </p>
            <h1 className="font-serif text-4xl md:text-6xl">
              A trunk of memories, reopened
            </h1>
          </ScrollReveal>
        </div>
      </section>

      <section className="mx-auto w-full max-w-5xl space-y-10 px-6">
        <ScrollReveal className="space-y-4">
          <h2 className="font-serif text-3xl text-foreground">
            From keepsake to collection
          </h2>
          <p className="text-sm text-muted-foreground">
            The first trunk belonged to a grandmother who kept every saree she
            wore for milestones, festivals, and family weddings. We realized
            each piece carried a story worth preserving — and sharing.
          </p>
        </ScrollReveal>

        <div className="grid gap-6 md:grid-cols-3">
          {[
            {
              title: "Curated Heritage",
              description:
                "Every saree is sourced from trusted collectors and family archives.",
            },
            {
              title: "Authenticated Craft",
              description:
                "We verify weave, zari, and provenance before adding any piece.",
            },
            {
              title: "Modern Heirlooms",
              description:
                "Pieces are restored with care so they can be cherished again.",
            },
          ].map((item, index) => (
            <Card
              key={item.title}
              className="h-full border-border/60 bg-card/70 p-6 shadow-soft"
            >
              <h3 className="font-serif text-xl text-foreground">
                {item.title}
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {item.description}
              </p>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
