import type { Metadata } from "next";
import { draftMode } from "next/headers";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

import { ScrollReveal } from "@/components/animations/scroll-reveal";
import { ProductGallery } from "@/components/product/product-gallery";
import { ProductCard } from "@/components/product/product-card";
import { AddToCartButton } from "@/components/cart/add-to-cart-button";
import { ProductViewTracker } from "@/components/product/product-view-tracker";
import { RecentlyViewed } from "@/components/product/recently-viewed";
import { WishlistButton } from "@/components/product/wishlist-button";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { formatCurrency } from "@/lib/formatters";
import { getProductBySlug, getProducts } from "@/lib/data/products";
import { resolveMediaURL } from "@/lib/media/resolve-media-url";
import { getProductDisplayDetails } from "@/lib/products/display-details";
import { productJsonLd, breadcrumbJsonLd } from "@/lib/seo/json-ld";
import type { Product } from "@/types/domain";

interface ProductPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const rawProduct = await getProductBySlug(slug);

  if (!rawProduct) {
    return { title: "Product Not Found" };
  }

  const product = rawProduct as Product;
  const image = resolveMediaURL(product.images?.[0]);
  const displayDetails = getProductDisplayDetails(product);

  return {
    title: product.name,
    description:
      product.storyNarrative ??
      `${product.name}: ${displayDetails.fabric} from the trunk. ${formatCurrency(product.pricePaise / 100)}.`,
    openGraph: {
      title: product.name,
      description:
        product.storyNarrative ??
        `One-of-a-kind ${displayDetails.fabric}. ${formatCurrency(product.pricePaise / 100)}.`,
      type: "website",
      ...(image ? { images: [{ url: image, alt: product.name }] } : {}),
    },
  };
}

