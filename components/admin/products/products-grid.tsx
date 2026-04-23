import { ProductCard, ProductListRow } from "./product-card";
import type { ProductListItem } from "@/lib/hooks/use-products";
import { cn } from "@/lib/utils";

import type { ProductViewMode } from "./types";

type ProductsGridProps = {
  products: ProductListItem[];
  selectedIds?: Set<string>;
  viewMode: ProductViewMode;
  onDuplicate?: (id: string) => void;
  onDelete?: (id: string) => void;
  onSelectionChange?: (id: string, selected: boolean) => void;
};

export function ProductsGrid({
  products,
  selectedIds,
  viewMode,
  onDuplicate,
  onDelete,
  onSelectionChange,
}: ProductsGridProps) {
  if (products.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border/70 bg-background/70 p-8 text-center">
        <p className="text-sm text-muted-foreground">
          No products match your filters.
        </p>
      </div>
    );
  }

  if (viewMode === "list") {
    return (
      <div className="space-y-2">
        <div className="hidden grid-cols-[auto_72px_minmax(220px,1fr)_130px_140px_132px] gap-3 px-3 text-[11px] uppercase tracking-[0.18em] text-muted-foreground md:grid">
          <span />
          <span>Cover</span>
          <span>Product</span>
          <span>Status</span>
          <span>Price / Photos</span>
          <span className="text-right">Actions</span>
        </div>
        {products.map((product) => (
          <ProductListRow
            key={product.id}
            product={product}
            isSelected={selectedIds?.has(product.id) ?? false}
            onDuplicate={onDuplicate}
            onDelete={onDelete}
            onSelectionChange={onSelectionChange}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "grid",
        viewMode === "gallery" && "grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3",
        viewMode === "cards" && "grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4",
        viewMode === "compact" &&
          "grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-7",
      )}
    >
      {products.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          isSelected={selectedIds?.has(product.id) ?? false}
          mode={viewMode}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
          onSelectionChange={onSelectionChange}
        />
      ))}
    </div>
  );
}
