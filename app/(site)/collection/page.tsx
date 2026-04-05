import type { Metadata } from "next";
import Link from "next/link";
import { draftMode } from "next/headers";

import { ScrollReveal } from "@/components/animations/scroll-reveal";
import { ProductCard } from "@/components/product/product-card";
import { Button } from "@/components/ui/button";
import {
  getCollections,
  getGlobals,
  getProducts,
  getProductsByCollection,
} from "@/lib/data/products";
import type { Collection, Product } from "@/types/domain";
import type { CollectionPageContent } from "@/types/site-content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Collection",
  description:
    "Discover curated, authenticated pre-loved luxury sarees from private wardrobes, couture archives, and collector trunks.",
};

const ITEMS_PER_PAGE = 12;

type CollectionPageProps = {
  searchParams:
    | Promise<{ collection?: string | string[]; page?: string }>
    | { collection?: string | string[]; page?: string };
};

export default async function CollectionPage({ searchParams }: CollectionPageProps) {
  const { isEnabled: includeDrafts } = await draftMode();
  const resolvedSearchParams = await Promise.resolve(searchParams);
  const collectionQuery = resolvedSearchParams?.collection;
  const activeCollectionSlug = Array.isArray(collectionQuery)
    ? collectionQuery[0]
    : collectionQuery;
  const currentPage = Math.max(1, parseInt(resolvedSearchParams?.page ?? "1", 10));

  const [collectionPage, collectionsResult, productsResult] = await Promise.all([
    getGlobals("collectionPage", { includeDrafts }),
    getCollections({ includeDrafts }),
    activeCollectionSlug
      ? getProductsByCollection(activeCollectionSlug, ITEMS_PER_PAGE, { includeDrafts, page: currentPage })
      : getProducts(ITEMS_PER_PAGE, { includeDrafts, page: currentPage }),
  ]);

  const cms = collectionPage as CollectionPageContent | null;
  const items = (productsResult?.docs ?? []) as Product[];
  const collections = (collectionsResult?.docs ?? []) as Collection[];
  const activeCollection = collections.find(
    (collection) => collection.slug === activeCollectionSlug
  );

  const totalDocs = (productsResult as { totalDocs?: number })?.totalDocs ?? items.length;
  const totalPages = Math.ceil(totalDocs / ITEMS_PER_PAGE);
  const collectionCount = collections.length;
  const activeCollectionLabel = activeCollection?.name ?? "All collections";
  const filterDescription =
    activeCollection?.description ??
    cms?.filtersBody ??
    "Move through curated edits by story, mood, and provenance without losing your place in the catalog.";

  const buildPageUrl = (page: number) => {
    const params = new URLSearchParams();
    if (activeCollectionSlug) params.set("collection", activeCollectionSlug);
    if (page > 1) params.set("page", String(page));
    const qs = params.toString();
    return `/collection${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-8 sm:space-y-10 sm:px-6 sm:py-12 lg:space-y-12 lg:py-16">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.9fr)]">
        <ScrollReveal className="rounded-[2rem] border border-border/60 bg-[linear-gradient(135deg,rgba(255,250,244,0.98),rgba(246,238,228,0.92))] p-5 sm:p-8 shadow-soft">
          <div className="space-y-5">
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground">
                {cms?.eyebrow ?? "The Collection"}
              </p>
              <h1 className="font-serif text-2xl text-foreground sm:text-4xl md:text-5xl">
                {cms?.title ?? "Curated pre-loved sarees"}
              </h1>
              <p className="max-w-2xl text-sm leading-7 text-muted-foreground">
                {cms?.description ??
                  "Discover heirlooms from private wardrobes, couture archives, and collector trunks. Each piece is authenticated and accompanied by its story."}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              <div className="rounded-2xl border border-white/60 bg-white/70 p-4 backdrop-blur">
                <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
                  Live pieces
                </p>
                <p className="mt-3 font-serif text-3xl text-foreground">{totalDocs}</p>
              </div>
              <div className="rounded-2xl border border-white/60 bg-white/70 p-4 backdrop-blur">
                <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
                  Edits
                </p>
                <p className="mt-3 font-serif text-3xl text-foreground">{collectionCount}</p>
              </div>
              <div className="rounded-2xl border border-white/60 bg-white/70 p-4 backdrop-blur">
                <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
                  Current view
                </p>
                <p className="mt-3 text-sm font-medium text-foreground">{activeCollectionLabel}</p>
              </div>
            </div>
          </div>
        </ScrollReveal>

        <ScrollReveal delay={0.1} className="rounded-[2rem] border border-border/60 bg-card/80 p-4 sm:p-6 shadow-soft">
          <div className="flex h-full flex-col gap-5">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">
                Curated Filters
              </p>
              <h2 className="font-serif text-2xl text-foreground">
                {activeCollection?.name ?? cms?.filtersTitle ?? "Browse by collection"}
              </h2>
              <p className="text-sm leading-6 text-muted-foreground">{filterDescription}</p>
            </div>

            <div className="rounded-2xl border border-border/60 bg-background/70 p-4">
              <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
                Curation note
              </p>
              <p className="mt-3 text-sm leading-6 text-foreground">
                Every piece in this edit is authenticated, photographed in detail, and released in
                intentionally small drops.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/collection"
                className={`rounded-full border px-3 py-1 text-xs uppercase tracking-[0.2em] transition ${
                  !activeCollectionSlug
                    ? "border-trunk-gold/60 bg-trunk-gold/10 text-foreground"
                    : "border-border/70 bg-background/70 text-muted-foreground hover:text-foreground"
                }`}
              >
                All
              </Link>
              {collections.map((collection) => (
                <Link
                  key={collection.id}
                  href={`/collection?collection=${encodeURIComponent(collection.slug)}`}
                  className={`rounded-full border px-3 py-1 text-xs uppercase tracking-[0.2em] transition ${
                    activeCollectionSlug === collection.slug
                      ? "border-trunk-gold/60 bg-trunk-gold/10 text-foreground"
                      : "border-border/70 bg-background/70 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {collection.name}
                </Link>
              ))}
            </div>

            <p className="text-xs text-muted-foreground">
              Showing {items.length} of {totalDocs} curated piece{totalDocs === 1 ? "" : "s"}.
            </p>
          </div>
        </ScrollReveal>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/70 p-8 text-center">
          <p className="font-serif text-2xl text-foreground">
            The next curated drop is being prepared
          </p>
          <p className="mt-3 text-sm text-muted-foreground">
            Our team is authenticating fresh heirloom pieces right now. Return
            shortly or explore the featured collection in the meantime.
          </p>
          <Button asChild variant="outline" className="mt-6 rounded-full px-7">
            <Link href="/">View featured pieces</Link>
          </Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2.5 sm:gap-4 md:gap-6 lg:grid-cols-3">
            {items.map((product, index) => (
              <ScrollReveal key={product.id} delay={index * 0.05}>
                <ProductCard product={product} />
              </ScrollReveal>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <nav className="flex items-center justify-center gap-2" aria-label="Pagination">
              {currentPage > 1 && (
                <Button asChild variant="outline" size="sm" className="rounded-full">
                  <Link href={buildPageUrl(currentPage - 1)}>Previous</Link>
                </Button>
              )}
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                <Button
                  key={page}
                  asChild={page !== currentPage}
                  variant={page === currentPage ? "default" : "outline"}
                  size="sm"
                  className="h-9 w-9 rounded-full p-0"
                  disabled={page === currentPage}
                >
                  {page === currentPage ? (
                    <span>{page}</span>
                  ) : (
                    <Link href={buildPageUrl(page)}>{page}</Link>
                  )}
                </Button>
              ))}
              {currentPage < totalPages && (
                <Button asChild variant="outline" size="sm" className="rounded-full">
                  <Link href={buildPageUrl(currentPage + 1)}>Next</Link>
                </Button>
              )}
            </nav>
          )}
        </>
      )}
    </div>
  );
}
