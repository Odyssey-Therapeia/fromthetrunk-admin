"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { resolveMediaURL } from "@/lib/media/resolve-media-url";
import { useCartStore } from "@/lib/store/cart-store";
import type { Product, StockStatus } from "@/types/payload-types";

interface AddToCartButtonProps {
  product: Product;
}

const stockLabels: Record<StockStatus, string> = {
  available: "Add to Bag",
  reserved: "Reserved",
  sold: "Sold",
};

export function AddToCartButton({ product }: AddToCartButtonProps) {
  const addItem = useCartStore((state) => state.addItem);
  const hasItem = useCartStore((state) => state.hasItem);
  const [added, setAdded] = useState(false);
  const image = resolveMediaURL(product.images?.[0]) ?? "";
  const inCart = hasItem(product.id);

  const stockStatus: StockStatus = product.stockStatus ?? "available";
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
          price: product.price ?? 0,
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
