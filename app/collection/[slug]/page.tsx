import { notFound } from "next/navigation";

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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { sarees, getSareeBySlug } from "@/lib/data/sarees";
import { formatCurrency } from "@/lib/formatters";

interface SareePageProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return sarees.map((saree) => ({ slug: saree.slug }));
}

export default async function SareePage({ params }: SareePageProps) {
  const { slug } = await params;
  const saree = getSareeBySlug(slug);

  if (!saree) {
    notFound();
  }

  const related = sarees.filter((item) => item.slug !== saree.slug).slice(0, 3);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-16 px-6 py-16">
      <div className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr]">
        <ScrollReveal>
          <ProductGallery images={saree.images} alt={saree.name} />
        </ScrollReveal>

        <ScrollReveal delay={0.1} className="space-y-6">
          <div className="space-y-3">
            <Badge className="bg-secondary text-muted-foreground">
              {saree.story.era ?? "Archive"}
            </Badge>
            <h1 className="font-serif text-3xl text-foreground md:text-4xl">
              {saree.name}
            </h1>
            <p className="text-sm text-muted-foreground">
              {saree.story.title}
            </p>
            <div className="flex items-center gap-3">
              <span className="text-xl font-semibold text-foreground">
                {formatCurrency(saree.price)}
              </span>
              {saree.originalPrice && (
                <span className="text-sm text-muted-foreground line-through">
                  {formatCurrency(saree.originalPrice)}
                </span>
              )}
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {saree.story.narrative}
            </p>
            {saree.story.provenance && (
              <p className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">
                  Provenance:
                </span>{" "}
                {saree.story.provenance}
              </p>
            )}
          </div>

          <Separator />

          <div className="space-y-4">
            <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">
              Select length
            </p>
            <Select defaultValue="standard">
              <SelectTrigger>
                <SelectValue placeholder="Select size" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="standard">Standard (5.5m)</SelectItem>
                <SelectItem value="petite">Petite (5.2m)</SelectItem>
              </SelectContent>
            </Select>
            <AddToCartButton saree={saree} />
            <p className="text-xs text-muted-foreground">
              Demo checkout only — payment will be simulated.
            </p>
          </div>

          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="details">
              <AccordionTrigger>Product Details</AccordionTrigger>
              <AccordionContent className="space-y-2 text-sm text-muted-foreground">
                <p>Fabric: {saree.details.fabric}</p>
                <p>Length: {saree.details.length}</p>
                <p>Width: {saree.details.width}</p>
                <p>Condition: {saree.details.condition}</p>
                {saree.details.designer && (
                  <p>Designer: {saree.details.designer}</p>
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
              <ProductCard saree={item} />
            </ScrollReveal>
          ))}
        </div>
      </section>
    </div>
  );
}
