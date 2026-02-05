import Image from "next/image";
import Link from "next/link";
import { Crown, Gem, ShieldCheck, Sparkles } from "lucide-react";

import { ScrollReveal } from "@/components/animations/scroll-reveal";
import { BentoCard, BentoGrid } from "@/components/ui/bento-grid";
import { Button } from "@/components/ui/button";
import { featuredSarees } from "@/lib/data/sarees";
import { formatCurrency } from "@/lib/formatters";

const productLayouts = [
  "lg:col-span-2 lg:row-span-2",
  "lg:col-span-1 lg:row-span-1",
  "lg:col-span-1 lg:row-span-1",
  "lg:col-span-1 lg:row-span-1",
];

const productIcons = [Sparkles, Crown, Gem, ShieldCheck];

export function FeaturedCollection() {
  const productCards = featuredSarees.slice(0, 4).map((saree, index) => ({
    Icon: productIcons[index % productIcons.length],
    name: saree.name,
    description: `${saree.details.fabric} · ${formatCurrency(saree.price)}`,
    href: `/collection/${saree.slug}`,
    cta: "View saree",
    className: "h-full",
    layoutClassName: productLayouts[index] ?? "lg:col-span-1",
    background: (
      <div className="absolute inset-0">
        <Image
          src={saree.images[0]}
          alt={saree.name}
          fill
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-black/10" />
      </div>
    ),
  }));

  const featureCard = {
    Icon: ShieldCheck,
    name: "The Trunk Promise",
    description:
      "Each saree is authenticated, restored, and documented with provenance.",
    href: "/our-story",
    cta: "Discover our curation",
    className: "h-full",
    layoutClassName: "lg:col-span-2 lg:row-span-1",
    background: (
      <div className="absolute inset-0">
        <Image
          src={featuredSarees[0]?.images[1] ?? featuredSarees[0]?.images[0]}
          alt="Heirloom saree detail"
          fill
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-black/70 via-black/20 to-black/10" />
      </div>
    ),
  };

  const bentoCards = [...productCards, featureCard];

  return (
    <section className="mx-auto w-full max-w-6xl px-6">
      <ScrollReveal className="flex flex-wrap items-end justify-between gap-6">
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground">
            Featured Collection
          </p>
          <h2 className="font-serif text-3xl text-foreground md:text-4xl">
            Curated treasures for the season
          </h2>
          <p className="max-w-xl text-sm text-muted-foreground">
            Every piece is authenticated and hand-selected from private
            wardrobes, couture houses, and archive trunks.
          </p>
        </div>
        <Button asChild variant="outline" className="rounded-full px-6">
          <Link href="/collection">View All Sarees</Link>
        </Button>
      </ScrollReveal>

      <BentoGrid className="mt-10 auto-rows-[18rem] grid-cols-1 gap-5 md:grid-cols-3 md:auto-rows-[20rem] lg:auto-rows-[22rem]">
        {bentoCards.map((card, index) => (
          <ScrollReveal
            key={`${card.name}-${index}`}
            delay={index * 0.08}
            className={card.layoutClassName}
          >
            <BentoCard {...card} />
          </ScrollReveal>
        ))}
      </BentoGrid>
    </section>
  );
}
