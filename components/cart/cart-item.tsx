"use client";

import Image from "next/image";
import { Minus, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/formatters";
import { CartItem as CartItemType, useCartStore } from "@/lib/store/cart-store";

interface CartItemProps {
  item: CartItemType;
}

export function CartItem({ item }: CartItemProps) {
  const removeItem = useCartStore((state) => state.removeItem);
  const updateQuantity = useCartStore((state) => state.updateQuantity);

  return (
    <div className="flex gap-4 border-b border-border/60 pb-4">
      <div className="relative h-24 w-20 overflow-hidden rounded-2xl bg-muted">
        {item.image ? (
          <Image src={item.image} alt={item.name} fill className="object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            No image
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-serif text-base text-foreground">{item.name}</p>
            <p className="text-xs text-muted-foreground">
              {formatCurrency(item.price)}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground"
            onClick={() => removeItem(item.id)}
            aria-label={`Remove ${item.name}`}
            title={`Remove ${item.name}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => updateQuantity(item.id, item.quantity - 1)}
            aria-label={`Decrease quantity for ${item.name}`}
            title={`Decrease quantity for ${item.name}`}
          >
            <Minus className="h-4 w-4" />
          </Button>
          <span className="min-w-[24px] text-center text-sm">
            {item.quantity}
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={() => updateQuantity(item.id, item.quantity + 1)}
            aria-label={`Increase quantity for ${item.name}`}
            title={`Increase quantity for ${item.name}`}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
