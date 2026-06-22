"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  Download,
  Eye,
  EyeOff,
  FolderPlus,
  FolderMinus,
  ImageOff,
  Package,
  Sparkles,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
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
    throw new Error(
      await readApiErrorMessage(response, "Failed to delete product."),
    );
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
        const aHasCover = a.coverImageFilename ? 1 : 0;
        const bHasCover = b.coverImageFilename ? 1 : 0;
        return aHasCover - bHasCover || a.name.localeCompare(b.name);
      });
    default:
      return next.sort((a, b) => toCreatedAtTime(b) - toCreatedAtTime(a));
  }
};

/**
 * P4-06: Inline tag-ID input inside a DropdownMenu item.
 * Accepts comma-separated tag IDs (integers) and calls onApply when submitted.
 */
function BulkTagMenuItem({
  label,
  op,
  onApply,
}: {
  label: string;
  op: "add" | "remove";
  onApply: (tagIds: number[], op: "add" | "remove") => void;
}) {
  const [value, setValue] = useState("");

  const handleApply = (e: React.FormEvent) => {
    e.preventDefault();
    const ids = value
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !Number.isNaN(n) && n > 0);
    if (ids.length === 0) return;
    onApply(ids, op);
    setValue("");
  };

  return (
    <form
      onSubmit={handleApply}
      onClick={(e) => e.stopPropagation()}
      className="flex flex-col gap-1.5 px-2 py-2"
    >
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex gap-1.5">
        <Input
          className="h-7 text-xs"
          placeholder="e.g. 1,2,3"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <Button
          size="sm"
          type="submit"
          variant="secondary"
          className="h-7 shrink-0 rounded-md px-2 text-xs"
        >
          Apply
        </Button>
      </div>
    </form>
  );
}

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
    <div className="flex min-w-33 items-center gap-3 rounded-xl border border-border/70 bg-background/70 px-3 py-2 shadow-sm">
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

type CollectionSummary = { id: string; name: string; slug: string };

const fetchCollections = async (): Promise<CollectionSummary[]> => {
  const res = await fetch("/api/v2/collections");
  if (!res.ok) return [];
  const data = (await res.json()) as CollectionSummary[];
  return Array.isArray(data) ? data : [];
};

