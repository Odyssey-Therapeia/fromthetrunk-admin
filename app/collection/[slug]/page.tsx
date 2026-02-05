import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

import { ScrollReveal } from "@/components/animations/scroll-reveal";
import { ProductGallery } from "@/components/product/product-gallery";
import { ProductCard } from "@/components/product/product-card";
import { AddToCartButton } from "@/components/cart/add-to-cart-button";
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
import { resolveMediaURL } from "@/lib/payload";

interface ProductPageProps {
  params: { slug: string };
}

export default async function SareePage({ params }: ProductPageProps) {
  const { slug } = params;
  const product = await getProductBySlug(slug);

  if (!product) {
    notFound();
  }

  const allProducts = await getProducts(12);
  const related = allProducts.docs.filter((item) => item.slug !== product.slug).slice(0, 3);
  const images = (product.images ?? [])
    .map((image: any) => resolveMediaURL(image))
    .filter(Boolean) as string[];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-16 px-6 py-16">
      <div className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr]">
        <ScrollReveal>
          <ProductGallery images={images} alt={product.name} />
        </ScrollReveal>

        <ScrollReveal delay={0.1} className="space-y-6">
          <div className="space-y-3">
            <Badge className="bg-secondary text-muted-foreground">
              {product.story?.era ?? "Archive"}
            </Badge>
            <h1 className="font-serif text-3xl text-foreground md:text-4xl">
              {product.name}
            </h1>
            <p className="text-sm text-muted-foreground">
              {product.story?.title}
            </p>
            <div className="flex items-center gap-3">
              <span className="text-xl font-semibold text-foreground">
                {formatCurrency(product.price ?? 0)}
              </span>
              {product.originalPrice && (
                <span className="text-sm text-muted-foreground line-through">
                  {formatCurrency(product.originalPrice)}
                </span>
              )}
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {product.story?.narrative}
            </p>
            {product.story?.provenance && (
              <p className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">
                  Provenance:
                </span>{" "}
                {product.story.provenance}
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
                {product.details?.length ?? "Made to drape"}
              </div>
            </div>
            <AddToCartButton product={product} />
            <p className="text-xs text-muted-foreground">
              Demo checkout only — payment will be simulated.
            </p>
          </div>

          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="details">
              <AccordionTrigger>Product Details</AccordionTrigger>
              <AccordionContent className="space-y-2 text-sm text-muted-foreground">
                <p>Fabric: {product.details?.fabric ?? "—"}</p>
                <p>Length: {product.details?.length ?? "—"}</p>
                <p>Width: {product.details?.width ?? "—"}</p>
                <p>Condition: {product.details?.condition ?? "—"}</p>
                {product.details?.designer && (
                  <p>Designer: {product.details.designer}</p>
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

      <section className="space-y-6">
        <ScrollReveal className="flex items-end justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground">
              You May Also Love
            </p>
            <h2 className="font-serif text-2xl text-foreground">
              More treasures from the trunk
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
    </div>
  );
}
