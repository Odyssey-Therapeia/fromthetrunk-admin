import type { Metadata } from "next";
import Image from "next/image";
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
import {
  DEFAULT_PRODUCT_SORT,
  getProductSortLabel,
  parseProductSort,
  PRODUCT_SORT_OPTIONS,
  type ProductSortOption,
} from "@/lib/products/sort";
import { resolveMediaURL } from "@/lib/media/resolve-media-url";
import type { Collection, Product } from "@/types/domain";
import type { CollectionPageContent } from "@/types/site-content";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Collection",
  description:
    "Discover curated, authenticated pre-loved luxury sarees from private wardrobes, couture archives, and collector trunks.",
};

const ITEMS_PER_PAGE = 12;

const shortSortLabels: Record<ProductSortOption, string> = {
  latest: "Newest",
  "price-low-to-high": "Low to High",
  "price-high-to-low": "High to Low",
};

type CollectionPageProps = {
  searchParams:
    | Promise<{ collection?: string | string[]; page?: string; sort?: string | string[] }>
    | { collection?: string | string[]; page?: string; sort?: string | string[] };
};

export default async function CollectionPage({ searchParams }: CollectionPageProps) {
  const { isEnabled: includeDrafts } = await draftMode();
  const resolvedSearchParams = await Promise.resolve(searchParams);
  const collectionQuery = resolvedSearchParams?.collection;
  const requestedCollectionSlug = Array.isArray(collectionQuery)
    ? collectionQuery[0]
    : collectionQuery;
  const activeSort = parseProductSort(resolvedSearchParams?.sort);
  const currentPage = Math.max(1, parseInt(resolvedSearchParams?.page ?? "1", 10));

  const collectionPagePromise = getGlobals("collectionPage", { includeDrafts });
  const visibleCollectionsPromise = getCollections({
    includeDrafts,
    onlyWithProducts: true,
  });
  const allCollectionsPromise = requestedCollectionSlug
    ? getCollections({ includeDrafts })
    : visibleCollectionsPromise;
  const defaultProductsPromise = requestedCollectionSlug
    ? null
    : getProducts(ITEMS_PER_PAGE, {
        includeDrafts,
        page: currentPage,
        sort: activeSort,
      });
  const [
    collectionPage,
    visibleCollectionsResult,
    allCollectionsResult,
    defaultProductsResult,
  ] = await Promise.all([
    collectionPagePromise,
    visibleCollectionsPromise,
    allCollectionsPromise,
    defaultProductsPromise,
  ]);

  const cms = collectionPage as CollectionPageContent | null;
  const collections = (visibleCollectionsResult?.docs ?? []) as Collection[];
  const allCollections = (allCollectionsResult?.docs ?? []) as Collection[];
  const activeCollection = allCollections.find(
    (collection) => collection.slug === requestedCollectionSlug
  );
  const activeCollectionSlug = activeCollection?.slug;
  const productsResult = activeCollectionSlug
    ? await getProductsByCollection(activeCollectionSlug, ITEMS_PER_PAGE, {
        includeDrafts,
        page: currentPage,
        sort: activeSort,
      })
    : defaultProductsResult ??
      (await getProducts(ITEMS_PER_PAGE, {
        includeDrafts,
        page: currentPage,
        sort: activeSort,
      }));
  const items = (productsResult?.docs ?? []) as Product[];

  const totalDocs = (productsResult as { totalDocs?: number })?.totalDocs ?? items.length;
  const totalPages = Math.ceil(totalDocs / ITEMS_PER_PAGE);
  const collectionCount = collections.length;
  const activeCollectionLabel = activeCollection?.name ?? "All collections";
  const activeSortLabel = getProductSortLabel(activeSort);
  const filterDescription =
    activeCollection?.description ??
    cms?.filtersBody ??
    "Choose an edit, then sort the drop.";
  const previewImages = items
    .map((product) => ({
      name: product.name,
      src: resolveMediaURL(product.images?.[0]),
    }))
    .filter((item): item is { name: string; src: string } => Boolean(item.src))
    .slice(0, 3);
  const heroPreviewImage = previewImages[0]?.src ?? "/media/home-cover.png";

  const buildCollectionUrl = ({
    collectionSlug = activeCollectionSlug,
    page,
    sort = activeSort,
  }: {
    collectionSlug?: string;
    page?: number;
    sort?: ProductSortOption;
  }) => {
    const params = new URLSearchParams();
    if (collectionSlug) params.set("collection", collectionSlug);
    if (sort !== DEFAULT_PRODUCT_SORT) params.set("sort", sort);
    if (page && page > 1) params.set("page", String(page));
    const qs = params.toString();
    return `/collection${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 sm:space-y-7 sm:px-6 sm:py-9 lg:space-y-4 lg:py-6">
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)] lg:items-start">
        <div className="relative isolate min-h-[430px] overflow-hidden rounded-[1.75rem] border border-border/60 bg-trunk-brown shadow-soft sm:min-h-[400px] lg:min-h-[320px]">
          <Image
            src={heroPreviewImage}
            alt={previewImages[0]?.name ?? "Sunlit garden saree curation"}
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 60vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-foreground/90 via-foreground/70 to-foreground/35 lg:bg-gradient-to-r" />
          <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/50 to-transparent" />

          <div className="relative flex min-h-[430px] flex-col justify-between gap-8 p-5 text-white sm:min-h-[400px] sm:p-8 lg:min-h-[320px] lg:p-7">
            <div className="max-w-2xl space-y-4 lg:space-y-3">
              <p className="text-xs uppercase tracking-[0.32em] text-primary-foreground/75 sm:tracking-[0.46em]">
                {cms?.eyebrow ?? "The Collection"}
              </p>
              <h1 className="max-w-[14ch] text-balance font-serif text-3xl leading-[1.08] text-white sm:max-w-3xl sm:text-5xl">
                {cms?.title ?? "Curated pre-loved sarees"}
              </h1>
              <p className="max-w-[30ch] text-pretty text-sm leading-6 text-primary-foreground/85 sm:max-w-xl sm:text-base lg:leading-6">
                {cms?.description ??
                  "Discover heirlooms from private wardrobes, couture archives, and collector trunks. Each piece is authenticated and accompanied by its story."}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:max-w-xl sm:grid-cols-3 sm:gap-3">
              <div className="rounded-2xl border border-white/20 bg-white/14 p-3 backdrop-blur-md sm:p-4 lg:p-3">
                <p className="text-[10px] uppercase tracking-[0.18em] text-primary-foreground/65 sm:tracking-[0.24em]">
                  Live pieces
                </p>
                <p className="mt-2 font-serif text-3xl text-white">{totalDocs}</p>
              </div>
              <div className="rounded-2xl border border-white/20 bg-white/14 p-3 backdrop-blur-md sm:p-4 lg:p-3">
                <p className="text-[10px] uppercase tracking-[0.18em] text-primary-foreground/65 sm:tracking-[0.24em]">
                  Edits
                </p>
                <p className="mt-2 font-serif text-3xl text-white">{collectionCount}</p>
              </div>
              <div className="col-span-2 rounded-2xl border border-white/20 bg-white/14 p-3 backdrop-blur-md sm:col-span-1 sm:p-4 lg:p-3">
                <p className="text-[10px] uppercase tracking-[0.18em] text-primary-foreground/65 sm:tracking-[0.24em]">
                  View
                </p>
                <p className="mt-2 line-clamp-2 text-sm font-medium text-white">
                  {activeCollectionLabel}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-[1.5rem] border border-border/60 bg-card/92 p-4 shadow-soft backdrop-blur">
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-[0.32em] text-muted-foreground">
                  Filters
                </p>
                <h2 className="mt-1 truncate font-serif text-2xl text-foreground">
                  {activeCollection?.name ?? cms?.filtersTitle ?? "All collections"}
                </h2>
              </div>
              <div className="rounded-full border border-border/70 bg-background/75 px-3 py-1 text-xs text-muted-foreground">
                {items.length}/{totalDocs}
              </div>
            </div>

            <p className="line-clamp-2 text-sm leading-5 text-muted-foreground">
              {filterDescription}
            </p>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
                  Edit
                </p>
                {activeCollectionSlug || activeSort !== DEFAULT_PRODUCT_SORT ? (
                  <Link
                    href="/collection"
                    className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                  >
                    Reset
                  </Link>
                ) : null}
              </div>
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                <Link
                  href={buildCollectionUrl({ collectionSlug: undefined })}
                  className={cn(
                    "shrink-0 rounded-full border px-3 py-1 text-xs uppercase tracking-[0.18em] transition",
                    !activeCollectionSlug
                      ? "border-trunk-gold/60 bg-trunk-gold/15 text-foreground shadow-sm"
                      : "border-border/70 bg-background/70 text-muted-foreground hover:border-trunk-gold/40 hover:text-foreground",
                  )}
                >
                  All
                </Link>
                {collections.map((collection) => (
                  <Link
                    key={collection.id}
                    href={buildCollectionUrl({ collectionSlug: collection.slug })}
                    className={cn(
                      "shrink-0 rounded-full border px-3 py-1 text-xs uppercase tracking-[0.18em] transition",
                      activeCollectionSlug === collection.slug
                        ? "border-trunk-gold/60 bg-trunk-gold/15 text-foreground shadow-sm"
                        : "border-border/70 bg-background/70 text-muted-foreground hover:border-trunk-gold/40 hover:text-foreground",
                    )}
                  >
                    {collection.name}
                  </Link>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
                  Sort
                </p>
                <p className="text-xs text-muted-foreground">
                  {shortSortLabels[activeSort]}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {PRODUCT_SORT_OPTIONS.map((option) => (
                  <Link
                    key={option.value}
                    href={buildCollectionUrl({ page: 1, sort: option.value })}
                    className={cn(
                      "flex items-center gap-2 rounded-full border px-3 py-1 text-xs uppercase tracking-[0.14em] transition",
                      activeSort === option.value
                        ? "border-trunk-gold/60 bg-trunk-gold/15 text-foreground shadow-sm"
                        : "border-border/70 bg-background/70 text-muted-foreground hover:border-trunk-gold/40 hover:text-foreground",
                    )}
                  >
                    <span>{shortSortLabels[option.value]}</span>
                    {activeSort === option.value ? (
                      <span className="h-2 w-2 rounded-full bg-trunk-gold" />
                    ) : null}
                  </Link>
                ))}
              </div>
            </div>

            <p className="rounded-xl bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
              {activeCollectionLabel}, {activeSortLabel}
            </p>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-3 border-y border-border/60 py-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">
            Current edit
          </p>
          <h2 className="mt-1 font-serif text-2xl text-foreground">{activeCollectionLabel}</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          {items.length} visible now, {totalDocs} total in this view
        </p>
      </section>

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
                  <Link href={buildCollectionUrl({ page: currentPage - 1 })}>Previous</Link>
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
                    <Link href={buildCollectionUrl({ page })}>{page}</Link>
                  )}
                </Button>
              ))}
              {currentPage < totalPages && (
                <Button asChild variant="outline" size="sm" className="rounded-full">
                  <Link href={buildCollectionUrl({ page: currentPage + 1 })}>Next</Link>
                </Button>
              )}
            </nav>
          )}
        </>
      )}
    </div>
  );
}
