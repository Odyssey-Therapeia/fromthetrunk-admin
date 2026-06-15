/**
 * P4-03: Public collection detail page — /collections/[slug]
 *
 * Renders products in a collection using the product-grid pattern.
 * Uses getCollectionBySlug + getProductsByCollection from the data layer.
 * P4-03 REPAIR: getProductsByCollection now resolves the UNION of manual
 * (collection_products) + smart (evaluateRules) + legacy (collection_id)
 * members via getCollectionProductIds -> getProductsByIds.
 *
 * Route: /collections/[slug]
 * Note: /collection/[slug] is the product detail page (product slug).
 *       This route uses /collections (plural) to avoid collision.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";

import { ProductCard } from "@/components/product/product-card";
import { getCollectionBySlug } from "@/db/queries/collections";
import { getProductsByCollection } from "@/lib/data/products";
import type { Product } from "@/types/domain";

export const dynamic = "force-dynamic";

interface CollectionDetailPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: CollectionDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const collection = await getCollectionBySlug(slug);

  if (!collection) {
    return { title: "Collection Not Found" };
  }

  return {
    title: collection.name,
    description:
      collection.description ??
      `Discover curated pieces in the ${collection.name} collection.`,
  };
}

export default async function CollectionDetailPage({
  params,
}: CollectionDetailPageProps) {
  const { slug } = await params;
  const collection = await getCollectionBySlug(slug);

  if (!collection) {
    notFound();
  }

  const { docs: products } = await getProductsByCollection(slug);

  return (
    <main className="min-h-screen">
      {/* Header */}
      <section className="px-6 py-12 md:py-16">
        <div className="mx-auto max-w-6xl">
          <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">
            Collection
          </p>
          <h1 className="mt-3 font-serif text-4xl text-foreground md:text-5xl">
            {collection.name}
          </h1>
          {collection.description ? (
            <p className="mt-4 max-w-xl text-sm text-muted-foreground">
              {collection.description}
            </p>
          ) : null}
        </div>
      </section>

      {/* Products */}
      <section className="px-6 pb-16">
        <div className="mx-auto max-w-6xl">
          {products.length === 0 ? (
            <div className="flex min-h-48 items-center justify-center rounded-2xl border border-border bg-muted">
              <p className="text-sm text-muted-foreground">
                No products in this collection yet.
              </p>
            </div>
          ) : (
            <>
              <p className="mb-6 text-sm text-muted-foreground">
                {products.length} piece{products.length === 1 ? "" : "s"}
              </p>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {(products as Product[]).map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      {/* Back link */}
      <div className="px-6 pb-12">
        <div className="mx-auto max-w-6xl">
          <Link
            href="/collection"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            Browse all collections
          </Link>
        </div>
      </div>
    </main>
  );
}
