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
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "@/lib/formatters";
import { getProductBySlug, getProducts } from "@/lib/data/products";
import { resolveMediaURL } from "@/lib/media/resolve-media-url";
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

  return {
    title: product.name,
    description:
      product.storyNarrative ??
      `${product.name} — ${product.detailsFabric ?? "Heirloom"} saree from the trunk. ${formatCurrency(product.pricePaise / 100)}.`,
    openGraph: {
      title: product.name,
      description:
        product.storyNarrative ??
        `One-of-a-kind ${product.detailsFabric ?? ""} saree. ${formatCurrency(product.pricePaise / 100)}.`,
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
    notFound();
  }

  const product = rawProduct as Product;
  const allProducts = await getProducts(12, { includeDrafts });
  const relatedPool = (allProducts.docs as Product[]).filter(
    (item) => item.slug !== product.slug
  );
  const productOccasions = new Set(product.tags.map((tag) => tag.name));
  const normalizedFabric = product.detailsFabric?.toLowerCase() ?? "";
  const normalizedEra = product.storyEra?.toLowerCase() ?? "";

  const rankedRelated = relatedPool
    .map((candidate) => {
      const candidateOccasions = new Set(candidate.tags.map((tag) => tag.name));
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
        candidate.detailsFabric &&
        candidate.detailsFabric.toLowerCase() === normalizedFabric
      ) {
        score += 2;
      }

      for (const occasion of productOccasions) {
        if (candidateOccasions.has(occasion)) {
          score += 1;
          break;
        }
      }

      return { candidate, score };
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
      topRecommendation.candidate.detailsFabric?.toLowerCase() ===
        normalizedFabric
  );
  const recommendationEyebrow = sameEraMatch
    ? "From the same era"
    : sameFabricMatch
      ? `Similar ${product.detailsFabric ?? "weaves"}`
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
    <div className="mx-auto w-full max-w-6xl space-y-16 px-6 py-16">
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
      <div className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr]">
        <ScrollReveal>
          <ProductGallery images={images} alt={product.name} />
        </ScrollReveal>

        <ScrollReveal delay={0.1} className="space-y-6">
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

          <Separator />

          <div className="space-y-4">
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

          <Separator />

          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">
                Length
              </p>
              <div className="rounded-2xl border border-border/60 bg-card/70 px-4 py-3 text-sm text-foreground">
                {product.detailsLength ?? "Made to drape"}
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

          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="details">
              <AccordionTrigger>Product Details</AccordionTrigger>
              <AccordionContent className="space-y-2 text-sm text-muted-foreground">
                <p>Fabric: {product.detailsFabric ?? "—"}</p>
                <p>Length: {product.detailsLength ?? "—"}</p>
                <p>Width: {product.detailsWidth ?? "—"}</p>
                <p>Condition: {product.detailsCondition ?? "—"}</p>
                {product.detailsDesigner && (
                  <p>Designer: {product.detailsDesigner}</p>
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
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
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
