import { z } from "zod";
import Link from "next/link";

import {
  getFeaturedProducts,
  getProducts,
  getProductsByCollection,
  getProductsByIds,
} from "@/lib/data/products";
import { ProductCard } from "@/components/product/product-card";
import type { Product } from "@/types/domain";
import type { BlockRegistryEntry } from "@/lib/content/blocks/registry";

export const productGridPropsSchema = z.object({
  eyebrow: z.string().max(80).optional(),
  heading: z.string().max(200).optional(),
  body: z.string().max(500).optional(),
  ctaLabel: z.string().max(60).optional(),
  ctaHref: z.string().max(300).optional(),
  source: z.enum(["collection", "tag", "manual", "featured"]),
  collectionSlug: z.string().max(120).optional(),
  tagName: z.string().max(120).optional(),
  productIds: z.array(z.string().uuid()).max(12).optional(),
  limit: z.number().int().min(1).max(12).default(4),
  layout: z.enum(["grid", "bento"]).default("grid"),
  columns: z.enum(["2", "3", "4"]).default("3"),
});

export type ProductGridBlockProps = z.infer<typeof productGridPropsSchema>;

const columnClass: Record<string, string> = {
  "2": "grid-cols-1 sm:grid-cols-2",
  "3": "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
  "4": "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
};

async function fetchProducts(props: ProductGridBlockProps): Promise<Product[]> {
  const { source, collectionSlug, tagName, productIds, limit } = props;

  if (source === "featured") {
    const { docs } = await getFeaturedProducts(limit);
    return docs;
  }

  if (source === "collection" && collectionSlug) {
    const { docs } = await getProductsByCollection(collectionSlug, limit);
    return docs;
  }

  if (source === "tag" && tagName) {
    // Tags are filtered from the full product set; getProducts returns published products.
    // The tag filter is applied post-fetch for v1 (no dedicated tag query exists yet).
    const { docs } = await getProducts(200);
    return docs
      .filter((p) =>
        p.tags.some((t) => t.name.toLowerCase() === tagName.toLowerCase())
      )
      .slice(0, limit);
  }

  if (source === "manual" && productIds && productIds.length > 0) {
    // P3-02a / P4-03 REPAIR: productIds are product UUIDs. Resolve them by id
    // (preserving order) via getProductsByIds — not by slug.
    const docs = await getProductsByIds(productIds);
    return docs.slice(0, limit);
  }

  // Fallback: fetch featured products
  const { docs } = await getFeaturedProducts(limit);
  return docs;
}

async function ProductGridRenderer(props: Record<string, unknown>) {
  const p = props as ProductGridBlockProps;
  const products = await fetchProducts(p);
  const cols = columnClass[p.columns] ?? columnClass["3"];

  return (
    <section className="w-full px-6 py-12">
      {(p.eyebrow || p.heading || p.body) && (
        <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
          <div className="space-y-3">
            {p.eyebrow && (
              <p className="text-xs uppercase tracking-widest text-muted-foreground">
                {p.eyebrow}
              </p>
            )}
            {p.heading && (
              <h2 className="font-serif text-3xl text-foreground md:text-4xl">
                {p.heading}
              </h2>
            )}
            {p.body && (
              <p className="max-w-xl text-sm text-muted-foreground">{p.body}</p>
            )}
          </div>
          {p.ctaLabel && p.ctaHref && (
            <Link
              href={p.ctaHref}
              className="rounded-full border border-border px-6 py-2 text-sm text-foreground transition hover:bg-muted"
            >
              {p.ctaLabel}
            </Link>
          )}
        </div>
      )}

      {products.length === 0 ? (
        <div className="flex min-h-48 items-center justify-center rounded-2xl border border-border bg-muted text-sm text-muted-foreground">
          No products to display.
        </div>
      ) : (
        <div className={`grid gap-5 ${cols}`}>
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </section>
  );
}

export const productGridBlock: BlockRegistryEntry = {
  type: "product-grid",
  propsSchema: productGridPropsSchema,
  Renderer: ProductGridRenderer,
  editorMeta: {
    label: "Product Grid",
    icon: "grid-2x2",
    // maxPerPage omitted = unlimited
  },
};
