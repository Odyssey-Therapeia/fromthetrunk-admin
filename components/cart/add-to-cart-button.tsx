"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { resolveMediaURL } from "@/lib/media/resolve-media-url";
import { useCartStore } from "@/lib/store/cart-store";

interface AddToCartButtonProps {
  product: any;
}

export function AddToCartButton({ product }: AddToCartButtonProps) {
  const addItem = useCartStore((state) => state.addItem);
  const [added, setAdded] = useState(false);
  const image = resolveMediaURL(product.images?.[0]) ?? "";

  useEffect(() => {
    if (!added) return;
    const timer = setTimeout(() => setAdded(false), 2000);
    return () => clearTimeout(timer);
  }, [added]);

  return (
    <Button
      className="w-full rounded-full py-6"
      onClick={() => {
        addItem({
          id: product.id,
          name: product.name,
          price: product.price ?? 0,
          image,
        });
        setAdded(true);
      }}
    >
      {added ? "Added to Bag" : "Add to Bag"}
    </Button>
  );
}
