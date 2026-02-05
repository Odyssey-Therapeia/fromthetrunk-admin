"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Saree } from "@/lib/data/sarees";
import { useCartStore } from "@/lib/store/cart-store";

interface AddToCartButtonProps {
  saree: Saree;
}

export function AddToCartButton({ saree }: AddToCartButtonProps) {
  const addItem = useCartStore((state) => state.addItem);
  const [added, setAdded] = useState(false);

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
          id: saree.id,
          name: saree.name,
          price: saree.price,
          image: saree.images[0],
        });
        setAdded(true);
      }}
    >
      {added ? "Added to Bag" : "Add to Bag"}
    </Button>
  );
}
