import Image from "next/image";
import Link from "next/link";

import { ScrollReveal } from "@/components/animations/scroll-reveal";
import { BentoCard, BentoGrid } from "@/components/ui/bento-grid";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/formatters";
import { resolveMediaURL } from "@/lib/media/resolve-media-url";
import type { Product } from "@/types/domain";
import type { HomePageContent } from "@/types/site-content";

const productLayouts = [
  "lg:col-span-2 lg:row-span-2",
  "lg:col-span-1 lg:row-span-1",
  "lg:col-span-1 lg:row-span-1",
  "lg:col-span-1 lg:row-span-1",
];

interface FeaturedCollectionProps {
  products: Product[];
  content?: HomePageContent | null;
}

export function FeaturedCollection({ products, content }: FeaturedCollectionProps) {
  const productCards = products.slice(0, 4).map((product, index) => {
    const image = resolveMediaURL(product.images?.[0]);
    return {
      name: product.name,
      description: `${product.detailsFabric ?? "Heirloom"}, ${formatCurrency(
        product.pricePaise / 100
      )}`,
      href: `/collection/${product.slug}`,
      cta: "View saree",
      className: "h-full",
      layoutClassName: productLayouts[index] ?? "lg:col-span-1",
      background: (
        <div className="absolute inset-0">
          {image ? (
            <Image
              src={image}
              alt={product.name}
              fill
              sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
              className="object-cover"
            />
          ) : (
            <div className="h-full w-full bg-muted" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-black/10" />
        </div>
      ),
    };
  });

  const featureCardImage = resolveMediaURL(products[0]?.images?.[1] ?? products[0]?.images?.[0]);

  const featureCard = {
    name: "The Trunk Promise",
    description:
      "Each saree is authenticated, restored, and documented with provenance.",
    href: "/our-story",
    cta: "Discover our curation",
    className: "h-full",
    layoutClassName: "lg:col-span-2 lg:row-span-1",
    background: (
      <div className="absolute inset-0">
        {featureCardImage ? (
          <Image
            src={featureCardImage}
            alt="Heirloom saree detail"
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 66vw"
            className="object-cover"
          />
        ) : (
          <div className="h-full w-full bg-muted" />
        )}
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
            {content?.featuredEyebrow ?? "Featured Collection"}
          </p>
          <h2 className="font-serif text-3xl text-foreground md:text-4xl">
            {content?.featuredTitle ?? "Curated treasures for the season"}
          </h2>
          <p className="max-w-xl text-sm text-muted-foreground">
            {content?.featuredBody ??
              "Every piece is authenticated and hand-selected from private wardrobes, couture houses, and archive trunks."}
          </p>
        </div>
        <Button asChild variant="outline" className="rounded-full px-6">
          <Link href={content?.featuredCtaHref ?? "/collection"}>
            {content?.featuredCtaLabel ?? "View All Sarees"}
          </Link>
        </Button>
      </ScrollReveal>

      <BentoGrid className="mt-10 auto-rows-[18rem] grid-cols-1 gap-5 md:grid-cols-3 md:auto-rows-[20rem] lg:auto-rows-[22rem]">
        {bentoCards.map((card, index) => {
          const { layoutClassName, ...cardProps } = card;
          return (
            <ScrollReveal
              key={`${card.name}-${index}`}
              delay={index * 0.08}
              className={layoutClassName}
            >
              <BentoCard {...cardProps} />
            </ScrollReveal>
          );
        })}
      </BentoGrid>
    </section>
  );
}
