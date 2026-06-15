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
} from "@/lib/data/products";
import {
  DEFAULT_PRODUCT_SORT,
  getProductSortLabel,
  parseProductSort,
  PRODUCT_SORT_OPTIONS,
  type ProductSortOption,
} from "@/lib/products/sort";
import { resolveMediaURL } from "@/lib/media/resolve-media-url";
import { searchProducts } from "@/lib/ports/catalog-search";
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
    | Promise<{
        collection?: string | string[];
        page?: string;
        sort?: string | string[];
        type?: string | string[];
        fabric?: string | string[];
        priceMin?: string;
        priceMax?: string;
        availability?: string;
        tags?: string | string[];
      }>
    | {
        collection?: string | string[];
        page?: string;
        sort?: string | string[];
        type?: string | string[];
        fabric?: string | string[];
        priceMin?: string;
        priceMax?: string;
        availability?: string;
        tags?: string | string[];
      };
};

/** Coerce string | string[] -> string | undefined */
const firstStr = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v;

/** Coerce string | string[] -> string[] */
const toArray = (v: string | string[] | undefined): string[] => {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
};

export default async function CollectionPage({ searchParams }: CollectionPageProps) {
  const { isEnabled: includeDrafts } = await draftMode();
  const resolvedSearchParams = await Promise.resolve(searchParams);

  const collectionQuery = resolvedSearchParams?.collection;
  const requestedCollectionSlug = firstStr(collectionQuery);
  const activeSort = parseProductSort(resolvedSearchParams?.sort);
  const currentPage = Math.max(1, parseInt(resolvedSearchParams?.page ?? "1", 10));

  // Catalog filters (P4-04)
  const activeType = firstStr(resolvedSearchParams?.type);
  const activeFabric = firstStr(resolvedSearchParams?.fabric);
  const activePriceMin = resolvedSearchParams?.priceMin
    ? parseInt(resolvedSearchParams.priceMin, 10)
    : undefined;
  const activePriceMax = resolvedSearchParams?.priceMax
    ? parseInt(resolvedSearchParams.priceMax, 10)
    : undefined;
  const activeAvailability = resolvedSearchParams?.availability === "true";
  const activeTags = toArray(resolvedSearchParams?.tags);

  // Determine if any catalog filter is active
  const hasFilters =
    !!activeType ||
    !!activeFabric ||
    typeof activePriceMin === "number" ||
    typeof activePriceMax === "number" ||
    activeAvailability ||
    activeTags.length > 0;

  const collectionPagePromise = getGlobals("collectionPage", { includeDrafts });
  const visibleCollectionsPromise = getCollections({
    includeDrafts,
    onlyWithProducts: true,
  });

  const [collectionPage, visibleCollectionsResult] = await Promise.all([
    collectionPagePromise,
    visibleCollectionsPromise,
  ]);

  const cms = collectionPage as CollectionPageContent | null;
  const collections = (visibleCollectionsResult?.docs ?? []) as Collection[];
  let activeCollection = collections.find(
    (c) => c.slug === requestedCollectionSlug
  );
  // A requested collection may have members only via the manual
  // (collection_products) or smart (rules) path, which the onlyWithProducts
  // visibility query (legacy products.collectionId only) misses. Resolve the
  // requested slug directly so a direct link shows THAT collection — the listing
  // below uses getProductsByCollection, which resolves the manual+smart+legacy
  // union — instead of falling through to the all-products listing.
  if (requestedCollectionSlug && !activeCollection) {
    const { getCollectionBySlug } = await import("@/db/queries/collections");
    const resolved = await getCollectionBySlug(requestedCollectionSlug);
    if (resolved) activeCollection = resolved as unknown as Collection;
  }
  const activeCollectionSlug = activeCollection?.slug;

  // Use searchProducts when catalog filters are active, otherwise fall back
  // to the collection-aware listing path.
  let items: Product[] = [];
  let totalDocs = 0;
  let facets = { fabric: {} as Record<string, number>, type: {} as Record<string, number>, availability: {} as Record<string, number>, tags: {} as Record<string, number> };

  if (hasFilters) {
    // P4-04: filtered search via catalog-search port
    const result = await searchProducts({
      type: activeType,
      fabric: activeFabric,
      priceMin: activePriceMin,
      priceMax: activePriceMax,
      availability: activeAvailability || undefined,
      tags: activeTags.length > 0 ? activeTags : undefined,
    });

    // Apply sort + pagination in-memory (same pattern as getProductsByCollection)
    const sorted = sortProductsInMemory(result.products as unknown as Product[], activeSort);
    totalDocs = sorted.length;
    const offset = (currentPage - 1) * ITEMS_PER_PAGE;
    items = sorted.slice(offset, offset + ITEMS_PER_PAGE);
    facets = result.facets;
  } else if (activeCollectionSlug) {
    // Collection-filtered view (no catalog filters)
    const { getProductsByCollection } = await import("@/lib/data/products");
    const page = currentPage;
    const offset = (page - 1) * ITEMS_PER_PAGE;
    const result = await getProductsByCollection(activeCollectionSlug, ITEMS_PER_PAGE, {
      includeDrafts,
      page,
      sort: activeSort,
    });
    items = (result?.docs ?? []) as Product[];
    totalDocs = (result as { totalDocs?: number })?.totalDocs ?? items.length;
    // Get facets for the sidebar (no filter active — full catalog counts)
    const facetResult = await searchProducts({});
    facets = facetResult.facets;
  } else {
    // No filters + no collection — all published products
    const { getProducts } = await import("@/lib/data/products");
    const result = await getProducts(ITEMS_PER_PAGE, {
      includeDrafts,
      page: currentPage,
      sort: activeSort,
    });
    items = (result?.docs ?? []) as Product[];
    totalDocs = (result as { totalDocs?: number })?.totalDocs ?? items.length;
    // Get facets for the sidebar
    const facetResult = await searchProducts({});
    facets = facetResult.facets;
  }

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

  const buildUrl = ({
    collectionSlug = activeCollectionSlug,
    page,
    sort = activeSort,
    type = activeType,
    fabric = activeFabric,
    priceMin = activePriceMin,
    priceMax = activePriceMax,
    availability = activeAvailability,
    tags = activeTags,
  }: {
    collectionSlug?: string;
    page?: number;
    sort?: ProductSortOption;
    type?: string;
    fabric?: string;
    priceMin?: number;
    priceMax?: number;
    availability?: boolean;
    tags?: string[];
  }) => {
    const params = new URLSearchParams();
    if (collectionSlug) params.set("collection", collectionSlug);
    if (sort !== DEFAULT_PRODUCT_SORT) params.set("sort", sort);
    if (page && page > 1) params.set("page", String(page));
    if (type) params.set("type", type);
    if (fabric) params.set("fabric", fabric);
    if (typeof priceMin === "number") params.set("priceMin", String(priceMin));
    if (typeof priceMax === "number") params.set("priceMax", String(priceMax));
    if (availability) params.set("availability", "true");
    for (const tag of tags ?? []) params.append("tags", tag);
    const qs = params.toString();
    return `/collection${qs ? `?${qs}` : ""}`;
  };

  const buildCollectionUrl = ({
    collectionSlug = activeCollectionSlug,
    page,
    sort = activeSort,
  }: {
    collectionSlug?: string;
    page?: number;
    sort?: ProductSortOption;
  }) => buildUrl({ collectionSlug, page, sort });

  const hasAnyFilter =
    !!activeCollectionSlug || hasFilters || activeSort !== DEFAULT_PRODUCT_SORT;

  // Fabric options from facets
  const fabricOptions = Object.entries(facets.fabric).filter(([k]) => k);
  // Tag options from facets
  const tagOptions = Object.entries(facets.tags).filter(([k]) => k);
  // Availability count
  const availableCount = facets.availability["available"] ?? 0;

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

        {/* Filter panel */}
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

            {/* Reset link */}
            {hasAnyFilter ? (
              <div className="flex justify-end">
                <Link
                  href="/collection"
                  className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                >
                  Reset all filters
                </Link>
              </div>
            ) : null}

            {/* Edit / collection filter */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
                  Edit
                </p>
              </div>
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                <Link
                  href={buildUrl({ collectionSlug: undefined })}
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
                    href={buildUrl({ collectionSlug: collection.slug })}
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

            {/* Fabric filter (from facets) */}
            {fabricOptions.length > 0 ? (
              <div className="space-y-3">
                <p className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
                  Fabric
                </p>
                <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                  {activeFabric ? (
                    <Link
                      href={buildUrl({ fabric: undefined, page: 1 })}
                      className="shrink-0 rounded-full border border-trunk-gold/60 bg-trunk-gold/15 px-3 py-1 text-xs uppercase tracking-[0.18em] text-foreground shadow-sm transition"
                    >
                      {activeFabric} ×
                    </Link>
                  ) : null}
                  {fabricOptions.map(([fab, count]) => (
                    <Link
                      key={fab}
                      href={buildUrl({ fabric: activeFabric === fab ? undefined : fab, page: 1 })}
                      className={cn(
                        "shrink-0 rounded-full border px-3 py-1 text-xs uppercase tracking-[0.18em] transition",
                        activeFabric === fab
                          ? "border-trunk-gold/60 bg-trunk-gold/15 text-foreground shadow-sm"
                          : "border-border/70 bg-background/70 text-muted-foreground hover:border-trunk-gold/40 hover:text-foreground",
                      )}
                    >
                      {fab}
                      <span className="ml-1 opacity-60">({count})</span>
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Price range filter */}
            <div className="space-y-3">
              <p className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
                Price range
              </p>
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                {[
                  { label: "Under ₹5k", min: undefined, max: 500000 },
                  { label: "₹5k – ₹15k", min: 500000, max: 1500000 },
                  { label: "₹15k – ₹50k", min: 1500000, max: 5000000 },
                  { label: "₹50k+", min: 5000000, max: undefined },
                ].map((range) => {
                  const active =
                    activePriceMin === range.min && activePriceMax === range.max;
                  return (
                    <Link
                      key={range.label}
                      href={buildUrl({
                        priceMin: active ? undefined : range.min,
                        priceMax: active ? undefined : range.max,
                        page: 1,
                      })}
                      className={cn(
                        "shrink-0 rounded-full border px-3 py-1 text-xs uppercase tracking-[0.18em] transition",
                        active
                          ? "border-trunk-gold/60 bg-trunk-gold/15 text-foreground shadow-sm"
                          : "border-border/70 bg-background/70 text-muted-foreground hover:border-trunk-gold/40 hover:text-foreground",
                      )}
                    >
                      {range.label}
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* Availability filter */}
            <div className="space-y-3">
              <p className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
                Availability
              </p>
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                <Link
                  href={buildUrl({ availability: !activeAvailability, page: 1 })}
                  className={cn(
                    "shrink-0 rounded-full border px-3 py-1 text-xs uppercase tracking-[0.18em] transition",
                    activeAvailability
                      ? "border-trunk-gold/60 bg-trunk-gold/15 text-foreground shadow-sm"
                      : "border-border/70 bg-background/70 text-muted-foreground hover:border-trunk-gold/40 hover:text-foreground",
                  )}
                >
                  In stock
                  {availableCount > 0 ? (
                    <span className="ml-1 opacity-60">({availableCount})</span>
                  ) : null}
                </Link>
              </div>
            </div>

            {/* Tags filter (from facets) */}
            {tagOptions.length > 0 ? (
              <div className="space-y-3">
                <p className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
                  Tags
                </p>
                <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                  {tagOptions.map(([tagSlug, count]) => {
                    const isActive = activeTags.includes(tagSlug);
                    const nextTags = isActive
                      ? activeTags.filter((t) => t !== tagSlug)
                      : [...activeTags, tagSlug];
                    return (
                      <Link
                        key={tagSlug}
                        href={buildUrl({ tags: nextTags, page: 1 })}
                        className={cn(
                          "shrink-0 rounded-full border px-3 py-1 text-xs uppercase tracking-[0.18em] transition",
                          isActive
                            ? "border-trunk-gold/60 bg-trunk-gold/15 text-foreground shadow-sm"
                            : "border-border/70 bg-background/70 text-muted-foreground hover:border-trunk-gold/40 hover:text-foreground",
                        )}
                      >
                        {tagSlug}
                        <span className="ml-1 opacity-60">({count})</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {/* Sort */}
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
                    href={buildUrl({ page: 1, sort: option.value })}
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
                  <Link href={buildUrl({ page: currentPage - 1 })}>Previous</Link>
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
                    <Link href={buildUrl({ page })}>{page}</Link>
                  )}
                </Button>
              ))}
              {currentPage < totalPages && (
                <Button asChild variant="outline" size="sm" className="rounded-full">
                  <Link href={buildUrl({ page: currentPage + 1 })}>Next</Link>
                </Button>
              )}
            </nav>
          )}
        </>
      )}
    </div>
  );
}

// ── In-memory sort (mirrors getProductsByCollection's sort logic) ──────────────

function sortProductsInMemory<T extends { pricePaise: number; createdAt: unknown }>(
  rows: T[],
  sort: ProductSortOption
): T[] {
  const createdAtMs = (r: T) => {
    const v = r.createdAt;
    return v instanceof Date ? v.getTime() : Number(v ?? 0);
  };
  const byCreatedDesc = (a: T, b: T) => createdAtMs(b) - createdAtMs(a);
  const copy = [...rows];
  switch (sort) {
    case "price-low-to-high":
      return copy.sort((a, b) => a.pricePaise - b.pricePaise || byCreatedDesc(a, b));
    case "price-high-to-low":
      return copy.sort((a, b) => b.pricePaise - a.pricePaise || byCreatedDesc(a, b));
    default:
      return copy.sort(byCreatedDesc);
  }
}