export default function AdminProductsPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [stockStatus, setStockStatus] = useState("all");
  const [imageFilter, setImageFilter] = useState<ImageFilter>("all");
  const [sort, setSort] = useState<AdminProductSort>(DEFAULT_PRODUCT_SORT);
  const [viewMode, setViewMode] = useState<ProductViewMode>("cards");
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [isBulkEditing, setIsBulkEditing] = useState(false);
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(
    () => new Set(),
  );
  const queryClient = useQueryClient();

  // P4-06: fetch collections for bulk collection controls (lazy — only when selection active)
  const { data: collectionsData } = useQuery({
    queryKey: ["admin", "collections-list"],
    queryFn: fetchCollections,
    staleTime: 5 * 60 * 1000,
  });

  // Guard against duplicate click-throughs
  const duplicatingRef = useRef<Set<string>>(new Set());

  const {
    data: products,
    isLoading,
    refetch,
  } = useProducts({
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
      return baseProducts.filter((product) => !product.coverImageFilename);
    }
    return baseProducts;
  }, [baseProducts, imageFilter]);
  const visibleProducts = useMemo(
    () => sortProducts(imageFilteredProducts, sort),
    [imageFilteredProducts, sort],
  );
  const stats = useMemo(
    () => ({
      drafts: baseProducts.filter((product) => product.status === "draft")
        .length,
      missingCover: baseProducts.filter(
        (product) => !product.coverImageFilename,
      ).length,
      published: baseProducts.filter(
        (product) => product.status === "published",
      ).length,
      total: baseProducts.length,
    }),
    [baseProducts],
  );
  const visibleProductIds = useMemo(
    () => new Set(visibleProducts.map((product) => product.id)),
    [visibleProducts],
  );

  // `selectedProductIds` holds the user's raw intent (every product they've ticked).
  // The *effective* selection is that set intersected with what's currently visible.
  // We DERIVE it during render rather than pruning selection state inside an effect:
  //   - removes the "setState inside an effect → cascading render" warning, and
  //   - makes selections sticky across search/filter/sort changes (a product you
  //     selected, then filtered out of view, then bring back is still selected).
  // Every consumer below (count, bulk ops, export, grid) reads the EFFECTIVE set so
  // that actions always match the count shown in the toolbar.
  const effectiveSelectedIds = useMemo(() => {
    const next = new Set<string>();
    for (const id of selectedProductIds) {
      if (visibleProductIds.has(id)) next.add(id);
    }
    return next;
  }, [selectedProductIds, visibleProductIds]);

  const selectedCount = effectiveSelectedIds.size;
  const allVisibleSelected =
    visibleProducts.length > 0 &&
    visibleProducts.every((product) => selectedProductIds.has(product.id));

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
      const productName = visibleProducts.find(
        (product) => product.id === id,
      )?.name;
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

  const handleBulkDelete = useCallback(async () => {
    if (effectiveSelectedIds.size === 0) return;

    const ids = Array.from(effectiveSelectedIds);
    const selectedProducts = visibleProducts.filter((product) =>
      effectiveSelectedIds.has(product.id),
    );
    const confirmMessage =
      ids.length === 1
        ? `Delete ${selectedProducts[0]?.name ?? "this product"}?`
        : `Delete ${ids.length} selected products?`;

    if (!confirm(confirmMessage)) return;

    setIsBulkDeleting(true);
    removeProductsFromCurrentCache(ids);
    setSelectedProductIds(new Set());

    const results = await Promise.allSettled(
      ids.map((id) => deleteProductById(id)),
    );
    const failed = results.filter(
      (result) => result.status === "rejected",
    ).length;
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
  }, [
    queryClient,
    refetch,
    removeProductsFromCurrentCache,
    effectiveSelectedIds,
    visibleProducts,
  ]);

  const handleExport = useCallback(
    async (selectionOnly = false) => {
      try {
        // Use the real CSV export route (P4-06) which includes attributes + tags + collections
        let url = "/api/v2/products/export.csv?includeDrafts=true";
        if (selectionOnly && effectiveSelectedIds.size > 0) {
          url += `&productIds=${Array.from(effectiveSelectedIds).join(",")}`;
        }
        const res = await fetch(url);
        if (!res.ok) throw new Error("Export failed");
        const csv = await res.text();

        const blob = new Blob([csv], { type: "text/csv" });
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = objectUrl;
        a.download = "ftt-products-export.csv";
        a.click();
        URL.revokeObjectURL(objectUrl);
        toast.success("Products exported");
      } catch {
        toast.error("Export failed");
      }
    },
    [effectiveSelectedIds],
  );

  const handleBulkSetStatus = useCallback(
    async (newStatus: "draft" | "published") => {
      if (effectiveSelectedIds.size === 0) return;

      const ids = Array.from(effectiveSelectedIds);
      setIsBulkEditing(true);

      try {
        const res = await fetch("/api/v2/products/bulk-edit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productIds: ids, status: newStatus }),
        });
        if (!res.ok)
          throw new Error(await readApiErrorMessage(res, "Bulk edit failed"));
        const data = (await res.json()) as { updated: number; failed: number };
        if (data.failed > 0) {
          toast.warning(`Updated ${data.updated}; ${data.failed} failed`);
        } else {
          toast.success(
            `${data.updated} product${data.updated === 1 ? "" : "s"} set to ${newStatus}`,
          );
        }
        void queryClient.invalidateQueries({
          queryKey: ["admin", "products"],
          exact: false,
        });
        clearSelection();
      } catch {
        toast.error("Bulk status update failed");
      } finally {
        setIsBulkEditing(false);
      }
    },
    [effectiveSelectedIds, queryClient, clearSelection],
  );

  /** P4-06: Bulk add/remove products from a collection. */
  const handleBulkCollectionOp = useCallback(
    async (collectionId: string, op: "add" | "remove") => {
      if (effectiveSelectedIds.size === 0) return;
      const ids = Array.from(effectiveSelectedIds);
      setIsBulkEditing(true);
      try {
        const body =
          op === "add"
            ? { productIds: ids, addCollectionId: collectionId }
            : { productIds: ids, removeCollectionId: collectionId };
        const res = await fetch("/api/v2/products/bulk-edit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok)
          throw new Error(
            await readApiErrorMessage(res, "Bulk collection update failed"),
          );
        const data = (await res.json()) as { updated: number; failed: number };
        if (data.failed > 0) {
          toast.warning(
            `Collection updated for ${data.updated}; ${data.failed} failed`,
          );
        } else {
          toast.success(
            `${data.updated} product${data.updated === 1 ? "" : "s"} ${op === "add" ? "added to" : "removed from"} collection`,
          );
        }
        void queryClient.invalidateQueries({
          queryKey: ["admin", "products"],
          exact: false,
        });
        clearSelection();
      } catch {
        toast.error("Bulk collection update failed");
      } finally {
        setIsBulkEditing(false);
      }
    },
    [effectiveSelectedIds, queryClient, clearSelection],
  );

  /** P4-06: Bulk add/remove tags by tag IDs for all selected products. */
  const handleBulkTagOp = useCallback(
    async (tagIds: number[], op: "add" | "remove") => {
      if (effectiveSelectedIds.size === 0 || tagIds.length === 0) return;
      const ids = Array.from(effectiveSelectedIds);
      setIsBulkEditing(true);
      try {
        const body =
          op === "add"
            ? { productIds: ids, addTagIds: tagIds }
            : { productIds: ids, removeTagIds: tagIds };
        const res = await fetch("/api/v2/products/bulk-edit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok)
          throw new Error(
            await readApiErrorMessage(res, "Bulk tag update failed"),
          );
        const data = (await res.json()) as { updated: number; failed: number };
        if (data.failed > 0) {
          toast.warning(
            `Tags updated for ${data.updated}; ${data.failed} failed`,
          );
        } else {
          toast.success(
            `Tags ${op === "add" ? "added to" : "removed from"} ${data.updated} product${data.updated === 1 ? "" : "s"}`,
          );
        }
        void queryClient.invalidateQueries({
          queryKey: ["admin", "products"],
          exact: false,
        });
        clearSelection();
      } catch {
        toast.error("Bulk tag update failed");
      } finally {
        setIsBulkEditing(false);
      }
    },
    [effectiveSelectedIds, queryClient, clearSelection],
  );

  return (
    <div className="@container space-y-5">
      <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/80 shadow-sm">
        <div className="flex flex-col gap-5 p-5 @5xl:flex-row @5xl:items-end @5xl:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">
              Catalog
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">
              Products
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Manage your saree catalog.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 @3xl:grid-cols-4">
            <StatPill
              icon={Package}
              label="Shown"
              value={visibleProducts.length}
            />
            <StatPill
              icon={CheckCircle2}
              label="Live"
              value={stats.published}
            />
            <StatPill icon={Sparkles} label="Draft" value={stats.drafts} />
            <StatPill
              icon={ImageOff}
              label="No Cover"
              value={stats.missingCover}
            />
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
        onExport={() => void handleExport(false)}
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
              {/* Export selection */}
              <Button
                onClick={() => void handleExport(true)}
                size="sm"
                type="button"
                variant="outline"
                className="gap-1.5 rounded-lg"
              >
                <Download className="h-3.5 w-3.5" />
                Export
              </Button>
              {/* Bulk status change */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    disabled={isBulkEditing}
                    size="sm"
                    type="button"
                    variant="secondary"
                    className="gap-1.5 rounded-lg"
                  >
                    {isBulkEditing ? "Updating..." : "Set status"}
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => void handleBulkSetStatus("published")}
                    className="gap-2"
                  >
                    <Eye className="h-4 w-4 text-green-600" />
                    Publish selected
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => void handleBulkSetStatus("draft")}
                    className="gap-2"
                  >
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                    Set to draft
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </DropdownMenuContent>
              </DropdownMenu>
              {/* P4-06: Bulk collection add/remove */}
              {(collectionsData?.length ?? 0) > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      disabled={isBulkEditing}
                      size="sm"
                      type="button"
                      variant="outline"
                      className="gap-1.5 rounded-lg"
                    >
                      <FolderPlus className="h-3.5 w-3.5" />
                      Collection
                      <ChevronDown className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="max-h-60 overflow-y-auto"
                  >
                    {collectionsData?.map((col) => (
                      <div key={col.id}>
                        <DropdownMenuItem
                          data-testid={`bulk-add-collection-${col.id}`}
                          onClick={() =>
                            void handleBulkCollectionOp(col.id, "add")
                          }
                          className="gap-2"
                        >
                          <FolderPlus className="h-4 w-4 text-green-600" />
                          Add to {col.name}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          data-testid={`bulk-remove-collection-${col.id}`}
                          onClick={() =>
                            void handleBulkCollectionOp(col.id, "remove")
                          }
                          className="gap-2"
                        >
                          <FolderMinus className="h-4 w-4 text-muted-foreground" />
                          Remove from {col.name}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                      </div>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              {/* P4-06: Bulk tag add/remove (by numeric tag ID) */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    disabled={isBulkEditing}
                    size="sm"
                    type="button"
                    variant="outline"
                    className="gap-1.5 rounded-lg"
                  >
                    <Tag className="h-3.5 w-3.5" />
                    Tags
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <BulkTagMenuItem
                    label="Add tag IDs"
                    op="add"
                    onApply={handleBulkTagOp}
                  />
                  <DropdownMenuSeparator />
                  <BulkTagMenuItem
                    label="Remove tag IDs"
                    op="remove"
                    onApply={handleBulkTagOp}
                  />
                </DropdownMenuContent>
              </DropdownMenu>
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
            viewMode === "gallery" &&
              "grid-cols-1 gap-5 md:grid-cols-2 2xl:grid-cols-3",
            viewMode === "cards" &&
              "grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4",
            viewMode === "compact" &&
              "grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6",
            viewMode === "list" && "grid-cols-1 gap-2",
          )}
        >
          {Array.from({ length: 8 }, (_, i) => (
            <div
              key={`product-skeleton-${i}`}
              className="rounded-xl border border-border/70 bg-card/85 p-0"
            >
              <Skeleton
                className={cn(
                  "w-full rounded-t-xl",
                  viewMode === "gallery" ? "aspect-5/4" : "aspect-3/4",
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
          selectedIds={effectiveSelectedIds}
          viewMode={viewMode}
          onDuplicate={handleDuplicate}
          onDelete={handleDelete}
          onSelectionChange={handleSelectionChange}
        />
      )}
    </div>
  );
}
