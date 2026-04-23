"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  CheckSquare,
  ImageOff,
  Package,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ProductsGrid } from "@/components/admin/products/products-grid";
import {
  ProductsToolbar,
  type AdminProductSort,
  type ImageFilter,
} from "@/components/admin/products/products-toolbar";
import type { ProductViewMode } from "@/components/admin/products/types";
import { Skeleton } from "@/components/ui/skeleton";
import { useProducts, type ProductListItem } from "@/lib/hooks/use-products";
import { DEFAULT_PRODUCT_SORT } from "@/lib/products/sort";
import { cn } from "@/lib/utils";

/** Escape a CSV cell per RFC 4180 so commas, quotes, and newlines don't corrupt columns. */
const escapeCsvCell = (value: unknown): string => {
  const str = value == null ? "" : String(value);
  return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
};

const readApiErrorMessage = async (response: Response, fallback: string) => {
  try {
    const data = (await response.json()) as { message?: string };
    return typeof data.message === "string" && data.message.length > 0
      ? data.message
      : fallback;
  } catch {
    return fallback;
  }
};

const deleteProductById = async (id: string) => {
  const response = await fetch(`/api/v2/products/${id}`, { method: "DELETE" });
  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, "Failed to delete product."));
  }
};

const toCreatedAtTime = (product: ProductListItem) => {
  if (!product.createdAt) return 0;
  const time = new Date(product.createdAt).getTime();
  return Number.isNaN(time) ? 0 : time;
};

const sortProducts = (
  products: ProductListItem[],
  sort: AdminProductSort,
): ProductListItem[] => {
  const next = [...products];

  switch (sort) {
    case "price-low-to-high":
      return next.sort((a, b) => a.pricePaise - b.pricePaise);
    case "price-high-to-low":
      return next.sort((a, b) => b.pricePaise - a.pricePaise);
    case "name-a-z":
      return next.sort((a, b) => a.name.localeCompare(b.name));
    case "images-high-to-low":
      return next.sort((a, b) => (b.imageCount ?? 0) - (a.imageCount ?? 0));
    case "missing-cover-first":
      return next.sort((a, b) => {
        const aMissing = a.thumbnailUrl ? 1 : 0;
        const bMissing = b.thumbnailUrl ? 1 : 0;
        return aMissing - bMissing || a.name.localeCompare(b.name);
      });
    default:
      return next.sort((a, b) => toCreatedAtTime(b) - toCreatedAtTime(a));
  }
};

function StatPill({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Package;
  label: string;
  value: number;
}) {
  return (
    <div className="flex min-w-[132px] items-center gap-3 rounded-xl border border-border/70 bg-background/70 px-3 py-2 shadow-sm">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-lg font-semibold leading-none">{value}</p>
        <p className="mt-1 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          {label}
        </p>
      </div>
    </div>
  );
}

