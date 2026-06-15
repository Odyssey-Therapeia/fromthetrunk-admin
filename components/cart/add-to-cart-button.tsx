"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { resolveMediaURL } from "@/lib/media/resolve-media-url";
import { useLiveProductStock } from "@/lib/realtime/use-live-product-stock";
import { useCartStore } from "@/lib/store/cart-store";
import type { Product, StockStatus } from "@/types/domain";

interface AddToCartButtonProps {
  product: Product;
  /**
   * P4-05: optional flag-gated override for the initial stock status.
   * When isInventoryV2() is ON, the PDP passes effectiveStockStatus (derived
   * from quantity_available + active reservations) so the button's buyability
   * reflects v2 availability, not the raw stockStatus column.
   * When absent (flag OFF), falls back to product.stockStatus — byte-identical
   * to the pre-P4-05 behavior.
   */
  initialStatus?: StockStatus;
}

const stockLabels: Record<StockStatus, string> = {
  available: "Add to Bag",
  reserved: "Reserved",
  sold: "Sold",
};

export function AddToCartButton({ product, initialStatus }: AddToCartButtonProps) {
  const addItem = useCartStore((state) => state.addItem);
  const hasItem = useCartStore((state) => state.hasItem);
  const [added, setAdded] = useState(false);
  const image = resolveMediaURL(product.images?.[0]) ?? "";
  const inCart = hasItem(product.id);

  const { stockStatus } = useLiveProductStock({
    // P4-05: use effectiveStockStatus when flag ON; fall back to product.stockStatus (flag OFF).
    initialStatus: (initialStatus ?? product.stockStatus) as StockStatus,
    productId: product.id,
    productSlug: product.slug,
  });
  const isBuyable = stockStatus === "available" && !inCart;

  useEffect(() => {
    if (!added) return;
    const timer = setTimeout(() => setAdded(false), 2000);
    return () => clearTimeout(timer);
  }, [added]);

  if (stockStatus === "sold") {
    return (
      <Button className="w-full rounded-full py-6" disabled>
        Sold
      </Button>
    );
  }

  if (stockStatus === "reserved" && !inCart) {
    return (
      <Button className="w-full rounded-full py-6" disabled>
        Reserved by another buyer
      </Button>
    );
  }

  if (inCart) {
    return (
      <Button className="w-full rounded-full py-6" disabled>
        Already in your bag
      </Button>
    );
  }

  return (
    <Button
      className="w-full rounded-full py-6"
      disabled={!isBuyable}
      onClick={() => {
        addItem({
          id: product.id,
          name: product.name,
          price: product.pricePaise / 100,
          image,
        });
        setAdded(true);
        toast.success(`${product.name} added to your bag`);
      }}
    >
      {added ? "Added to Bag" : stockLabels[stockStatus]}
    </Button>
  );
}
