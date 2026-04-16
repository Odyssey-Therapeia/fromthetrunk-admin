import { ProductCard } from "./product-card";
import type { ProductListItem } from "@/lib/hooks/use-products";

type ProductsGridProps = {
  products: ProductListItem[];
  onDuplicate?: (id: string) => void;
  onDelete?: (id: string) => void;
};

export function ProductsGrid({ products, onDuplicate, onDelete }: ProductsGridProps) {
  if (products.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border/70 bg-background/70 p-8 text-center">
        <p className="text-sm text-muted-foreground">
          No products match your filters.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
      {products.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