export default function AdminProductsPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [stockStatus, setStockStatus] = useState("all");
  const [imageFilter, setImageFilter] = useState<ImageFilter>("all");
  const [sort, setSort] = useState<AdminProductSort>(DEFAULT_PRODUCT_SORT);
  const [viewMode, setViewMode] = useState<ProductViewMode>("cards");
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(
    () => new Set(),
  );
  const queryClient = useQueryClient();

  // Guard against duplicate click-throughs
  const duplicatingRef = useRef<Set<string>>(new Set());

  const { data: products, isLoading, refetch } = useProducts({
    search,
    status,
    stockStatus,
  });

  const baseProducts = useMemo(() => products ?? [], [products]);
  const imageFilteredProducts = useMemo(() => {
    if (imageFilter === "with-images") {
      return baseProducts.filter((product) => product.imageCount > 0);
    }
    if (imageFilter === "missing-cover") {
      return baseProducts.filter((product) => !product.thumbnailUrl);
    }
    return baseProducts;
  }, [baseProducts, imageFilter]);
  const visibleProducts = useMemo(
    () => sortProducts(imageFilteredProducts, sort),
    [imageFilteredProducts, sort],
  );
  const stats = useMemo(
    () => ({
      drafts: baseProducts.filter((product) => product.status === "draft").length,
      missingCover: baseProducts.filter((product) => !product.thumbnailUrl).length,
      published: baseProducts.filter((product) => product.status === "published").length,
      total: baseProducts.length,
    }),
    [baseProducts],
  );
  const visibleProductIds = useMemo(
    () => new Set(visibleProducts.map((product) => product.id)),
    [visibleProducts],
  );
  const selectedCount = selectedProductIds.size;
  const allVisibleSelected =
    visibleProducts.length > 0 &&
    visibleProducts.every((product) => selectedProductIds.has(product.id));

  useEffect(() => {
    setSelectedProductIds((current) => {
      const next = new Set(
        Array.from(current).filter((id) => visibleProductIds.has(id)),
      );
      return next.size === current.size ? current : next;
    });
  }, [visibleProductIds]);

  const removeProductsFromCurrentCache = useCallback(
    (ids: string[]) => {
      const idsToRemove = new Set(ids);
      const queryKey = ["admin", "products", { search, status, stockStatus }];
      queryClient.setQueryData<ProductListItem[]>(queryKey, (old) =>
        old ? old.filter((product) => !idsToRemove.has(product.id)) : old,
      );
    },
    [queryClient, search, status, stockStatus],
  );

  const clearSelection = useCallback(() => {
    setSelectedProductIds(new Set());
  }, []);

  const handleSelectionChange = useCallback((id: string, selected: boolean) => {
    setSelectedProductIds((current) => {
      const next = new Set(current);
      if (selected) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }, []);

  const handleSelectAllVisible = useCallback(() => {
    setSelectedProductIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) {
        for (const product of visibleProducts) {
          next.delete(product.id);
        }
      } else {
        for (const product of visibleProducts) {
          next.add(product.id);
        }
      }
      return next;
    });
  }, [allVisibleSelected, visibleProducts]);

  const handleDuplicate = useCallback(
    async (id: string) => {
      // Prevent multiple simultaneous duplicates of the same product
      if (duplicatingRef.current.has(id)) return;
      duplicatingRef.current.add(id);

      try {
        const res = await fetch(`/api/v2/products/${id}/duplicate`, {
          method: "POST",
        });
        if (!res.ok) throw new Error("Failed to duplicate");
        toast.success("Product duplicated");
        void refetch();
      } catch {
        toast.error("Failed to duplicate product");
      } finally {
        duplicatingRef.current.delete(id);
      }
    },
    [refetch],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      const productName = visibleProducts.find((product) => product.id === id)?.name;
      if (!confirm(`Delete ${productName ?? "this product"}?`)) return;

      // Optimistic removal -- remove from cache immediately
      removeProductsFromCurrentCache([id]);
      setSelectedProductIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });

      try {
        await deleteProductById(id);
        toast.success("Product deleted");
        // Invalidate all product list variants so other filters stay in sync.
        void queryClient.invalidateQueries({
          queryKey: ["admin", "products"],
          exact: false,
        });
      } catch {
        // Revert on failure
        toast.error("Failed to delete product");
        void refetch();
      }
    },
    [refetch, queryClient, removeProductsFromCurrentCache, visibleProducts],
  );

  const handleBulkDelete = useCallback(
    async () => {
      if (selectedProductIds.size === 0) return;

      const ids = Array.from(selectedProductIds);
      const selectedProducts = visibleProducts.filter((product) =>
        selectedProductIds.has(product.id),
      );
      const confirmMessage =
        ids.length === 1
          ? `Delete ${selectedProducts[0]?.name ?? "this product"}?`
          : `Delete ${ids.length} selected products?`;

      if (!confirm(confirmMessage)) return;

      setIsBulkDeleting(true);
      removeProductsFromCurrentCache(ids);
      setSelectedProductIds(new Set());

      const results = await Promise.allSettled(ids.map((id) => deleteProductById(id)));
      const failed = results.filter((result) => result.status === "rejected").length;
      const deletedCount = ids.length - failed;

      if (failed > 0) {
        toast.error(
          failed === ids.length
            ? "Failed to delete selected products."
            : `Deleted ${deletedCount}; ${failed} failed.`,
        );
        void refetch();
      } else {
        toast.success(
          deletedCount === 1
            ? "Product deleted."
            : `${deletedCount} products deleted.`,
        );
      }

      void queryClient.invalidateQueries({
        queryKey: ["admin", "products"],
        exact: false,
      });
      setIsBulkDeleting(false);
    },
    [
      queryClient,
      refetch,
      removeProductsFromCurrentCache,
      selectedProductIds,
      visibleProducts,
    ],
  );

  const handleExport = useCallback(async () => {
    try {
      const res = await fetch("/api/v2/products?includeDrafts=true&limit=1000");
      if (!res.ok) throw new Error("Failed to fetch products");
      const data = await res.json();

      const headers = ["Name", "Slug", "Price (Paise)", "Status", "Stock Status", "Fabric", "Story Title"];
      const rows = data.map((p: Record<string, unknown>) =>
        [
          p.name,
          p.slug,
          p.pricePaise,
          p.status,
          p.stockStatus,
          p.detailsFabric ?? "",
          p.storyTitle,
        ]
          .map(escapeCsvCell)
          .join(","),
      );
      const csv = [headers.map(escapeCsvCell).join(","), ...rows].join("\n");

      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "ftt-products-export.csv";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Products exported");
    } catch {
      toast.error("Export failed");
    }
  }, []);

  return (
    <div className="@container space-y-5">
      <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/80 shadow-sm">
        <div className="flex flex-col gap-5 p-5 @5xl:flex-row @5xl:items-end @5xl:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">
              Catalog
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">Products</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Manage your saree catalog.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 @3xl:grid-cols-4">
            <StatPill icon={Package} label="Shown" value={visibleProducts.length} />
            <StatPill icon={CheckCircle2} label="Live" value={stats.published} />
            <StatPill icon={Sparkles} label="Draft" value={stats.drafts} />
            <StatPill icon={ImageOff} label="No Cover" value={stats.missingCover} />
          </div>
        </div>
      </div>

      <ProductsToolbar
        imageFilter={imageFilter}
        onImageFilterChange={setImageFilter}
        search={search}
        onSearchChange={setSearch}
        sort={sort}
        onSortChange={setSort}
        status={status}
        onStatusChange={setStatus}
        stockStatus={stockStatus}
        onStockStatusChange={setStockStatus}
        onExport={handleExport}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />

      {visibleProducts.length > 0 ? (
        <div
          className={cn(
            "sticky top-20 z-20 flex flex-wrap items-center gap-3 rounded-xl border border-border/70 bg-card/90 p-3 shadow-sm backdrop-blur transition-all",
            selectedCount > 0 && "border-primary/30 bg-primary/5 shadow-md",
          )}
        >
          <Button
            onClick={handleSelectAllVisible}
            size="sm"
            type="button"
            variant="outline"
            className="gap-1.5 rounded-lg"
          >
            <CheckSquare className="h-3.5 w-3.5" />
            {allVisibleSelected ? "Clear shown" : "Select shown"}
          </Button>
          <p className="text-sm text-muted-foreground">
            {selectedCount} selected · {visibleProducts.length} shown
          </p>
          {selectedCount > 0 ? (
            <div className="ml-auto flex items-center gap-2">
              <Button
                onClick={clearSelection}
                size="sm"
                type="button"
                variant="ghost"
                className="gap-1.5 rounded-lg"
              >
                <X className="h-3.5 w-3.5" />
                Clear
              </Button>
              <Button
                disabled={isBulkDeleting}
                onClick={() => void handleBulkDelete()}
                size="sm"
                type="button"
                variant="destructive"
                className="gap-1.5 rounded-lg"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {isBulkDeleting ? "Deleting..." : "Delete selected"}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {isLoading ? (
        <div
          className={cn(
            "grid",
            viewMode === "gallery" && "grid-cols-1 gap-5 md:grid-cols-2 2xl:grid-cols-3",
            viewMode === "cards" && "grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4",
            viewMode === "compact" && "grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6",
            viewMode === "list" && "grid-cols-1 gap-2",
          )}
        >
          {Array.from({ length: 8 }, (_, i) => (
            <div key={`product-skeleton-${i}`} className="rounded-xl border border-border/70 bg-card/85 p-0">
              <Skeleton
                className={cn(
                  "w-full rounded-t-xl",
                  viewMode === "gallery" ? "aspect-[5/4]" : "aspect-[3/4]",
                  viewMode === "list" && "h-24",
                )}
              />
              <div className="space-y-2 p-4">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-5 w-1/3" />
                <div className="flex gap-2">
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-5 w-16" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <ProductsGrid
          products={visibleProducts}
          selectedIds={selectedProductIds}
          viewMode={viewMode}
          onDuplicate={handleDuplicate}
          onDelete={handleDelete}
          onSelectionChange={handleSelectionChange}
        />
      )}
    </div>
  );
}
