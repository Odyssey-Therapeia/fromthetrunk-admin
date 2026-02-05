import { ScrollReveal } from "@/components/animations/scroll-reveal";
import { ProductCard } from "@/components/product/product-card";
import { getGlobals, getProducts } from "@/lib/data/products";

export default async function CollectionPage() {
  const [collectionPage, products] = await Promise.all([
    getGlobals("collectionPage"),
    getProducts(),
  ]);
  const items = products?.docs ?? [];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-12 px-6 py-16">
      <ScrollReveal className="space-y-4">
        <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground">
          {collectionPage?.eyebrow ?? "The Collection"}
        </p>
        <h1 className="font-serif text-4xl text-foreground md:text-5xl">
          {collectionPage?.title ?? "Curated pre-loved sarees"}
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          {collectionPage?.description ??
            "Discover heirlooms from private wardrobes, couture archives, and collector trunks. Each piece is authenticated and accompanied by its story."}
        </p>
      </ScrollReveal>

      <div className="rounded-2xl border border-border/60 bg-card/70 p-6 shadow-soft">
        <div className="flex flex-col gap-4">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">
              Curated Filters
            </p>
            <h2 className="font-serif text-2xl text-foreground">
              {collectionPage?.filtersTitle ?? "Refined browsing, coming soon"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {collectionPage?.filtersBody ??
                "We are preparing thoughtful ways to explore the collection by era, fabric, and provenance. Until then, every piece is here for you to discover."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {"Era,Fabric,Occasion,Designer,Motif".split(",").map((label) => (
              <span
                key={label}
                className="rounded-full border border-border/70 bg-background/70 px-3 py-1 text-xs uppercase tracking-[0.2em] text-muted-foreground"
              >
                {label}
              </span>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Showing {items.length} curated pieces.
          </p>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/70 p-8 text-center text-sm text-muted-foreground">
          The collection is being prepared. Check back soon for new arrivals.
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {items.map((product: any, index: number) => (
            <ScrollReveal key={product.id} delay={index * 0.05}>
              <ProductCard product={product} />
            </ScrollReveal>
          ))}
        </div>
      )}
    </div>
  );
}