export default async function SareePage({ params }: ProductPageProps) {
  const { isEnabled: includeDrafts } = await draftMode();
  const { slug } = await params;
  const rawProduct = await getProductBySlug(slug, { includeDrafts });

  if (!rawProduct) {
    return notFound();
  }

  const product = rawProduct as Product;
  const displayDetails = getProductDisplayDetails(product);
  const allProducts = await getProducts(12, { includeDrafts });
  const relatedPool = (allProducts.docs as Product[]).filter(
    (item) => item.slug !== product.slug
  );
  const productOccasions = new Set(product.tags.map((tag) => tag.name));
  const normalizedFabric = displayDetails.fabric.toLowerCase();
  const normalizedEra = product.storyEra?.toLowerCase() ?? "";

  const rankedRelated = relatedPool
    .map((candidate) => {
      const candidateDisplayDetails = getProductDisplayDetails(candidate);
      const candidateOccasions = new Set(candidate.tags.map((tag) => tag.name));
      const candidateFabric = candidateDisplayDetails.fabric.toLowerCase();
      let score = 0;

      if (
        normalizedEra &&
        candidate.storyEra &&
        candidate.storyEra.toLowerCase() === normalizedEra
      ) {
        score += 3;
      }

      if (
        normalizedFabric &&
        candidateFabric === normalizedFabric
      ) {
        score += 2;
      }

      for (const occasion of productOccasions) {
        if (candidateOccasions.has(occasion)) {
          score += 1;
          break;
        }
      }

      return { candidate, displayDetails: candidateDisplayDetails, score };
    })
    .sort((a, b) => b.score - a.score);

  const related = rankedRelated.slice(0, 3).map((item) => item.candidate);
  const topRecommendation = rankedRelated[0];
  const sameEraMatch = Boolean(
    topRecommendation &&
      normalizedEra &&
      topRecommendation.candidate.storyEra?.toLowerCase() === normalizedEra
  );
  const sameFabricMatch = Boolean(
    topRecommendation &&
      normalizedFabric &&
      topRecommendation.displayDetails.fabric.toLowerCase() === normalizedFabric
  );
  const recommendationEyebrow = sameEraMatch
    ? "From the same era"
    : sameFabricMatch
      ? `Similar ${displayDetails.fabric}`
      : "You May Also Love";
  const recommendationTitle = sameEraMatch
    ? "Curated pieces from the same chapter"
    : sameFabricMatch
      ? "More treasures in a similar weave"
      : "More treasures from the trunk";
  const images = (product.images ?? [])
    .map((img) => resolveMediaURL(img as unknown))
    .filter(Boolean) as string[];

  const baseUrl = process.env.NEXT_PUBLIC_SERVER_URL || "https://fromthetrunk.com";
  const jsonLd = productJsonLd(product as Product);
  const breadcrumbs = breadcrumbJsonLd([
    { name: "Home", url: baseUrl },
    { name: "Collection", url: `${baseUrl}/collection` },
    { name: product.name, url: `${baseUrl}/collection/${product.slug}` },
  ]);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-10 px-4 py-6 sm:px-6 sm:py-10 lg:space-y-16 lg:py-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }}
      />
      <ProductViewTracker
        id={product.id}
        slug={product.slug}
        name={product.name}
        price={product.pricePaise / 100}
        image={images[0] ?? ""}
      />
      <div className="grid gap-6 lg:gap-12 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="order-2 lg:order-1">
          <ProductGallery images={images} alt={product.name} />
        </div>

        <ScrollReveal delay={0.1} className="order-1 flex flex-col gap-6 lg:order-2">
          <div className="space-y-3">
            <Badge className="bg-secondary text-muted-foreground">
              {product.storyEra ?? "Archive"}
            </Badge>
            <h1 className="font-serif text-3xl text-foreground md:text-4xl">
              {product.name}
            </h1>
            <p className="text-sm text-muted-foreground">
              {product.storyTitle}
            </p>
            <div className="flex items-center gap-3">
              <span className="text-xl font-semibold text-foreground">
                {formatCurrency(product.pricePaise / 100)}
              </span>
              {product.originalPricePaise && (
                <span className="text-sm text-muted-foreground line-through">
                  {formatCurrency(product.originalPricePaise / 100)}
                </span>
              )}
              <WishlistButton
                productId={product.id}
                productName={product.name}
              />
            </div>
          </div>

          <div className="order-2 space-y-4 border-t border-border/60 pt-6 lg:order-3">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">
                Length
              </p>
              <div className="rounded-2xl border border-border/60 bg-card/70 px-4 py-3 text-sm text-foreground">
                {displayDetails.length}
              </div>
            </div>
            <AddToCartButton product={product} />
            {product.stockStatus === "available" && (
              <p className="text-xs text-muted-foreground">
                This is a one-of-a-kind piece. It will be reserved for you once added to your bag.
              </p>
            )}
            {product.stockStatus === "sold" && (
              <p className="text-xs text-muted-foreground">
                This piece has found a new home. Browse the collection for similar treasures.
              </p>
            )}
          </div>

          <div className="order-3 space-y-4 border-t border-border/60 pt-6 lg:order-2">
            <p className="text-sm text-muted-foreground">
              {product.storyNarrative}
            </p>
            {product.storyProvenance && (
              <p className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">
                  Provenance:
                </span>{" "}
                {product.storyProvenance}
              </p>
            )}
          </div>

          <Accordion
            type="single"
            collapsible
            className="order-4 w-full border-t border-border/60 pt-2"
          >
            <AccordionItem value="details">
              <AccordionTrigger>Product Details</AccordionTrigger>
              <AccordionContent className="space-y-2 text-sm text-muted-foreground">
                <p>Fabric: {displayDetails.fabric}</p>
                <p>Length: {displayDetails.length}</p>
                <p>Width: {displayDetails.width}</p>
                <p>Condition: {displayDetails.condition}</p>
                {displayDetails.designer && (
                  <p>Designer: {displayDetails.designer}</p>
                )}
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="care">
              <AccordionTrigger>Care Instructions</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">
                Dry clean only. Store in the provided muslin wrap away from
                direct sunlight and humidity.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </ScrollReveal>
      </div>

      {related.length > 0 && (
        <section className="space-y-6">
          <ScrollReveal className="flex items-end justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground">
                {recommendationEyebrow}
              </p>
              <h2 className="font-serif text-2xl text-foreground">
                {recommendationTitle}
              </h2>
            </div>
          </ScrollReveal>
          <div className="grid grid-cols-2 gap-2.5 sm:gap-4 md:gap-6 lg:grid-cols-3">
            {related.map((item, index) => (
              <ScrollReveal key={item.id} delay={index * 0.05}>
                <ProductCard product={item} />
              </ScrollReveal>
            ))}
          </div>
        </section>
      )}

      <RecentlyViewed excludeId={product.id} limit={6} />
    </div>
  );
}
